import { useCallback, useState } from "react";

export type ExecutionEnvironmentMode = "sandbox" | "local";

const STORAGE_KEY = "qwenpaw.chat.execution_sandbox_enabled";

function readStoredMode(): ExecutionEnvironmentMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "false") return "local";
    if (stored === "true") return "sandbox";
  } catch {
    // ignore storage errors
  }
  return "sandbox";
}

export function useExecutionEnvironment() {
  const [mode, setModeState] = useState<ExecutionEnvironmentMode>(readStoredMode);

  const setMode = useCallback((next: ExecutionEnvironmentMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next === "sandbox"));
    } catch {
      // ignore storage errors
    }
  }, []);

  return {
    mode,
    sandboxEnabled: mode === "sandbox",
    setMode,
  };
}
