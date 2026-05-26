/** JWT 用户管理 API 类型（与 docs/user_management_api.md 一致） */

export interface JwtUserOut {
  id: number;
  username: string;
  is_active: boolean;
  roles: string[];
  /** 部分环境在创建/更新用户时返回 */
  department_name?: string | null;
}

export interface PaginatedJwtUsers {
  items: JwtUserOut[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface JwtRoleOut {
  id: number;
  name: string;
  description: string;
  permissions: string[];
  user_count: number;
}

export interface UserCreateBody {
  username: string;
  password: string;
  role_names?: string[];
  department_id?: number;
}

export interface UserImportResult {
  created: number;
  errors: string[];
}

export interface ListUsersParams {
  page?: number;
  page_size?: number;
  username?: string;
  role?: string;
}
