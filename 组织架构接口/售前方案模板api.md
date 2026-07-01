# 售前PPT模板库 API 文档

## 概述

售前PPT模板库提供 PPT/PPTX 模板文件的上传、管理和下载能力。文件存储在 MinIO 对象存储中，数据库记录文件与 MinIO 的映射关系。

- **管理端接口**：需要 JWT 认证 + admin 角色
- **认证接口**：需要 JWT 认证（任意已登录用户）
- **公开接口**：无需认证，供内部系统直接调用

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AIWORK_MINIO_ENDPOINT` | - | MinIO 服务地址（host:port） |
| `AIWORK_MINIO_CHUNK_SIZE` | `10485760` | 分片上传阈值（10MB） |
| `AIWORK_PRESALE_MAX_FILE_SIZE` | `524288000` | 最大文件大小（500MB） |
| `AIWORK_MINIO_SESSION_TTL` | `86400` | 上传会话过期时间（秒） |
| `AIWORK_MINIO_PRESIGNED_EXPIRES` | `3600` | 预签名 URL 有效期（秒） |

---

## 一、管理端接口

所有管理端接口需要在请求头中携带有效的 JWT Token：

```
Authorization: Bearer <token>
```

且当前用户必须具备 `admin` 角色。

---

### 1.1 上传模板

上传一个 PPT/PPTX 模板文件。后端自动判断文件大小，小于 10MB 直传，大于 10MB 走分片上传（S3 Multipart Upload）。

```
POST /api/presale-templates/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

#### 请求参数

| 参数 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|------|--------|------|------|
| `file` | form-data | File | 是 | - | `.ppt` / `.pptx` | PPT 模板文件 |
| `name` | form-data | String | 是 | - | 1-256 字符，不可重复 | 模板名称 |
| `description` | form-data | String | 否 | `""` | 0-1024 字符 | 模板描述/适用场景 |

**允许的文件 MIME 类型**：

| MIME 类型 | 对应扩展名 |
|-----------|-----------|
| `application/vnd.ms-powerpoint` | `.ppt` |
| `application/vnd.openxmlformats-officedocument.presentationml.presentation` | `.pptx` |

#### 请求示例

```bash
curl -X POST http://localhost:8000/api/presale-templates/upload \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -F "file=@智慧城市方案模板.pptx" \
  -F "name=智慧城市售前方案模板" \
  -F "description=适用于智慧城市项目售前汇报场景"
```

#### 响应参数

`201 Created`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | Integer | 模板唯一 ID |
| `name` | String | 模板名称 |
| `description` | String | 模板描述 |
| `object_key` | String | MinIO 存储路径（UUID 格式） |
| `original_name` | String | 原始上传文件名 |
| `file_size` | Integer | 文件大小（字节） |
| `mime_type` | String | 文件 MIME 类型 |
| `file_hash` | String \| null | SHA256 哈希值 |
| `created_by` | Integer | 上传者用户 ID |
| `created_at` | DateTime | 创建时间（ISO 8601，UTC+8） |
| `updated_at` | DateTime | 最后更新时间（ISO 8601，UTC+8） |
| `is_deleted` | Boolean | 软删除标记（false=正常） |

#### 响应示例

```json
{
  "id": 1,
  "name": "智慧城市售前方案模板",
  "description": "适用于智慧城市项目售前汇报场景",
  "object_key": "a1b2c3d4e5f67890abcdef1234567890",
  "original_name": "智慧城市方案模板.pptx",
  "file_size": 52428800,
  "mime_type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "file_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "created_by": 1,
  "created_at": "2026-06-09T10:30:00",
  "updated_at": "2026-06-09T10:30:00",
  "is_deleted": false
}
```

#### 错误码

| 状态码 | 说明 |
|--------|------|
| `400` | 文件为空 |
| `401` | 未认证 |
| `403` | 非 admin 角色 |
| `409` | 模板名称已存在 |
| `413` | 文件超过大小限制（默认 500MB） |
| `415` | 文件格式不允许（非 PPT/PPTX） |
| `503` | MinIO 未配置或不可用 |

---

### 1.2 获取模板详情

```
GET /api/presale-templates/{template_id}
Authorization: Bearer <token>
```

#### 请求参数

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| `template_id` | path | Integer | 是 | 模板 ID |

#### 请求示例

