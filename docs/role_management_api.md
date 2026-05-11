# 角色管理页面接口文档

本文档描述了项目中的角色与权限管理相关接口。这些接口均需要 `admin` 权限。

## 1. 获取所有角色
获取系统中的所有角色及其关联的权限和用户数量。

- **URL**: `/api/auth/jwt/roles`
- **方法**: `GET`
- **响应体**: `list[RoleOut]`
  | 参数名 | 类型 | 说明 |
  | :--- | :--- | :--- |
  | id | int | 角色 ID |
  | name | string | 角色名称 |
  | description | string | 角色描述 |
  | permissions | list[string] | 权限编码列表 |
  | user_count | int | 绑定该角色的用户数 |

## 2. 创建新角色
创建一个新的角色。

- **URL**: `/api/auth/jwt/roles/create`
- **方法**: `POST`
- **请求体 (RoleCreateRequest)**:
  | 参数名 | 类型 | 必填 | 说明 |
  | :--- | :--- | :--- | :--- |
  | name | string | 是 | 角色名称 (1-32字符) |
  | description | string | 否 | 角色描述 |
- **响应体**: `RoleOut`

## 3. 更新角色信息
更新角色的名称或描述。

- **URL**: `/api/auth/jwt/roles/{role_id}`
- **方法**: `PUT`
- **请求体 (RoleUpdateRequest)**:
  | 参数名 | 类型 | 必填 | 说明 |
  | :--- | :--- | :--- | :--- |
  | name | string | 否 | 新的角色名称 |
  | description | string | 否 | 新的角色描述 |
- **响应体**: `RoleOut`

## 4. 删除角色
删除指定角色。如果该角色下仍有用户，删除将被拒绝。

- **URL**: `/api/auth/jwt/roles/{role_id}`
- **方法**: `DELETE`

## 5. 获取权限列表
获取系统中定义的所有权限。

- **URL**: `/api/auth/jwt/permissions`
- **方法**: `GET`
- **响应体**: `list[PermissionOut]`
  | 参数名 | 类型 | 说明 |
  | :--- | :--- | :--- |
  | id | int | 权限 ID |
  | code | string | 权限编码 |
  | description | string | 权限描述 |
