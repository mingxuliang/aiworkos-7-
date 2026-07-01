# MinIO 文件库 API 接口文档

> Base URL: `/api/files`
>
> 所有接口需要在请求头携带认证信息（JWT token），由 `AuthMiddleware` 中间件处理。

---

## 通用说明

### 认证

请求头携带 `Authorization: Bearer <jwt_token>`，中间件在 `request.state` 注入 `user`、`user_id`、`roles`。

### 权限模型

| 角色 | 可见范围 | 操作权限 |
|------|---------|---------|
| 普通用户 | 自己上传/创建的文件和目录 | 只能操作自己的文件和目录 |
| admin | 所有文件和目录 | 所有操作 |

### 通用错误响应

| 状态码 | 含义 |
|--------|------|
| `401` | 未认证（token 缺失或无效） |
| `403` | 无权限（非文件所有者且非 admin） |
| `404` | 资源不存在或无权访问 |
| `503` | 文件库未启用（MinIO 未配置） |

---

## 一、目录管理

### 1.1 创建目录

创建一个新目录。

```
POST /api/files/folders
```

**请求体 (JSON)**

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `parent_id` | `int \| null` | - | 父目录 ID，`null` 表示根级目录 |
| `name` | `string` | ✅ | 目录名称，1-128 字符 |

**请求示例**

```json
{
  "parent_id": null,
  "name": "工作文档"
}
```

创建子目录：

```json
{
  "parent_id": 1,
  "name": "2025年季度报告"
}
```

**响应示例 (201)**

```json
{
  "id": 1,
  "parent_id": null,
  "name": "工作文档",
  "created_by": 1,
  "created_at": "2026-06-09T10:30:00",
  "updated_at": "2026-06-09T10:30:00"
}
```

---

### 1.2 获取目录树

获取当前用户的完整目录树（含每级目录下的文件数量）。所有 `parent_id` 为 `null` 的顶层目录以列表形式返回，按 `id` 升序排列。

```
GET /api/files/folders/tree
```

**无请求参数。**

**响应示例 (200)**

```json
{
  "folders": [
    {
      "id": 1,
      "parent_id": null,
      "name": "工作文档",
      "created_by": 1,
      "created_at": "2026-06-09T10:30:00",
      "updated_at": "2026-06-09T10:30:00",
      "file_count": 3,
      "children": [
        {
          "id": 2,
          "parent_id": 1,
          "name": "2025年季度报告",
          "created_by": 1,
          "created_at": "2026-06-09T10:31:00",
          "updated_at": "2026-06-09T10:31:00",
          "file_count": 2,
          "children": []
        }
      ]
    },
    {
      "id": 10,
      "parent_id": null,
      "name": "个人资料",
      "created_by": 1,
      "created_at": "2026-06-09T14:00:00",
      "updated_at": "2026-06-09T14:00:00",
      "file_count": 0,
      "children": []
    }
  ]
}
```

> **注意**：如果没有顶层目录则 `folders` 为 `[]`。

---

### 1.3 获取单个目录

```
GET /api/files/folders/{folder_id}
```

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `folder_id` | `int` | 目录 ID |

**响应示例 (200)**

```json
{
  "id": 1,
  "parent_id": null,
  "name": "工作文档",
  "created_by": 1,
  "created_at": "2026-06-09T10:30:00",
  "updated_at": "2026-06-09T10:30:00"
}
```

---

### 1.4 修改目录

重命名和/或移动目录。至少提供一个字段。

```
PUT /api/files/folders/{folder_id}
```

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `folder_id` | `int` | 目录 ID |

**请求体 (JSON)**

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `name` | `string \| null` | - | 新名称，1-128 字符 |
| `parent_id` | `int \| null` | - | 新父目录 ID，`null` 移到根级 |

**请求示例 — 重命名**

```json
{
  "name": "归档工作文档"
}
```

**请求示例 — 移动**

```json
{
  "parent_id": 5
}
```

**请求示例 — 同时重命名 + 移动**

```json
{
  "name": "归档工作文档",
  "parent_id": 5
}
```

**响应示例 (200)**

```json
{
  "id": 1,
  "parent_id": 5,
  "name": "归档工作文档",
  "created_by": 1,
  "created_at": "2026-06-09T10:30:00",
  "updated_at": "2026-06-09T11:00:00"
}
```

---

### 1.5 删除目录

软删除目录及其所有子目录。目录下的文件不会被删除，其 `folder_id` 会被置为 `null`（变为根级孤儿文件）。