```bash
curl http://localhost:8000/api/presale-templates/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 响应参数

`200 OK`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | Integer | 模板唯一 ID |
| `name` | String | 模板名称 |
| `description` | String | 模板描述 |
| `object_key` | String | MinIO 存储路径 |
| `original_name` | String | 原始文件名 |
| `file_size` | Integer | 文件大小（字节） |
| `mime_type` | String | 文件 MIME 类型 |
| `file_hash` | String \| null | SHA256 哈希值 |
| `created_by` | Integer | 上传者用户 ID |
| `created_at` | DateTime | 创建时间（ISO 8601，UTC+8） |
| `updated_at` | DateTime | 最后更新时间（ISO 8601，UTC+8） |
| `is_deleted` | Boolean | 软删除标记（false=正常） |

#### 响应示例

```json
{
  "id": 1,
  "name": "智慧城市售前方案模板",
  "description": "适用于智慧城市项目售前汇报场景",
  "object_key": "a1b2c3d4e5f67890abcdef1234567890",
  "original_name": "智慧城市方案模板.pptx",
  "file_size": 52428800,
  "mime_type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "file_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "created_by": 1,
  "created_at": "2026-06-09T10:30:00",
  "updated_at": "2026-06-09T10:30:00",
  "is_deleted": false
}
```

#### 错误码

| 状态码 | 说明 |
|--------|------|
| `401` | 未认证 |
| `403` | 非 admin 角色 |
| `404` | 模板不存在 |

---

### 1.3 更新模板信息

修改模板的名称和/或描述。至少提供 `name` 或 `description` 中的一个。

```
PUT /api/presale-templates/{template_id}
Content-Type: application/json
Authorization: Bearer <token>
```

#### 请求参数

| 参数 | 位置 | 类型 | 必填 | 约束 | 说明 |
|------|------|------|------|------|------|
| `template_id` | path | Integer | 是 | - | 模板 ID |
| `name` | body | String | 否 | 1-256 字符，不可重复 | 新名称 |
| `description` | body | String | 否 | 0-1024 字符 | 新描述 |

#### 请求示例

```bash
curl -X PUT http://localhost:8000/api/presale-templates/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "智慧城市售前方案模板 v2",
    "description": "2026年更新版，新增AI赋能章节"
  }'
```

#### 响应参数

`200 OK`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | Integer | 模板唯一 ID |
| `name` | String | 更新后的模板名称 |
| `description` | String | 更新后的模板描述 |
| `object_key` | String | MinIO 存储路径 |
| `original_name` | String | 原始文件名 |
| `file_size` | Integer | 文件大小（字节） |
| `mime_type` | String | 文件 MIME 类型 |
| `file_hash` | String \| null | SHA256 哈希值 |
| `created_by` | Integer | 上传者用户 ID |
| `created_at` | DateTime | 创建时间 |
| `updated_at` | DateTime | 最后更新时间（本次更新后会变化） |
| `is_deleted` | Boolean | 软删除标记 |

#### 响应示例

```json
{
  "id": 1,
  "name": "智慧城市售前方案模板 v2",
  "description": "2026年更新版，新增AI赋能章节",
  "object_key": "a1b2c3d4e5f67890abcdef1234567890",
  "original_name": "智慧城市方案模板.pptx",
  "file_size": 52428800,
  "mime_type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "file_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "created_by": 1,
  "created_at": "2026-06-09T10:30:00",
  "updated_at": "2026-06-09T14:00:00",
  "is_deleted": false
}
```

#### 错误码

| 状态码 | 说明 |
|--------|------|
| `400` | 未提供任何更新字段 |
| `401` | 未认证 |
| `403` | 非 admin 角色 |
| `404` | 模板不存在 |
| `409` | 新名称与其他模板重复 |

---

### 1.4 删除模板

软删除模板，同时清理 MinIO 中的文件对象（best-effort）。删除后 `is_deleted` 标记为 `true`，7 天后后台清理任务会硬删除数据库记录和 MinIO 文件。

```
DELETE /api/presale-templates/{template_id}
Authorization: Bearer <token>
```

#### 请求参数

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| `template_id` | path | Integer | 是 | 模板 ID |

#### 请求示例

```bash
curl -X DELETE http://localhost:8000/api/presale-templates/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 响应参数

`200 OK`

| 字段 | 类型 | 说明 |
|------|------|------|
| `message` | String | 操作结果描述 |

#### 响应示例

```json
{
  "message": "Template deleted"
}
```

#### 错误码

| 状态码 | 说明 |
|--------|------|
| `401` | 未认证 |
| `403` | 非 admin 角色 |
| `404` | 模板不存在 |

---

### 1.5 管理端模板列表

分页查询模板列表，支持模糊搜索。包含已删除的模板记录。

```
GET /api/presale-templates/list
Authorization: Bearer <token>
```

#### 请求参数

| 参数 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|------|--------|------|------|
| `search` | query | String | 否 | - | - | 按模板名称模糊搜索 |
| `page` | query | Integer | 否 | `1` | ≥ 1 | 页码 |
| `page_size` | query | Integer | 否 | `20` | 1-100 | 每页条数 |

#### 请求示例

