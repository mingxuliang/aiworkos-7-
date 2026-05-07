declare const VITE_API_BASE_URL: string;
declare const TOKEN: string;

const AUTH_TOKEN_KEY = "qwenpaw_auth_token";
const AUTH_MODE_KEY = "qwenpaw_auth_mode";

/**
 * Get the full API URL with /api prefix
 * @param path - API path (e.g., "/models", "/skills")
 * @returns Full API URL (e.g., "http://localhost:8088/api/models" or "/api/models")
 */
export function getApiUrl(path: string): string {
  const base = VITE_API_BASE_URL || "";
  const apiPrefix = "/api";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${apiPrefix}${normalizedPath}`;
}

/**
 * Get the API token - checks localStorage first (auth login),
 * then falls back to the build-time TOKEN constant.
 * @returns API token string or empty string
 */
export function getApiToken(): string {
  const stored = localStorage.getItem(AUTH_TOKEN_KEY);
  if (stored) return stored;
  return typeof TOKEN !== "undefined" ? TOKEN : "";
}

/**
 * Store the auth token in localStorage after login.
 */
export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

/**
 * Remove the auth token from localStorage (logout / 401).
 */
export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_MODE_KEY);
}

/**
 * Get the current auth mode ("jwt" or "legacy").
 * Defaults to "legacy" if not set.
 */
export function getAuthMode(): string {
  return localStorage.getItem(AUTH_MODE_KEY) || "legacy";
}

/**
 * Store the auth mode in localStorage after detection.
 */
export function setAuthMode(mode: string): void {
  localStorage.setItem(AUTH_MODE_KEY, mode);
}

/**
 * Remove the auth mode from localStorage.
 */
export function clearAuthMode(): void {
  localStorage.removeItem(AUTH_MODE_KEY);
}
