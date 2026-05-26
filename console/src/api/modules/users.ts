/**
 * JWT 用户管理 API — 与服务器 console 构建产物一致
 * 路径前缀：/api/auth/jwt/users/...
 */

import { getApiUrl } from "../config";
import { buildAuthHeaders } from "../authHeaders";
import { request } from "../request";
import type {
  JwtUserOut,
  PaginatedJwtUsers,
  UserCreateBody,
  UserImportResult,
  ListUsersParams,
} from "../types/user";

export const usersApi = {
  listUsers: (params: ListUsersParams = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.page_size) qs.set("page_size", String(params.page_size));
    if (params.username) qs.set("username", params.username);
    if (params.role) qs.set("role", params.role);
    const query = qs.toString();
    return request<PaginatedJwtUsers>(
      `/auth/jwt/users/paginated${query ? `?${query}` : ""}`,
    );
  },

  createUser: (body: UserCreateBody) =>
    request<JwtUserOut>("/auth/jwt/users/create", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deleteUser: (userId: number) =>
    request<{ message: string }>(`/auth/jwt/users/${userId}`, {
      method: "DELETE",
    }),

  batchDeleteUsers: (userIds: number[]) =>
    request<{ message: string }>("/auth/jwt/users/batch-delete", {
      method: "POST",
      body: JSON.stringify({ user_ids: userIds }),
    }),

  resetPassword: (userId: number, newPassword: string) =>
    request<{ message: string }>(`/auth/jwt/users/${userId}/reset-password`, {
      method: "PUT",
      body: JSON.stringify({ new_password: newPassword }),
    }),

  assignRoles: (userId: number, roleIds: number[]) =>
    request<{ message: string }>(`/auth/jwt/users/${userId}/roles`, {
      method: "PUT",
      body: JSON.stringify({ role_ids: roleIds }),
    }),

  importUsers: async (file: File): Promise<UserImportResult> => {
    const formData = new FormData();
    formData.append("file", file);
    const url = getApiUrl("/auth/jwt/users/import");
    const response = await fetch(url, {
      method: "POST",
      headers: buildAuthHeaders(),
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const detail =
        typeof err.detail === "string" ? err.detail : "Import failed";
      throw new Error(detail);
    }
    return response.json();
  },
};
