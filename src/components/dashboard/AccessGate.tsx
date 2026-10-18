"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ApiRequestError, startDemoSession } from "@/lib/api/client";
import { useLiveBackend } from "./LiveBackendContext";
import { Button, Panel } from "./ui";

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