```bash
# 第1页，每页10条，搜索名称含"智慧"的模板
curl "http://localhost:8000/api/presale-templates/list?search=智慧&page=1&page_size=10" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 响应参数

`200 OK`

| 字段 | 类型 | 说明 |
|------|------|------|
| `items` | Array\<Object\> | 模板列表 |
| `items[].id` | Integer | 模板唯一 ID |
| `items[].name` | String | 模板名称 |
| `items[].description` | String | 模板描述 |
| `items[].object_key` | String | MinIO 存储路径 |
| `items[].original_name` | String | 原始文件名 |
| `items[].file_size` | Integer | 文件大小（字节） |
| `items[].mime_type` | String | 文件 MIME 类型 |
| `items[].file_hash` | String \| null | SHA256 哈希值 |
| `items[].created_by` | Integer | 上传者用户 ID |
| `items[].created_at` | DateTime | 创建时间（ISO 8601，UTC+8） |
| `items[].updated_at` | DateTime | 最后更新时间（ISO 8601，UTC+8） |
| `items[].is_deleted` | Boolean | 软删除标记（true=已删除） |
| `total` | Integer | 符合条件的模板总数 |
| `page` | Integer | 当前页码 |
| `page_size` | Integer | 每页条数 |

#### 响应示例

```json
{
  "items": [
    {
      "id": 1,
      "name": "智慧城市售前方案模板",
      "description": "适用于智慧城市项目售前汇报场景",
      "object_key": "a1b2c3d4e5f67890abcdef1234567890",
      "original_name": "智慧城市方案模板.pptx",
      "file_size": 52428800,
      "mime_type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "file_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "created_by": 1,
      "created_at": "2026-06-09T10:30:00",
      "updated_at": "2026-06-09T10:30:00",
      "is_deleted": false
    },
    {
      "id": 3,
      "name": "政务服务数据中台方案模板",
      "description": "",
      "object_key": "b2c3d4e5f67890abcdef123456789001",
      "original_name": "政务服务中台.pptx",
      "file_size": 38400000,
      "mime_type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "file_hash": null,
      "created_by": 1,
      "created_at": "2026-06-08T15:00:00",
      "updated_at": "2026-06-08T15:00:00",
      "is_deleted": true
    }
  ],
  "total": 15,
  "page": 1,
  "page_size": 10
}
```

---

## 二、认证接口

以下接口需要 JWT 认证（任意已登录用户均可访问，不要求 admin 角色）：

```
Authorization: Bearer <token>
```

---

### 2.1 下载模板

通过模板 ID 下载文件，服务端返回 302 重定向到 MinIO 预签名 URL，浏览器或 HTTP 客户端自动跟随重定向完成文件下载。

```
GET /api/presale-templates/download/{template_id}
Authorization: Bearer <token>
```

#### 请求参数

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| `template_id` | path | Integer | 是 | 模板 ID |

#### 请求示例

```bash
# 跟随重定向直接下载文件
curl -L -O http://localhost:8000/api/presale-templates/download/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

# 仅查看重定向目标 URL（不实际下载）
curl -I http://localhost:8000/api/presale-templates/download/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 响应参数

`302 Found`

| 响应头 | 说明 |
|--------|------|
| `Location` | MinIO 预签名下载 URL |

无响应体。

#### 错误码

| 状态码 | 说明 |
|--------|------|
| `401` | 未认证 |
| `404` | 模板不存在或已删除 |
| `503` | MinIO 未配置或不可用 |

---

## 三、公开接口

公开接口**无需认证**，可被任何内部系统直接调用。请求头不需要携带 `Authorization`。

---

### 3.1 公开模板列表

返回所有未被删除的模板，每个模板附带一个 MinIO 预签名下载 URL。

> **注意**：`download_url` 为预签名 URL，有效期由 `AIWORK_MINIO_PRESIGNED_EXPIRES` 控制（默认 3600 秒）。调用方应在获取列表后尽快使用链接下载，避免过期。

```
GET /api/presale-templates/public/list
```

#### 请求参数

无。

#### 请求示例

```bash
curl http://localhost:8000/api/presale-templates/public/list
```

#### 响应参数

`200 OK`

| 字段 | 类型 | 说明 |
|------|------|------|
| `total` | Integer | 模板总数 |
| `items` | Array\<Object\> | 模板列表 |
| `items[].id` | Integer | 模板唯一 ID |
| `items[].name` | String | 模板名称 |
| `items[].description` | String | 模板描述 |
| `items[].original_name` | String | 原始文件名 |
| `items[].file_size` | Integer | 文件大小（字节） |
| `items[].download_url` | String | MinIO 预签名下载 URL（有时效性） |
| `items[].created_at` | DateTime | 创建时间（ISO 8601，UTC+8） |

