# JWT 认证接口文档

本文档描述了项目中的 JWT 认证相关接口。所有接口均以 `/api/auth/jwt` 为前缀。
用户登陆成功后，所有请求都需要在 Header 中携带 `Authorization: Bearer <token>`

## 1. 用户登录
认证并获取 JWT 访问令牌。
管理员用户登录凭证：sdgh/sdgh666

- **URL**: `/api/auth/jwt/login`
- **方法**: `POST`
- **请求体**:
  | 参数名 | 类型 | 必填 | 说明 |
  | :--- | :--- | :--- | :--- |
  | username | string | 是 | 用户名 |
  | password | string | 是 | 密码 |
- **响应体 (JWTLoginResponse)**:
  | 参数名 | 类型 | 说明 |
  | :--- | :--- | :--- |
  | token | string | JWT 访问令牌 |
  | username | string | 用户名 |
  | roles | list[string] | 用户拥有的角色列表 |

## 2. 用户注册
注册新用户。第一个注册的用户将自动获得 `admin` 角色。

- **URL**: `/api/auth/jwt/register`
- **方法**: `POST`
- **请求体**:
  | 参数名 | 类型 | 必填 | 说明 |
  | :--- | :--- | :--- | :--- |
  | username | string | 是 | 用户名 (2-64字符) |
  | password | string | 是 | 密码 (至少6位) |
  | role_names | list[string] | 否 | 角色名称列表 (默认为 ["user"]) |
- **响应体**: 同登录接口 (JWTLoginResponse)。

## 3. 认证状态检查
检查 JWT 认证模式是否启用。

- **URL**: `/api/auth/jwt/status`
- **方法**: `GET`
- **响应体**:
  | 参数名 | 类型 | 说明 |
  | :--- | :--- | :--- |
  | mode | string | 当前认证模式 |
  | enabled | boolean | 是否启用 JWT |

## 4. 用户登出
注销当前用户，将当前令牌加入黑名单。

- **URL**: `/api/auth/jwt/logout`
- **方法**: `POST`
- **说明**: 需要在 Header 中携带 `Authorization: Bearer <token>`。

## 5. 令牌校验
校验当前 Bearer 令牌是否仍然有效。

- **URL**: `/api/auth/jwt/verify`
- **方法**: `POST`
- **响应体**:
  | 参数名 | 类型 | 说明 |
  | :--- | :--- | :--- |
  | valid | boolean | 是否有效 |
  | username | string | 用户名 |
  | roles | list[string] | 角色列表 |

## 6. 修改密码
修改当前登录用户的密码。

- **URL**: `/api/auth/jwt/change-password`
- **方法**: `POST`
- **请求体**:
  | 参数名 | 类型 | 必填 | 说明 |
  | :--- | :--- | :--- | :--- |
  | new_password | string | 是 | 新密码 (至少6位) |
  | new_password_repeat | string | 是 | 重复新密码 (至少6位) |
