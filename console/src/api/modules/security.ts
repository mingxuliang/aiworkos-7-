import { request } from "../request";

export interface ToolGuardRule {
  id: string;
  tools: string[];
  params: string[];
  category: string;
  severity: string;
  patterns: string[];
  exclude_patterns: string[];
  description: string;
  remediation: string;
}

export interface ToolGuardConfig {
  enabled: boolean;
  guarded_tools: string[] | null;
  denied_tools: string[];
  custom_rules: ToolGuardRule[];
  disabled_rules: string[];
  auto_denied_rules: string[];
  shell_evasion_checks: Record<string, boolean>;
}

// ── File Guard types ──────────────────────────────────────────────

export interface FileGuardResponse {
  enabled: boolean;
  paths: string[];
}

export interface FileGuardUpdateBody {
  enabled?: boolean;
  paths?: string[];
}

// ── Skill Scanner types ────────────────────────────────────────────

export interface SkillScannerWhitelistEntry {
  skill_name: string;
  content_hash: string;
  added_at: string;
}

export type SkillScannerMode = "block" | "warn" | "off";

export interface SkillScannerConfig {
  mode: SkillScannerMode;
  timeout: number;
  whitelist: SkillScannerWhitelistEntry[];
}

export interface BlockedSkillFinding {
  severity: string;
  title: string;
  description: string;
  file_path: string;
  line_number: number | null;
  rule_id: string;
}

export interface BlockedSkillRecord {
  skill_name: string;
  blocked_at: string;
  max_severity: string;
  findings: BlockedSkillFinding[];
  content_hash: string;
  action: "blocked" | "warned";
}

export interface SecurityScanErrorResponse {
  type: "security_scan_failed";
  detail: string;
  skill_name: string;
  max_severity: string;
  findings: BlockedSkillFinding[];
}

// ── Allow No Auth Hosts types ──────────────────────────────────────

export interface AllowNoAuthHostsResponse {
  hosts: string[];
}

export interface AllowNoAuthHostsUpdateBody {
  hosts: string[];
}

export type ExecutionSandboxBackend = "off" | "local" | "docker";
export type ExecutionSandboxFallbackBackend = "off" | "local";
export type ExecutionSandboxDockerNetwork = "none" | "bridge";

export interface ExecutionSandboxConfig {
  enabled: boolean;
  backend: ExecutionSandboxBackend;
  use_user_subdir: boolean;
  fail_closed: boolean;
  fallback_backend: ExecutionSandboxFallbackBackend;
  docker_image: string;
  docker_network: ExecutionSandboxDockerNetwork;
  docker_memory: string;
  docker_cpus: string;
  docker_pids_limit: number;
  docker_timeout_seconds: number;
  skill_sandbox_enforcement: "off" | "warn" | "strict";
  auto_tag_risky_skills: boolean;
  session_container_enabled: boolean;
  session_idle_seconds: number;
  session_max_containers: number;
}

export interface SessionContainerInfo {
  session_key: string;
  container_id: string;
  container_name: string;
  sandbox_root: string;
  idle_for: number;
  created_at: number;
}

export interface SessionContainersStatus {
  enabled: boolean;
  active_count: number;
  idle_seconds: number;
  max_containers: number;
  containers: SessionContainerInfo[];
}

export interface ExecutionSandboxStatus {
  effective_enabled: boolean;
  effective_backend: string;
  docker_available: boolean;
  docker_image_present: boolean;
  docker_image: string;
  env_enabled: string | null;
  env_backend: string | null;
  session_containers: SessionContainersStatus;
}

export const securityApi = {
  // ── Tool Guard ──────────────────────────────────────────────────

  getToolGuard: () => request<ToolGuardConfig>("/config/security/tool-guard"),

  updateToolGuard: (body: ToolGuardConfig) =>
    request<ToolGuardConfig>("/config/security/tool-guard", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  getBuiltinRules: () =>
    request<ToolGuardRule[]>("/config/security/tool-guard/builtin-rules"),

  // ── File Guard ─────────────────────────────────────────────────

  getFileGuard: () => request<FileGuardResponse>("/config/security/file-guard"),

  updateFileGuard: (body: FileGuardUpdateBody) =>
    request<FileGuardResponse>("/config/security/file-guard", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  // ── Skill Scanner ───────────────────────────────────────────────

  getSkillScanner: () =>
    request<SkillScannerConfig>("/config/security/skill-scanner"),

  updateSkillScanner: (body: SkillScannerConfig) =>
    request<SkillScannerConfig>("/config/security/skill-scanner", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  getBlockedHistory: () =>
    request<BlockedSkillRecord[]>(
      "/config/security/skill-scanner/blocked-history",
    ),

  clearBlockedHistory: () =>
    request<{ cleared: boolean }>(
      "/config/security/skill-scanner/blocked-history",
      { method: "DELETE" },
    ),

  removeBlockedEntry: (index: number) =>
    request<{ removed: boolean }>(
      `/config/security/skill-scanner/blocked-history/${index}`,
      { method: "DELETE" },
    ),

  addToWhitelist: (skillName: string, contentHash: string = "") =>
    request<{ whitelisted: boolean; skill_name: string }>(
      "/config/security/skill-scanner/whitelist",
      {
        method: "POST",
        body: JSON.stringify({
          skill_name: skillName,
          content_hash: contentHash,
        }),
      },
    ),

  removeFromWhitelist: (skillName: string) =>
    request<{ removed: boolean; skill_name: string }>(
      `/config/security/skill-scanner/whitelist/${encodeURIComponent(
        skillName,
      )}`,
      { method: "DELETE" },
    ),

  // ── Allow No Auth Hosts ─────────────────────────────────────────

  getAllowNoAuthHosts: () =>
    request<AllowNoAuthHostsResponse>("/config/security/allow-no-auth-hosts"),

  updateAllowNoAuthHosts: (body: AllowNoAuthHostsUpdateBody) =>
    request<AllowNoAuthHostsResponse>("/config/security/allow-no-auth-hosts", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  // ── Execution Sandbox ───────────────────────────────────────────

  getExecutionSandbox: () =>
    request<ExecutionSandboxConfig>("/config/security/execution-sandbox"),

  updateExecutionSandbox: (body: ExecutionSandboxConfig) =>
    request<ExecutionSandboxConfig>("/config/security/execution-sandbox", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  getExecutionSandboxStatus: () =>
    request<ExecutionSandboxStatus>(
      "/config/security/execution-sandbox/status",
    ),

  destroySessionContainer: (sessionKey: string) =>
    request<{ destroyed: boolean }>(
      `/config/security/execution-sandbox/session-containers/${encodeURIComponent(sessionKey)}`,
      { method: "DELETE" },
    ),
};
