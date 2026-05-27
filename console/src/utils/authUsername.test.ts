import { describe, it, expect, beforeEach } from "vitest";
import {
  getAuthenticatedUserKeyFromToken,
  getEffectiveUserId,
  syncAuthenticatedUserKeyFromToken,
} from "./authUsername";
import { AUTH_USER_KEY } from "../api/config";

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${header}.${body}.signature`;
}

describe("getAuthenticatedUserKeyFromToken", () => {
  it("returns numeric sub for JWT tokens", () => {
    const token = makeJwt({ sub: "117", username: "alice" });
    expect(getAuthenticatedUserKeyFromToken(token)).toBe("117");
  });

  it("falls back to username when sub is missing", () => {
    const token = makeJwt({ username: "admin" });
    expect(getAuthenticatedUserKeyFromToken(token)).toBe("admin");
  });
});

describe("syncAuthenticatedUserKeyFromToken", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists user key and updates window.currentUserId", () => {
    const token = makeJwt({ sub: "118", username: "bob" });
    expect(syncAuthenticatedUserKeyFromToken(token)).toBe("118");
    expect(localStorage.getItem(AUTH_USER_KEY)).toBe("118");
    expect(window.currentUserId).toBe("118");
    expect(getEffectiveUserId("default")).toBe("118");
  });
});
