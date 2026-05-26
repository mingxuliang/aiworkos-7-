import { request } from "../request";
import type { JwtRoleOut } from "../types/user";

export interface RoleCreateBody {
  name: string;
  description?: string;
}

export interface RoleUpdateBody {
  name?: string;
  description?: string;
}

/** JWT 角色管理（用户管理页下拉用） */
export const jwtRolesApi = {
  listRoles: () => request<JwtRoleOut[]>("/auth/jwt/roles"),

  listPermissions: () =>
    request<Array<{ id: number; code: string; description: string }>>(
      "/auth/jwt/permissions",
    ),

  createRole: (body: RoleCreateBody) =>
    request<JwtRoleOut>("/auth/jwt/roles/create", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateRole: (roleId: number, body: RoleUpdateBody) =>
    request<JwtRoleOut>(`/auth/jwt/roles/${roleId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteRole: (roleId: number) =>
    request<{ message: string }>(`/auth/jwt/roles/${roleId}`, {
      method: "DELETE",
    }),
};