```
DELETE /api/files/folders/{folder_id}
```

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `folder_id` | `int` | 目录 ID |

**响应示例 (200)**

```json
{
  "message": "Folder deleted"
}
```

---

## 二、文件管理

### 2.1 上传文件

统一上传端点——无论 1KB 还是 5GB，调用方式一致。后端自动判断文件大小，小文件直接上传，大文件自动切换 S3 Multipart。

```
POST /api/files/upload
```

**请求体 (multipart/form-data)**

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `file` | `binary` | ✅ | 文件二进制数据 |
| `folder_id` | `int` | - | 目标目录 ID，不传则上传到根级 |

**请求示例 (JavaScript)**

```javascript
const form = new FormData();
form.append("file", fileInput.files[0]);   // 1KB ~ 5GB 都这样调用
form.append("folder_id", "1");

const res = await fetch("/api/files/upload", {
  method: "POST",
  headers: { "Authorization": "Bearer <token>" },
  body: form,
});
```

**请求示例 (curl)**

```bash
curl -X POST http://localhost:8000/api/files/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/large_report.pdf" \
  -F "folder_id=1"
```

**响应示例 (200)**

```json
{
  "id": 42,
  "folder_id": 1,
  "original_name": "季度报告.pdf",
  "file_size": 2048576,
  "mime_type": "application/pdf",
  "file_hash": "a1b2c3d4e5f6...",
  "uploader_id": 1,
  "created_at": "2026-06-09T10:35:00",
  "download_url": "/api/files/42/download"
}
```

**错误响应**

| 状态码 | 错误信息 | 触发条件 |
|--------|---------|---------|
| `400` | `Uploaded file is empty` | 上传了空文件 |
| `413` | `File size exceeds maximum ...` | 超过 `AIWORK_MINIO_MAX_FILE_SIZE`（默认 5GB） |
| `415` | `MIME type '...' is not allowed` | MIME 类型不在白名单中 |

---

### 2.2 获取文件列表

分页列出文件，支持按目录过滤和递归子目录。

```
GET /api/files/list
```

**查询参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|:---:|:------:|------|
| `folder_id` | `int` | - | `null` | 目录 ID，不传 = 列出根级文件（`folder_id IS NULL`） |
| `recursive` | `bool` | - | `false` | `true` 时递归查询该目录下所有子孙目录的文件 |
| `page` | `int` | - | `1` | 页码 |
| `page_size` | `int` | - | `20` | 每页条数，最大 100 |

**请求示例**

```
GET /api/files/list?folder_id=1&recursive=true&page=1&page_size=20
```

**响应示例 (200)**

```json
{
  "items": [
    {
      "id": 42,
      "folder_id": 1,
      "original_name": "季度报告.pdf",
      "file_size": 2048576,
      "mime_type": "application/pdf",
      "file_hash": "a1b2c3d4...",
      "uploader_id": 1,
      "created_at": "2026-06-09T10:35:00",
      "download_url": "/api/files/42/download"
    },
    {
      "id": 43,
      "folder_id": 5,
      "original_name": "附录.xlsx",
      "file_size": 1024000,
      "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "file_hash": "f6e5d4c3...",
      "uploader_id": 1,
      "created_at": "2026-06-09T11:00:00",
      "download_url": "/api/files/43/download"
    }
  ],
  "total": 2,
  "page": 1,
  "page_size": 20
}
```

---

### 2.3 全局搜索文件

跨所有目录按文件名模糊搜索，支持 MIME 类型筛选。

```
GET /api/files/search
```

**查询参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|:---:|:------:|------|
| `file_name` | `string` | ✅ | - | 搜索关键词，`LIKE '%keyword%'` 匹配文件名 |
| `mime_type` | `string` | - | `null` | MIME 类型过滤，支持通配 `image/*` |
| `page` | `int` | - | `1` | 页码 |
| `page_size` | `int` | - | `20` | 每页条数，最大 100 |

**请求示例**

```
# 基础搜索
GET /api/files/search?file_name=报告&page=1&page_size=20

# 按 MIME 类型过滤
GET /api/files/search?file_name=报告&mime_type=application/pdf

# MIME 前缀匹配
GET /api/files/search?file_name=头像&mime_type=image/*
```

**响应示例 (200)**

