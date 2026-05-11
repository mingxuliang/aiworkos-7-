# 用户管理页面接口文档

本文档描述了项目中的用户管理相关接口。除特殊说明外，这些接口均需要 `admin` 权限。

## 1. 获取所有用户
获取系统中注册的所有用户列表。

- **URL**: `/api/auth/jwt/users`
- **方法**: `GET`
- **响应体**: `list[UserOut]`
  | 参数名 | 类型 | 说明 |
  | :--- | :--- | :--- |
  | id | int | 用户 ID |
  | username | string | 用户名 |
  | is_active | boolean | 是否激活 |
  | roles | list[string] | 角色名称列表 |

## 2. 分页获取用户列表
支持分页、用户名搜索和角色过滤。

- **URL**: `/api/auth/jwt/users/paginated`
- **方法**: `GET`
- **查询参数**:
  | 参数名 | 类型 | 必填 | 说明 |
  | :--- | :--- | :--- | :--- |
  | page | int | 否 | 页码 (默认 1) |
  | page_size | int | 否 | 每页数量 (默认 10) |
  | username | string | 否 | 用户名过滤关键字 |
  | role | string | 否 | 角色名过滤关键字 |
- **响应体 (PaginatedUserOut)**:
  | 参数名 | 类型 | 说明 |
  | :--- | :--- | :--- |
  | items | list[UserOut] | 用户列表 |
  | total | int | 总记录数 |
  | page | int | 当前页码 |
  | page_size | int | 每页大小 |
  | total_pages | int | 总页数 |

## 3. 创建用户
由管理员手动创建新用户。

- **URL**: `/api/auth/jwt/users/create`
- **方法**: `POST`
- **请求体 (UserCreateRequest)**:
  | 参数名 | 类型 | 必填 | 说明 |
  | :--- | :--- | :--- | :--- |
  | username | string | 是 | 用户名 |
  | password | string | 是 | 密码 |
  | role_names | list[string] | 否 | 初始角色列表 |
- **响应体**: `UserOut`

## 4. 删除用户
根据 ID 删除指定用户。

- **URL**: `/api/auth/jwt/users/{user_id}`
- **方法**: `DELETE`

## 5. 批量删除用户
根据 ID 列表批量删除用户。

- **URL**: `/api/auth/jwt/users/batch-delete`
- **方法**: `POST`
- **请求体**:
  | 参数名 | 类型 | 必填 | 说明 |
  | :--- | :--- | :--- | :--- |
  | user_ids | list[int] | 是 | 要删除的用户 ID 列表 |

## 6. 重置用户密码
管理员重置指定用户的密码。

- **URL**: `/api/auth/jwt/users/{user_id}/reset-password`
- **方法**: `PUT`
- **请求体**:
  | 参数名 | 类型 | 必填 | 说明 |
  | :--- | :--- | :--- | :--- |
  | new_password | string | 是 | 新密码 |

## 7. 修改用户角色
替换指定用户的所有角色。

- **URL**: `/api/auth/jwt/users/{user_id}/roles`
- **方法**: `PUT`
- **请求体 (JWTAssignRolesRequest)**:
  | 参数名 | 类型 | 必填 | 说明 |
  | :--- | :--- | :--- | :--- |
  | role_ids | list[int] | 是 | 新的角色 ID 列表 |