#### 响应示例

```json
{
  "total": 15,
  "items": [
    {
      "id": 1,
      "name": "智慧城市售前方案模板",
      "description": "适用于智慧城市项目售前汇报场景",
      "original_name": "智慧城市方案模板.pptx",
      "file_size": 52428800,
      "download_url": "http://minio:9000/aiwork-files/a1b2c3d4e5f67890abcdef1234567890?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=minioadmin%2F20260609%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260609T103000Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=abc123...",
      "created_at": "2026-06-09T10:30:00"
    },
    {
      "id": 2,
      "name": "金融行业数字化转型方案模板",
      "description": "",
      "original_name": "金融数字化转型.pptx",
      "file_size": 41800000,
      "download_url": "http://minio:9000/aiwork-files/b2c3d4e5f67890abcdef123456789001?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=minioadmin%2F20260609%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260609T103000Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=def456...",
      "created_at": "2026-06-08T14:00:00"
    }
  ]
}
```

---

## 四、数据模型

### presale_templates 表

| 字段 | 数据库类型 | 说明 |
|------|-----------|------|
| `id` | INT | 主键，自增 |
| `name` | VARCHAR(256) | 模板名称，不可重复 |
| `description` | VARCHAR(1024) | 模板描述/适用场景，可为空 |
| `object_key` | VARCHAR(128) | MinIO 存储路径（UUID 格式），唯一 |
| `original_name` | VARCHAR(256) | 原始上传文件名 |
| `file_size` | INT | 文件大小（字节） |
| `mime_type` | VARCHAR(128) | 文件 MIME 类型 |
| `file_hash` | VARCHAR(64) | SHA256 哈希值，可为 NULL |
| `created_by` | INT | 上传者用户 ID（关联 users 表） |
| `created_at` | DATETIME | 创建时间（UTC+8） |
| `updated_at` | DATETIME | 更新时间（UTC+8），修改时自动更新 |
| `is_deleted` | TINYINT(1) | 软删除标记（0=正常, 1=已删除），默认 0 |

### presale_upload_sessions 表（内部）

跟踪进行中的分片上传会话，超时未完成会自动清理。此表不对外暴露。

| 字段 | 数据库类型 | 说明 |
|------|-----------|------|
| `id` | INT | 主键，自增 |
| `session_key` | VARCHAR(64) | 会话唯一标识（UUID） |
| `upload_id` | VARCHAR(128) | MinIO multipart upload_id |
| `object_key` | VARCHAR(128) | MinIO 存储路径 |
| `original_name` | VARCHAR(256) | 原始文件名 |
| `mime_type` | VARCHAR(128) | 文件 MIME 类型 |
| `file_hash` | VARCHAR(64) | SHA256 哈希值（上传完成后填充） |
| `uploader_id` | INT | 上传者用户 ID |
| `total_parts` | INT | 分片总数（上传完成后填充） |
| `total_size` | INT | 文件总大小（字节） |
| `uploaded_parts` | TEXT | 已上传分片列表（JSON 格式） |
| `status` | VARCHAR(16) | 状态：`uploading` / `completed` / `aborted` |
| `created_at` | DATETIME | 创建时间（UTC+8） |
| `expires_at` | DATETIME | 过期时间，超过后自动 abort |

---

## 五、后台清理机制

系统启动时自动注册后台清理任务，每 30 分钟执行一次：

| 清理项 | 触发条件 | 处理动作 |
|--------|----------|----------|
| 过期上传会话 | `status=uploading` 且 `expires_at` < 当前时间 | abort MinIO multipart upload + 标记 `status=aborted` |
| 软删除文件 | `is_deleted=1` 且 `created_at` > 7 天前 | 删除 MinIO 对象 + 硬删除数据库记录 |

> 7 天宽限期内，管理员可通过手动将 `is_deleted` 修改为 `0` 来恢复模板（MinIO 对象仍存在）。

---

## 六、错误响应格式

所有接口在出错时返回统一的 JSON 格式：

```json
{
  "detail": "错误描述信息"
}
```

### 常见错误码汇总

| 状态码 | 含义 | 常见场景 |
|--------|------|----------|
| `400` | 请求参数错误 | 空文件、未提供更新字段 |
| `401` | 未认证 | Token 缺失或无效 |
| `403` | 无权限 | 非 admin 角色访问管理端接口 |
| `404` | 资源不存在 | 模板 ID 不存在 |
| `409` | 资源冲突 | 模板名称重复 |
| `413` | 请求体过大 | 文件超过大小限制（默认 500MB） |
| `415` | 不支持的媒体类型 | 上传了非 PPT/PPTX 格式的文件 |
| `503` | 服务不可用 | MinIO 未配置或连接失败 |
