/** 文件素材库 API 类型 — 对齐 组织架构接口/文件素材库api.md */

export interface FileItem {
  id: number;
  folder_id: number | null;
  original_name: string;
  file_size: number;
  mime_type: string;
  file_hash: string | null;
  uploader_id: number;
  created_at: string;
  download_url: string;
}

export interface FolderItem {
  id: number;
  parent_id: number | null;
  name: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface FolderTreeNode extends FolderItem {
  file_count: number;
  children: FolderTreeNode[];
}

export interface FolderTreeResponse {
  folders: FolderTreeNode[];
}

export interface PaginatedFiles {
  items: FileItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateFolderBody {
  parent_id?: number | null;
  name: string;
}

export interface UpdateFolderBody {
  name?: string | null;
  parent_id?: number | null;
}

export interface UpdateFileBody {
  original_name?: string | null;
  folder_id?: number | null;
}

export interface BatchDeleteBody {
  file_ids: number[];
}

export interface BatchDeleteResult {
  deleted: number[];
  failed: { id: number; error: string }[];
}

export interface MessageResponse {
  message: string;
}
