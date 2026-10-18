"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiRequestError, getDemoSession, getState } from "@/lib/api/client";
import type { StateResponse } from "@/lib/shared/api-contract";

export type LiveStatus = "checking" | "signed-out" | "authenticated" | "unavailable";

interface LiveBackend {
  status: LiveStatus;
  /** True when the prompt is shown because a session ran out, not on first load. */
  sessionExpired: boolean;
  /** Latest GET /api/state; null until loaded or after the connection drops. */
  snapshot: StateResponse | null;
  /** Real-world time of the last successful GET /api/state. */
  updatedAt: Date | null;
  /** A non-background refresh is in flight. */
  loading: boolean;
  /** Last refresh failure that did not end the session or the connection. */
  error: string | null;
  recheck: () => void;
  signedIn: () => void;
  /** Refetches GET /api/state. `quiet` skips the loading state and yields to a request already in flight. */
  refresh: (options?: { quiet?: boolean }) => Promise<void>;
  onSessionExpired: () => void;
  onBackendUnavailable: () => void;
}

const LiveBackendContext = createContext<LiveBackend | null>(null);

export function useLiveBackend(): LiveBackend {
  const live = useContext(LiveBackendContext);
  if (!live) throw new Error("useLiveBackend must be used inside <LiveBackendProvider>");
  return live;
}

/**
 * Connection to the optional live backend, shared by the access gate, the
 * queue panel and the driver check-in form. When the backend is unreachable
 * or not configured, status is "unavailable" and the dashboard keeps running
 * on local synthetic state.
 */
export function LiveBackendProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LiveStatus>("checking");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  const [snapshot, setSnapshot] = useState<StateResponse | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getDemoSession(controller.signal).then(
      (session) => setStatus(session.authenticated ? "authenticated" : "signed-out"),
      () => {
        if (!controller.signal.aborted) setStatus("unavailable");
      },
    );
    return () => controller.abort();
  }, [checkCount]);

  useEffect(() => () => inflight.current?.abort(), []);

  const disconnect = useCallback((next: LiveStatus) => {
    inflight.current?.abort();
    inflight.current = null;
    setSnapshot(null);
    setUpdatedAt(null);
    setError(null);
    setLoading(false);
    setStatus(next);
  }, []);

  const onSessionExpired = useCallback(() => {
    setSessionExpired(true);
    disconnect("signed-out");
  }, [disconnect]);

  const onBackendUnavailable = useCallback(() => disconnect("unavailable"), [disconnect]);

  const recheck = useCallback(() => {
    setStatus("checking");
    setCheckCount((n) => n + 1);
  }, []);

  const signedIn = useCallback(() => {
    setSessionExpired(false);
    setStatus("authenticated");
  }, []);

  const refresh = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      if (quiet && inflight.current) return;
      inflight.current?.abort();
      const controller = new AbortController();
      inflight.current = controller;
      if (!quiet) setLoading(true);
      try {
        const next = await getState(controller.signal);
        if (controller.signal.aborted) return;
        setSnapshot(next);
        setUpdatedAt(new Date());
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiRequestError && err.status === 401) return onSessionExpired();
        if (err instanceof ApiRequestError && err.backendUnavailable) return onBackendUnavailable();
        setError(err instanceof Error ? err.message : "Could not load the recovery queue.");
      } finally {
        if (inflight.current === controller) {
          inflight.current = null;
          setLoading(false);
        }
      }
    },
    [onSessionExpired, onBackendUnavailable],
  );

  return (
    <LiveBackendContext
      value={{
        status,
        sessionExpired,
        snapshot,
        updatedAt,
        loading,
        error,
        recheck,
        signedIn,
        refresh,
        onSessionExpired,
        onBackendUnavailable,
      }}
    >
      {children}
    </LiveBackendContext>
  );
}