```json
{
  "items": [
    {
      "id": 42,
      "folder_id": 1,
      "original_name": "季度报告.pdf",
      "file_size": 2048576,
      "mime_type": "application/pdf",
      "file_hash": "a1b2c3d4...",
      "uploader_id": 1,
      "created_at": "2026-06-09T10:35:00",
      "download_url": "/api/files/42/download"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

---

### 2.4 获取文件信息

```
GET /api/files/{file_id}
```

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_id` | `int` | 文件 ID |

**响应示例 (200)**

```json
{
  "id": 42,
  "folder_id": 1,
  "original_name": "季度报告.pdf",
  "file_size": 2048576,
  "mime_type": "application/pdf",
  "file_hash": "a1b2c3d4...",
  "uploader_id": 1,
  "created_at": "2026-06-09T10:35:00",
  "download_url": "/api/files/42/download"
}
```

---

### 2.5 修改文件

重命名文件和/或移动到其他目录。至少提供一个字段。

```
PUT /api/files/{file_id}
```

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_id` | `int` | 文件 ID |

**请求体 (JSON)**

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `original_name` | `string \| null` | - | 新文件名，1-256 字符（经过 `sanitize` 安全清洗） |
| `folder_id` | `int \| null` | - | 目标目录 ID，`null` 移到根级 |

**请求示例 — 重命名**

```json
{
  "original_name": "2025-Q1季度报告.pdf"
}
```

**请求示例 — 移动**

```json
{
  "folder_id": 3
}
```

**请求示例 — 同时重命名 + 移动**

```json
{
  "original_name": "归档-季度报告.pdf",
  "folder_id": 3
}
```

**错误 (400)**

```json
{
  "detail": "At least one of original_name or folder_id must be provided"
}
```

**响应示例 (200)**

```json
{
  "id": 42,
  "folder_id": 3,
  "original_name": "归档-季度报告.pdf",
  "file_size": 2048576,
  "mime_type": "application/pdf",
  "file_hash": "a1b2c3d4...",
  "uploader_id": 1,
  "created_at": "2026-06-09T10:35:00",
  "download_url": "/api/files/42/download"
}
```

---

### 2.6 下载文件

302 重定向到 MinIO 预签名 URL，浏览器直接下载，不经过后端中转流量。

```
GET /api/files/{file_id}/download
```

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_id` | `int` | 文件 ID |

**响应**：HTTP 302 跳转到 MinIO 预签名 URL（有效期由 `AIWORK_MINIO_PRESIGNED_EXPIRES` 控制，默认 3600 秒）。

**请求示例 (curl — 跟随重定向下载)**

```bash
curl -L -O -J \
  -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/files/42/download
```

**JavaScript 示例**

```javascript
// 直接打开下载
window.open("/api/files/42/download");

// 或通过 fetch 获取 URL（实际请求会 302 重定向）
const res = await fetch("/api/files/42/download", {
  headers: { "Authorization": "Bearer <token>" },
  redirect: "follow",
});
```

---

### 2.7 删除单个文件

软删除文件（`is_deleted=true`），MinIO 中的 blob 由定时清理任务异步处理。

```
DELETE /api/files/{file_id}
```

