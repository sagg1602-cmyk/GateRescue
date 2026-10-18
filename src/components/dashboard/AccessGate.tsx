"use client";

import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ApiRequestError, getDemoSession, startDemoSession } from "@/lib/api/client";
import { Button, Panel } from "./ui";

type GateStatus = "checking" | "signed-out" | "authenticated" | "unavailable";

interface AccessGateControls {
  /** Call on a 401 from a protected endpoint: shows the access-code prompt again. */
  onSessionExpired: () => void;
  /** Call on a 503 or network error: falls back to the local demo banner. */
  onBackendUnavailable: () => void;
}

const AccessGateContext = createContext<AccessGateControls | null>(null);

export function useAccessGate(): AccessGateControls {
  const controls = useContext(AccessGateContext);
  if (!controls) throw new Error("useAccessGate must be used inside <AccessGate>");
  return controls;
}

/**
 * Guards live-backend content. Renders `children` only with a valid demo
 * session; otherwise asks for the access code. When the backend is down or not
 * configured it shows a banner instead, and the local synthetic demo carries on
 * untouched. The access code is typed by the dispatcher and never stored here
 * beyond the input field.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GateStatus>("checking");
  const [checkCount, setCheckCount] = useState(0);
  const [expired, setExpired] = useState(false);

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

  const recheck = () => {
    setStatus("checking");
    setCheckCount((n) => n + 1);
  };

  const controls = useMemo<AccessGateControls>(
    () => ({
      onSessionExpired: () => {
        setExpired(true);
        setStatus("signed-out");
      },
      onBackendUnavailable: () => setStatus("unavailable"),
    }),
    [],
  );

  if (status === "checking") {
    return (
      <p role="status" className="mb-5 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-500">
        Checking the live backend…
      </p>
    );
  }

  if (status === "unavailable") {
    return (
      <div
        role="status"
        className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900"
      >
        <p>
          <span className="font-semibold">Live backend unavailable, showing local synthetic demo.</span>{" "}
          Everything below runs in this browser only.
        </p>
        <Button size="sm" onClick={recheck}>
          Retry
        </Button>
      </div>
    );
  }

  if (status === "signed-out") {
    return (
      <AccessCodePrompt
        expired={expired}
        onAuthenticated={() => {
          setExpired(false);
          setStatus("authenticated");
        }}
        onUnavailable={() => setStatus("unavailable")}
      />
    );
  }

  return <AccessGateContext value={controls}>{children}</AccessGateContext>;
}

function AccessCodePrompt({
  expired,
  onAuthenticated,
  onUnavailable,
}: {
  expired: boolean;
  onAuthenticated: () => void;
  onUnavailable: () => void;
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code) return;
    setSubmitting(true);
    setError(null);
    try {
      await startDemoSession({ accessCode: code });
      setCode("");
      onAuthenticated();
    } catch (err) {
      if (err instanceof ApiRequestError && err.backendUnavailable) {
        onUnavailable();
        return;
      }
      setError(
        err instanceof ApiRequestError && err.code === "invalid_access_code"
          ? "Access code is incorrect."
          : err instanceof Error
            ? err.message
            : "Could not start a session.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Panel
      className="mb-5"
      title="Live recovery queue"
      subtitle={
        expired
          ? "Your session expired. Enter the demo access code again to reload the backend queue."
          : "Enter the demo access code from the backend owner to load the backend's ranked queue. The local demo below works without it."
      }
    >
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 px-5 py-4">
        <label className="flex min-w-64 flex-col gap-1 text-xs font-medium text-slate-600">
          Access code
          <input
            type="password"
            name="accessCode"
            autoComplete="off"
            required
            maxLength={200}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "access-code-error" : undefined}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </label>
        <Button type="submit" variant="primary" disabled={submitting || !code}>
          {submitting ? "Checking…" : "Connect"}
        </Button>
        {error && (
          <p id="access-code-error" role="alert" className="w-full text-xs text-red-700">
            {error}
          </p>
        )}
      </form>
    </Panel>
  );
}
