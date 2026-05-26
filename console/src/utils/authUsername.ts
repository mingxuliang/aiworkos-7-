import { getApiToken } from "../api/config";

/** 从 JWT payload 解析当前登录用户名（与服务器 Header 一致） */
export function getDisplayUsernameFromToken(): string {
  const token = getApiToken();
  if (!token) return "Admin";
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return "Admin";
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { username?: string; sub?: string };
    return payload.username || payload.sub || "Admin";
  } catch {
    return "Admin";
  }
}

/** 是否为 JWT 格式 token（三段 base64） */
export function isJwtToken(token?: string): boolean {
  const t = token ?? getApiToken();
  return Boolean(t && t.split(".").length === 3);
}
