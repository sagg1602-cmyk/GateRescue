/**
 * Retell request signature verification (custom functions and webhooks).
 *
 * Retell sends `X-Retell-Signature: v=<unix ms>,d=<hex HMAC-SHA256>`, where
 * the digest is HMAC-SHA256(key = the Retell API key with the webhook badge,
 * message = raw request body + timestamp). Requests older or newer than five
 * minutes are rejected (replay protection). This mirrors `Retell.verify` in
 * the official retell-sdk (src/lib/webhook_auth.ts) and
 * https://docs.retellai.com/features/secure-webhook, without the dependency.
 *
 * Always verify the exact raw body; re-serialized JSON will not match.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const RETELL_SIGNATURE_HEADER = "x-retell-signature";
export const RETELL_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

const SIGNATURE = /^v=(\d+),d=([0-9a-f]{64})$/i;

export function verifyRetellSignature(
  rawBody: string,
  apiKey: string,
  signatureHeader: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!signatureHeader || !apiKey) return false;
  const match = SIGNATURE.exec(signatureHeader.trim());
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowMs - timestamp) > RETELL_SIGNATURE_MAX_AGE_MS) return false;
  const expected = createHmac("sha256", apiKey).update(rawBody + match[1]).digest();
  const provided = Buffer.from(match[2], "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/** Produces a signature in Retell's format. For tests and local tooling only. */
export function signRetellBody(rawBody: string, apiKey: string, timestampMs: number = Date.now()): string {
  return `v=${timestampMs},d=${createHmac("sha256", apiKey).update(rawBody + timestampMs).digest("hex")}`;
}
