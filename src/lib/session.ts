import { createHmac, timingSafeEqual } from "node:crypto";

// Minimal signed-cookie session: base64url(JSON payload) + "." + HMAC.
// No external auth service — volunteer-proof, and swappable later if needed.

const DEFAULT_DEV_SECRET = "crushers-blue-dev-secret-change-in-prod";

function secret(): string {
  return process.env.AUTH_SECRET ?? DEFAULT_DEV_SECRET;
}

export interface SessionPayload {
  userId: string;
  expiresAt: number; // epoch ms
  /** Must match users.sessionEpoch — bumping it invalidates old cookies. */
  epoch?: number;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(body);
  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expected);
  if (macBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(macBuf, expectedBuf)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (typeof payload.userId !== "string") return null;
    if (typeof payload.expiresAt !== "number") return null;
    if (payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "cb_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
