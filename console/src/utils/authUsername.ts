import { AUTH_USER_KEY, getApiToken } from "../api/config";

export interface JwtPayload {
  username?: string;
  sub?: string;
}

/** 从 JWT payload 解析当前登录用户名（展示用） */
export function getDisplayUsernameFromToken(): string {
  const payload = parseJwtPayload();
  if (!payload) return "Admin";
  return payload.username || payload.sub || "Admin";
}

/** 是否为 JWT 格式 token（三段 base64） */
export function isJwtToken(token?: string): boolean {
  const t = token ?? getApiToken();
  return Boolean(t && t.split(".").length === 3);
}

export function parseJwtPayload(token?: string): JwtPayload | null {
  const raw = token ?? getApiToken();
  if (!raw || !isJwtToken(raw)) return null;
  try {
    const parts = raw.split(".");
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as JwtPayload;
    return payload;
  } catch {
    return null;
  }
}

/** Sandbox/chat user key: JWT numeric sub, or legacy username in sub. */
export function getAuthenticatedUserKeyFromToken(token?: string): string | null {
  const payload = parseJwtPayload(token);
  if (!payload) return null;
  const sub = payload.sub?.trim();
  if (sub) return sub;
  const username = payload.username?.trim();
  return username || null;
}

export function getStoredAuthenticatedUserKey(): string | null {
  try {
    const stored = localStorage.getItem(AUTH_USER_KEY);
    return stored?.trim() || null;
  } catch {
    return null;
  }
}

export function syncAuthenticatedUserKeyFromToken(token?: string): string | null {
  const key = getAuthenticatedUserKeyFromToken(token);
  if (!key) return null;
  try {
    localStorage.setItem(AUTH_USER_KEY, key);
  } catch {
    /* ignore storage errors */
  }
  if (typeof window !== "undefined") {
    window.currentUserId = key;
  }
  return key;
}

export function clearAuthenticatedUserKey(): void {
  try {
    localStorage.removeItem(AUTH_USER_KEY);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.currentUserId = undefined;
  }
}

/** Effective chat/sandbox user id sent to backend. */
export function getEffectiveUserId(fallback = "default"): string {
  return (
    getStoredAuthenticatedUserKey() ||
    (typeof window !== "undefined" ? window.currentUserId : undefined) ||
    fallback
  );
}
