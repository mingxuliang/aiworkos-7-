import { useMemo } from "react";
import { getApiToken } from "../api/config";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // Base64url to Base64.
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Returns the roles list from the current JWT token (client-side decode, no API call). */
export function useCurrentUserRoles(): string[] {
  return useMemo(() => {
    const token = getApiToken();
    if (!token) return [];
    const payload = decodeJwtPayload(token);
    if (!payload) return [];
    const roles = payload["roles"];
    if (Array.isArray(roles)) return roles as string[];
    return [];
  }, []);
}

/** Returns true when the current user has the "admin" role. */
export function useIsAdmin(): boolean {
  const roles = useCurrentUserRoles();
  return roles.includes("admin");
}
