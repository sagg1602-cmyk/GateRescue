"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ApiRequestError, startDemoSession } from "@/lib/api/client";
import { useLiveBackend } from "./LiveBackendContext";
import { Button, Panel, Skeleton } from "./ui";

/**
 * Guards live-backend content. Renders `children` only with a valid demo
 * session; otherwise asks for the access code. When the backend is down or not
 * configured it shows a banner instead, and the local synthetic demo carries on
 * untouched. The access code is typed by the dispatcher and never stored here
 * beyond the input field.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const { status, sessionExpired, recheck, signedIn, onBackendUnavailable } = useLiveBackend();

  if (status === "checking") {
    return (
      <div role="status" className="flex items-center gap-4 rounded-card border border-line bg-white px-6 py-4 shadow-card">
        <Skeleton className="h-4 w-40" />
        <span className="text-sm text-ink-muted">Checking the live backend…</span>
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div
        role="status"
        className="flex items-center justify-between gap-4 rounded-card border border-awaiting/30 bg-awaiting-soft px-6 py-4 text-sm text-awaiting"
      >
        <p>
          <span className="font-semibold">Live backend unavailable, showing local synthetic demo.</span>{" "}
          Everything on this page runs in this browser only.
        </p>
        <Button size="sm" onClick={recheck}>
          Retry connection
        </Button>
      </div>
    );
  }

  if (status === "signed-out") {
    return (
      <AccessCodePrompt expired={sessionExpired} onAuthenticated={signedIn} onUnavailable={onBackendUnavailable} />
    );
  }

  return children;
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
      eyebrow="Optional"
      title="Connect the live backend"
      subtitle={
        expired
          ? "Your session expired. Enter the demo access code again to reload the backend queue."
          : "Enter the demo access code from the backend owner to load the backend's ranked queue. The local demo on this page works without it."
      }
    >
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 px-6 py-5">
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
            className="min-h-11 border border-[#8a877e] bg-white px-3 py-2 text-sm text-navy focus:border-ready focus:outline-none focus:ring-2 focus:ring-ready/30"
          />
        </label>
        <Button type="submit" variant="primary" disabled={submitting || !code}>
          {submitting ? "Checking…" : "Connect"}
        </Button>
        {error && (
          <p id="access-code-error" role="alert" className="w-full text-xs text-blocked">
            {error}
          </p>
        )}
      </form>
    </Panel>
  );
}
