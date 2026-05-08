import { getApiUrl } from "../config";
import { buildAuthHeaders } from "../authHeaders";
import { request } from "../request";

// ── Legacy Auth types ──────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  username: string;
  message?: string;
}

export interface AuthStatusResponse {
  enabled: boolean;
  has_users: boolean;
}

// ── JWT Auth types ────────────────────────────────────────────────

export interface JWTLoginResponse {
  token: string;
  username: string;
  roles: string[];
}

export interface JWTStatusResponse {
  mode: string;
  enabled: boolean;
}

export interface JWTVerifyResponse {
  valid: boolean;
  username: string;
  roles: string[];
}

export interface JWTUserOut {
  id: number;
  username: string;
  is_active: boolean;
  roles: string[];
}

export interface JWTRoleOut {
  id: number;
  name: string;
  description: string;
  permissions: string[];
}

export interface JWTPermissionOut {
  id: number;
  code: string;
  description: string;
}

export interface PaginatedUserResponse {
  items: JWTUserOut[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UserCreateParams {
  username: string;
  password: string;
  role_names: string[];
}

export interface ImportResultResponse {
  created: number;
  errors: string[];
}

// ── Legacy Auth API ──────────────────────────────────────────────

export const authApi = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const res = await fetch(getApiUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Login failed");
    }
    return res.json();
  },

  register: async (
    username: string,
    password: string,
  ): Promise<LoginResponse> => {
    const res = await fetch(getApiUrl("/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Registration failed");
    }
    return res.json();
  },

  getStatus: async (): Promise<AuthStatusResponse> => {
    const res = await fetch(getApiUrl("/auth/status"));
    if (!res.ok) throw new Error("Failed to check auth status");
    return res.json();
  },

  updateProfile: async (
    currentPassword: string,
    newUsername?: string,
    newPassword?: string,
  ): Promise<LoginResponse> => {
    const token = localStorage.getItem("qwenpaw_auth_token") || "";
    const res = await fetch(getApiUrl("/auth/update-profile"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_username: newUsername || null,
        new_password: newPassword || null,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Update failed");
    }
    return res.json();
  },
};

// ── JWT Auth API ────────────────────────────────────────────────

export const jwtAuthApi = {
  login: (username: string, password: string) =>
    request<JWTLoginResponse>("/auth/jwt/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  register: (username: string, password: string) =>
    request<JWTLoginResponse>("/auth/jwt/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  getStatus: () => request<JWTStatusResponse>("/auth/jwt/status"),

  logout: () =>
    request<{ message: string }>("/auth/jwt/logout", { method: "POST" }),

  verify: () =>
    request<JWTVerifyResponse>("/auth/jwt/verify", { method: "POST" }),

  changePassword: (old_password: string, new_password: string) =>
    request<{ message: string }>("/auth/jwt/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password, new_password }),
    }),

  // Admin endpoints
  listUsers: () => request<JWTUserOut[]>("/auth/jwt/users"),

  deleteUser: (id: number) =>
    request<{ message: string }>(`/auth/jwt/users/${id}`, {
      method: "DELETE",
    }),

  assignRoles: (userId: number, roleIds: number[]) =>
    request<{ message: string }>(`/auth/jwt/users/${userId}/roles`, {
      method: "PUT",
      body: JSON.stringify({ role_ids: roleIds }),
    }),

  listRoles: () => request<JWTRoleOut[]>("/auth/jwt/roles"),

  listPermissions: () =>
    request<JWTPermissionOut[]>("/auth/jwt/permissions"),

  // User management page endpoints (admin only)
  listUsersPaginated: (params: {
    page?: number;
    page_size?: number;
    username?: string;
    role?: string;
  }) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.page_size) query.set("page_size", String(params.page_size));
    if (params.username) query.set("username", params.username);
    if (params.role) query.set("role", params.role);
    const qs = query.toString();
    return request<PaginatedUserResponse>(
      `/auth/jwt/users/paginated${qs ? `?${qs}` : ""}`,
    );
  },

  createUser: (params: UserCreateParams) =>
    request<JWTUserOut>("/auth/jwt/users/create", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  batchDeleteUsers: (userIds: number[]) =>
    request<{ message: string }>("/auth/jwt/users/batch-delete", {
      method: "POST",
      body: JSON.stringify({ user_ids: userIds }),
    }),

  resetUserPassword: (userId: number, newPassword: string) =>
    request<{ message: string }>(`/auth/jwt/users/${userId}/reset-password`, {
      method: "PUT",
      body: JSON.stringify({ new_password: newPassword }),
    }),

  importUsers: async (file: File): Promise<ImportResultResponse> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(getApiUrl("/auth/jwt/users/import"), {
      method: "POST",
      headers: buildAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Import failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return await response.json();
  },
};