**路径参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_id` | `int` | 文件 ID |

**响应示例 (200)**

```json
{
  "message": "File deleted"
}
```

---

### 2.8 批量删除文件

一次请求软删除多个文件。每个文件独立处理——单个失败不影响其他文件。

```
POST /api/files/batch-delete
```

**请求体 (JSON)**

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `file_ids` | `int[]` | ✅ | 文件 ID 列表，1-200 个 |

**请求示例**

```json
{
  "file_ids": [42, 43, 44, 999]
}
```

**响应示例 (200)**

```json
{
  "deleted": [42, 43],
  "failed": [
    { "id": 44, "error": "File not found or access denied" },
    { "id": 999, "error": "File not found or access denied" }
  ]
}
```

---

### 2.9 批量获取文件

一次请求获取多个文件的内容或预签名 URL。适用于 Skill 或其他后端服务需要批量读取文件的场景。

```
POST /api/files/batch-read
```

**请求体 (JSON)**

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `file_ids` | `int[]` | ✅ | 文件 ID 列表，1-50 个 |
| `mode` | `string` | - | `"url"` (默认) = 返回预签名 URL；`"content"` = 返回 base64 内容 |

**两种模式对比**

| 维度 | `mode=url` | `mode=content` |
|------|-----------|---------------|
| 返回内容 | 预签名下载 URL | base64 编码的文件内容 |
| 适用场景 | 大文件、流式处理 | 小文件、直接解析内容 |
| 网络开销 | N+1 次请求（1 取 URL + N 次下载） | 1 次请求 |
| 单文件大小限制 | 无 | 最大 50MB |
| 后端压力 | 低 | 中 |

---

#### 示例 — 获取预签名 URL

**请求**

```json
{
  "file_ids": [42, 43, 44],
  "mode": "url"
}
```

**响应 (200)**

```json
{
  "files": [
    {
      "id": 42,
      "original_name": "季度报告.pdf",
      "url": "http://minio:9000/aiwork-files/a1b2c3d4.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=..."
    },
    {
      "id": 43,
      "original_name": "附录.xlsx",
      "url": "http://minio:9000/aiwork-files/e5f6g7h8.xlsx?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=..."
    },
    {
      "id": 44,
      "original_name": null,
      "url": null,
      "error": "File not found or access denied"
    }
  ]
}
```

---

#### 示例 — 获取 base64 内容

**请求**

```json
{
  "file_ids": [42, 43, 200],
  "mode": "content"
}
```

**响应 (200)**

```json
{
  "files": [
    {
      "id": 42,
      "original_name": "季度报告.pdf",
      "mime_type": "application/pdf",
      "content": "JVBERi0xLjcNCiXi48/TDQoNCjEgMCBvYmoNCjw8..."
    },
    {
      "id": 43,
      "original_name": "附录.xlsx",
      "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content": "UEsDBBQABgAIAAAAIQBi7...1QSwECLQAUAAYACAAAACEA..."
    },
    {
      "id": 200,
      "original_name": "大型视频.mp4",
      "mime_type": null,
      "content": null,
      "error": "File exceeds 50MB limit, use mode=url instead"
    }
  ]
}
```

---

## 三、响应字段速查

### FileResponse（文件信息）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `int` | 文件 ID |
| `folder_id` | `int \| null` | 所属目录 ID，`null` = 根级 |
| `original_name` | `string` | 原始文件名（经过安全清洗） |
| `file_size` | `int` | 文件大小（字节） |
| `mime_type` | `string` | MIME 类型 |
| `file_hash` | `string \| null` | SHA-256 哈希值 |
| `uploader_id` | `int` | 上传者用户 ID |
| `created_at` | `datetime` | 上传时间 |
| `download_url` | `string` | 下载端点路径 `/api/files/{id}/download` |

### FolderResponse（目录信息）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `int` | 目录 ID |
| `parent_id` | `int \| null` | 父目录 ID，`null` = 根级 |
| `name` | `string` | 目录名称 |
| `created_by` | `int` | 创建者用户 ID |
| `created_at` | `datetime` | 创建时间 |
| `updated_at` | `datetime` | 最后修改时间 |

### FolderTreeNode（树节点）

在 `FolderResponse` 基础上增加：

| 字段 | 类型 | 说明 |
|------|------|------|
| `file_count` | `int` | 该目录下的文件数量 |
| `children` | `FolderTreeNode[]` | 子目录列表（递归结构） |

---

## 四、接口总览

| 方法 | 端点 | 说明 | 权限 |
|------|------|------|------|
| `POST` | `/api/files/folders` | 创建目录 | 登录用户 |
| `GET` | `/api/files/folders/tree` | 获取目录树 | 登录用户 |
| `GET` | `/api/files/folders/{id}` | 获取目录信息 | 目录创建者/admin |
| `PUT` | `/api/files/folders/{id}` | 重命名/移动目录 | 目录创建者/admin |
| `DELETE` | `/api/files/folders/{id}` | 删除目录（级联子目录） | 目录创建者/admin |
| `POST` | `/api/files/upload` | 上传文件（自适应大小） | 登录用户 |
| `GET` | `/api/files/list` | 分页列表（支持递归） | 登录用户 |
| `GET` | `/api/files/search` | 全局模糊搜索 | 登录用户 |
| `GET` | `/api/files/{id}` | 获取文件信息 | 文件上传者/admin |
| `PUT` | `/api/files/{id}` | 重命名/移动文件 | 文件上传者/admin |
| `GET` | `/api/files/{id}/download` | 下载文件（302 跳转） | 文件上传者/admin |
| `DELETE` | `/api/files/{id}` | 删除单个文件 | 文件上传者/admin |
| `POST` | `/api/files/batch-read` | 批量获取（URL 或 base64） | 登录用户 |
| `POST` | `/api/files/batch-delete` | 批量删除文件 | 登录用户 |
