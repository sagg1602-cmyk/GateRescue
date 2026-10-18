import { DemoSessionRequestSchema, type DemoSessionResponse } from "@/lib/shared/api-contract";
import {
  clearDemoSessionCookie,
  createSessionToken,
  getDemoSession,
  isValidAccessCode,
  setDemoSessionCookie,
} from "@/server/auth/demo-session";
import { handleUnexpectedError, isSameOrigin, json, jsonError, parseJsonBody } from "@/server/http";

/** GET /api/demo-session — is the caller's session valid? */
export async function GET() {
  try {
    const session = await getDemoSession();
    return json<DemoSessionResponse>({
      authenticated: Boolean(session),
      expiresAt: session ? session.expiresAt.toISOString() : null,
    });
  } catch (error) {
    return handleUnexpectedError("GET /api/demo-session", error);
  }
}

/** POST /api/demo-session — exchange the demo access code for a session cookie. */
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return jsonError(403, "forbidden_origin", "Cross-origin requests are not allowed");
    }
    const parsed = await parseJsonBody(request, DemoSessionRequestSchema);
    if ("response" in parsed) return parsed.response;

    if (!isValidAccessCode(parsed.data.accessCode)) {
      return jsonError(401, "invalid_access_code", "Access code is incorrect");
    }
    const { token, expiresAt } = createSessionToken();
    await setDemoSessionCookie(token, expiresAt);
    return json<DemoSessionResponse>({ authenticated: true, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    return handleUnexpectedError("POST /api/demo-session", error);
  }
}

/** DELETE /api/demo-session — sign out. */
export async function DELETE(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return jsonError(403, "forbidden_origin", "Cross-origin requests are not allowed");
    }
    await clearDemoSessionCookie();
    return json<DemoSessionResponse>({ authenticated: false, expiresAt: null });
  } catch (error) {
    return handleUnexpectedError("DELETE /api/demo-session", error);
  }
}
