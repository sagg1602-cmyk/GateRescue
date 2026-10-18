/**
 * Browser wrappers for the backend API (docs/backend-contract.md). Same-origin
 * requests with the default credentials mode, so the HttpOnly session cookie
 * set by POST /api/demo-session is sent automatically.
 */

import type {
  ApiErrorCode,
  ApiErrorResponse,
  DemoSessionRequest,
  DemoSessionResponse,
  DriverReportRequest,
  DriverReportResponse,
  StateResponse,
} from "@/lib/shared/api-contract";

/** Client-side failures that never reach the API's error format. */
export type ClientErrorCode = "network_error" | "unexpected_response";

export class ApiRequestError extends Error {
  constructor(
    /** HTTP status; 0 when the request never got a response. */
    readonly status: number,
    readonly code: ApiErrorCode | ClientErrorCode,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }

  /** True when the live backend cannot be used and the local demo should take over. */
  get backendUnavailable(): boolean {
    return this.status === 0 || this.status === 503;
  }
}

function isApiErrorResponse(body: unknown): body is ApiErrorResponse {
  const error = (body as ApiErrorResponse | null)?.error;
  return typeof error?.code === "string" && typeof error.message === "string";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", ...init });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiRequestError(0, "network_error", "Could not reach the backend");
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiRequestError(res.status, "unexpected_response", `Unexpected response from ${path} (HTTP ${res.status})`);
  }

  if (!res.ok) {
    if (isApiErrorResponse(body)) {
      throw new ApiRequestError(res.status, body.error.code, body.error.message, body.error.fields);
    }
    throw new ApiRequestError(res.status, "unexpected_response", `Request to ${path} failed (HTTP ${res.status})`);
  }
  return body as T;
}

function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

/** GET /api/demo-session — never 401; tells whether to show the access-code prompt. */
export function getDemoSession(signal?: AbortSignal): Promise<DemoSessionResponse> {
  return request<DemoSessionResponse>("/api/demo-session", { signal });
}

/** POST /api/demo-session — exchanges the dispatcher-entered code for a session cookie. */
export function startDemoSession(body: DemoSessionRequest, signal?: AbortSignal): Promise<DemoSessionResponse> {
  return postJson<DemoSessionResponse>("/api/demo-session", body, signal);
}

/** GET /api/state — operational snapshot, including the ranked recovery queue. */
export function getState(signal?: AbortSignal): Promise<StateResponse> {
  return request<StateResponse>("/api/state", { signal });
}

/**
 * POST /api/driver-reports. Generate `providerEventId` once per submission
 * (crypto.randomUUID()) and reuse it on retry so the server can deduplicate.
 */
export function postDriverReport(body: DriverReportRequest, signal?: AbortSignal): Promise<DriverReportResponse> {
  return postJson<DriverReportResponse>("/api/driver-reports", body, signal);
}
