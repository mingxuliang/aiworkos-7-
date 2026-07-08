import { describe, it, expect, beforeEach } from "vitest";
import { getApiUrl, getApiToken, setAuthToken, clearAuthToken } from "./config";

// VITE_API_BASE_URL / TOKEN are declared globals in config.ts — set via globalThis
const setViteBase = (v: string) => {
  (globalThis as any).VITE_API_BASE_URL = v;
};
const setToken = (v: string) => {
  (globalThis as any).TOKEN = v;
};

const LOCAL_KEY = "qwenpaw_auth_token";
const SESSION_KEY = "qwenpaw_auth_token_session";

describe("getApiUrl", () => {
  beforeEach(() => setViteBase(""));

  it("prepends /api prefix when base is empty", () => {
    expect(getApiUrl("/models")).toBe("/api/models");
  });

  it("auto-prepends / when path does not start with /", () => {
    expect(getApiUrl("models")).toBe("/api/models");
  });

  it("correctly concatenates when base URL is set", () => {
    setViteBase("http://localhost:8088");
    expect(getApiUrl("/models")).toBe("http://localhost:8088/api/models");
  });

  it("correctly handles nested paths", () => {
    expect(getApiUrl("/models/openai/config")).toBe(
      "/api/models/openai/config",
    );
  });
});

describe("getApiToken", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setToken("");
  });

  it("returns token from localStorage when present", () => {
    localStorage.setItem(LOCAL_KEY, "stored-token");
    expect(getApiToken()).toBe("stored-token");
  });

  it("prefers sessionStorage over localStorage", () => {
    localStorage.setItem(LOCAL_KEY, "local-token");
    sessionStorage.setItem(SESSION_KEY, "session-token");
    expect(getApiToken()).toBe("session-token");
  });

  it("falls back to TOKEN global variable when storage has no token", () => {
    setToken("build-time-token");
    expect(getApiToken()).toBe("build-time-token");
  });

  it("returns empty string when neither is set", () => {
    expect(getApiToken()).toBe("");
  });
});

describe("setAuthToken / clearAuthToken", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("setAuthToken writes to localStorage when remember is true", () => {
    setAuthToken("my-token", true);
    expect(localStorage.getItem(LOCAL_KEY)).toBe("my-token");
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("setAuthToken writes to sessionStorage when remember is false", () => {
    setAuthToken("my-token", false);
    expect(sessionStorage.getItem(SESSION_KEY)).toBe("my-token");
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
  });

  it("clearAuthToken removes token from both storages", () => {
    localStorage.setItem(LOCAL_KEY, "my-token");
    sessionStorage.setItem(SESSION_KEY, "session-token");
    clearAuthToken();
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("getApiToken returns empty string after clearAuthToken", () => {
    setToken("");
    setAuthToken("my-token", true);
    clearAuthToken();
    expect(getApiToken()).toBe("");
  });
});
