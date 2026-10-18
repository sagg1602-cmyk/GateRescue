import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import type { ApiErrorCode, ApiErrorResponse } from "@/lib/shared/api-contract";
import { getDemoSession } from "./auth/demo-session";
import { DatasetIncompleteError } from "./db/operations-repository";
import { MissingConfigurationError } from "./env";

export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  fields?: Record<string, string[]>,
): Response {
  const body: ApiErrorResponse = { error: { code, message, ...(fields ? { fields } : {}) } };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * CSRF defense for cookie-authenticated mutations (in addition to the
 * SameSite=Strict cookie): when a browser sends an Origin header, it must
 * match the host serving the API.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Parses a JSON body against a schema; returns the data or an error Response. */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.output<T> } | { response: Response }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { response: jsonError(415, "unsupported_media_type", "Content-Type must be application/json") };
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: jsonError(400, "invalid_request", "Body is not valid JSON") };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length ? issue.path.join(".") : "_";
      (fields[key] ??= []).push(issue.message);
    }
    return { response: jsonError(400, "invalid_request", "Request body failed validation", fields) };
  }
  return { data: result.data };
}

/** Returns an error Response when the request lacks a valid demo session. */
export async function requireDemoSession(
  request: Request,
  { mutation }: { mutation: boolean },
): Promise<Response | null> {
  if (mutation && !isSameOrigin(request)) {
    return jsonError(403, "forbidden_origin", "Cross-origin requests are not allowed");
  }
  if (!(await getDemoSession())) {
    return jsonError(401, "unauthenticated", "A valid demo session is required. POST /api/demo-session first.");
  }
  return null;
}

/** Maps unexpected errors to safe responses; logs details server-side only. */
export function handleUnexpectedError(route: string, error: unknown): Response {
  // Let Next.js internal control-flow errors (e.g. prerender bail-out on cookies()) propagate.
  unstable_rethrow(error);
  if (error instanceof MissingConfigurationError) {
    // Variable names only — never values.
    console.error(`[${route}] ${error.message}`);
    return jsonError(503, "backend_not_configured", "The backend is not configured on this deployment.");
  }
  if (error instanceof DatasetIncompleteError) {
    console.error(`[${route}] ${error.message}`);
    return jsonError(503, "dataset_incomplete", error.message);
  }
  console.error(`[${route}] unexpected error`, error instanceof Error ? error.message : error);
  return jsonError(500, "internal_error", "Unexpected server error");
}
