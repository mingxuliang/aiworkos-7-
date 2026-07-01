/**
 * 文件素材库 API — Base: /api/files
 * 文档：组织架构接口/文件素材库api.md
 */

import { getApiUrl } from '../config';
import { buildAuthHeaders } from '../authHeaders';
import { request } from '../request';
import type {
  BatchDeleteBody,
  BatchDeleteResult,
  CreateFolderBody,
  FileItem,
  FolderItem,
  FolderTreeResponse,
  MessageResponse,
  PaginatedFiles,
  UpdateFileBody,
  UpdateFolderBody,
} from '../types/files';

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const filesApi = {
  createFolder: (body: CreateFolderBody) =>
    request<FolderItem>('/files/folders', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getFolderTree: () => request<FolderTreeResponse>('/files/folders/tree'),

  getFolder: (folderId: number) =>
    request<FolderItem>(`/files/folders/${folderId}`),

  updateFolder: (folderId: number, body: UpdateFolderBody) =>
    request<FolderItem>(`/files/folders/${folderId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteFolder: (folderId: number) =>
    request<MessageResponse>(`/files/folders/${folderId}`, { method: 'DELETE' }),

  upload: async (file: File, folderId?: number | null): Promise<FileItem> => {
    const formData = new FormData();
    formData.append('file', file);
    if (folderId != null) formData.append('folder_id', String(folderId));

    const response = await fetch(getApiUrl('/files/upload'), {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let detail = text;
      try {
        const j = JSON.parse(text) as { detail?: string };
        if (j.detail) detail = j.detail;
      } catch {
        /* ignore */
      }
      throw new Error(detail || `Upload failed: ${response.status}`);
    }

    return response.json() as Promise<FileItem>;
  },

  list: (params?: {
    folder_id?: number | null;
    recursive?: boolean;
    page?: number;
    page_size?: number;
  }) =>
    request<PaginatedFiles>(
      `/files/list${buildQuery({
        folder_id: params?.folder_id ?? undefined,
        recursive: params?.recursive ?? false,
        page: params?.page ?? 1,
        page_size: params?.page_size ?? 100,
      })}`,
    ),

  search: (params: {
    file_name: string;
    mime_type?: string;
    page?: number;
    page_size?: number;
  }) =>
    request<PaginatedFiles>(
      `/files/search${buildQuery({
        file_name: params.file_name,
        mime_type: params.mime_type,
        page: params.page ?? 1,
        page_size: params.page_size ?? 100,
      })}`,
    ),

  getFile: (fileId: number) => request<FileItem>(`/files/${fileId}`),

  updateFile: (fileId: number, body: UpdateFileBody) =>
    request<FileItem>(`/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteFile: (fileId: number) =>
    request<MessageResponse>(`/files/${fileId}`, { method: 'DELETE' }),

  batchDelete: (body: BatchDeleteBody) =>
    request<BatchDeleteResult>('/files/batch-delete', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** 获取文件 Blob（预览/下载共用） */
  fetchFileBlob: async (fileId: number): Promise<Blob> => {
    const response = await fetch(getApiUrl(`/files/${fileId}/download`), {
      method: 'GET',
      headers: buildAuthHeaders(),
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`加载文件失败: ${response.status}`);
    }
    return response.blob();
  },

  /** JWT 下载：跟随 302 或 blob 落盘 */
  downloadBlob: async (fileId: number, fileName?: string): Promise<void> => {
    const blob = await filesApi.fetchFileBlob(fileId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || `file-${fileId}`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
