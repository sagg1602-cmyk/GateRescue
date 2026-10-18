import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDemoSessionEnv } from "../env";

/**
 * Demo session: a dispatcher exchanges the shared DEMO_ACCESS_CODE for an
 * HttpOnly, SameSite=Strict cookie holding an HMAC-signed expiry. The server
 * verifies the signature on every protected request. Stateless by design —
 * rotate DEMO_SESSION_SECRET to revoke all sessions.
 */

export const DEMO_SESSION_COOKIE = "gr_demo_session";
export const DEMO_SESSION_TTL_SECONDS = 8 * 60 * 60;
const TOKEN_VERSION = "v1";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Constant-time comparison against DEMO_ACCESS_CODE (hashed first so lengths match). */
export function isValidAccessCode(candidate: string): boolean {
  const { DEMO_ACCESS_CODE, DEMO_SESSION_SECRET } = getDemoSessionEnv();
  return safeEqual(sign(candidate, DEMO_SESSION_SECRET), sign(DEMO_ACCESS_CODE, DEMO_SESSION_SECRET));
}

export function createSessionToken(nowMs: number = Date.now()): { token: string; expiresAt: Date } {
  const { DEMO_SESSION_SECRET } = getDemoSessionEnv();
  const expiresAt = new Date(nowMs + DEMO_SESSION_TTL_SECONDS * 1000);
  const payload = `${TOKEN_VERSION}.${expiresAt.getTime()}`;
  return { token: `${payload}.${sign(payload, DEMO_SESSION_SECRET)}`, expiresAt };
}

/** Returns the expiry if the token is authentic and unexpired, otherwise null. */
export function verifySessionToken(token: string | undefined, nowMs: number = Date.now()): Date | null {
  if (!token) return null;
  const [version, expiry, signature, ...rest] = token.split(".");
  if (rest.length || version !== TOKEN_VERSION || !expiry || !signature) return null;
  const { DEMO_SESSION_SECRET } = getDemoSessionEnv();
  if (!safeEqual(signature, sign(`${version}.${expiry}`, DEMO_SESSION_SECRET))) return null;
  const expiresMs = Number(expiry);
  return Number.isFinite(expiresMs) && expiresMs > nowMs ? new Date(expiresMs) : null;
}

export async function getDemoSession(): Promise<{ expiresAt: Date } | null> {
  const store = await cookies();
  const expiresAt = verifySessionToken(store.get(DEMO_SESSION_COOKIE)?.value);
  return expiresAt ? { expiresAt } : null;
}

export async function setDemoSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(DEMO_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearDemoSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_SESSION_COOKIE);
}
