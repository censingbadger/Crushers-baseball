import { describe, expect, it } from "vitest";
import { decodeSession, encodeSession } from "./session";

describe("session cookies", () => {
  it("round-trips a valid session", () => {
    const token = encodeSession({ userId: "u1", expiresAt: Date.now() + 10_000 });
    const decoded = decodeSession(token);
    expect(decoded?.userId).toBe("u1");
  });

  it("rejects tampered tokens", () => {
    const token = encodeSession({ userId: "u1", expiresAt: Date.now() + 10_000 });
    const [body, mac] = [token.slice(0, token.lastIndexOf(".")), token.slice(token.lastIndexOf(".") + 1)];
    const forgedBody = Buffer.from(
      JSON.stringify({ userId: "someone-else", expiresAt: Date.now() + 10_000 }),
    ).toString("base64url");
    expect(decodeSession(`${forgedBody}.${mac}`)).toBeNull();
    expect(decodeSession(`${body}.AAAA${mac.slice(4)}`)).toBeNull();
  });

  it("rejects expired sessions", () => {
    const token = encodeSession({ userId: "u1", expiresAt: Date.now() - 1 });
    expect(decodeSession(token)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(decodeSession(undefined)).toBeNull();
    expect(decodeSession("")).toBeNull();
    expect(decodeSession("abc")).toBeNull();
    expect(decodeSession("abc.def")).toBeNull();
  });
});
