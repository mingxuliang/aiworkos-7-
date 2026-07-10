import type { FileItem, FolderTreeNode } from '@/api/types/files';
import type { BusinessCategory, FileType, MaterialCategory, MaterialFile } from '@/mocks/materialCenter';

/** 素材中心在 MinIO 侧的目录结构名称 */
export const MATERIAL_ROOT_NAME = '素材中心';
export const UPLOAD_GROUP_NAME = '手动上传';
export const BIZ_GROUP_NAME = '业务分类';

export const UPLOAD_TYPE_FOLDERS: { id: string; label: string; icon: string }[] = [
  { id: 'upload-doc', label: '文档资料', icon: 'ri-file-text-line' },
  { id: 'upload-video', label: '视频素材', icon: 'ri-video-line' },
  { id: 'upload-image', label: '图片素材', icon: 'ri-image-2-line' },
  { id: 'upload-audio', label: '音频素材', icon: 'ri-music-2-line' },
];

const UPLOAD_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  UPLOAD_TYPE_FOLDERS.map((f) => [f.label, f.id]),
);

const BIZ_ICONS = [
  'ri-briefcase-line',
  'ri-building-line',
  'ri-star-line',
  'ri-leaf-line',
  'ri-fire-line',
  'ri-award-line',
  'ri-heart-line',
  'ri-global-line',
];
const BIZ_COLORS = [
  'text-sky-500',
  'text-indigo-500',
  'text-blue-500',
  'text-cyan-500',
  'text-emerald-500',
  'text-blue-600',
  'text-violet-500',
  'text-teal-500',
];

export interface MaterialFolderMap {
  rootId: number;
  uploadGroupId: number;
  bizGroupId: number;
  uploadTypeFolderIds: Record<string, number>;
  bizFolderIds: Record<string, number>;
  folderIdToBizKey: Record<number, string>;
  folderIdToUploadKey: Record<number, string>;
}

export function folderKey(id: number): string {
  return `folder:${id}`;
}

export function parseFolderKey(key: string): number | null {
  if (!key.startsWith('folder:')) return null;
  const n = Number(key.slice(7));
  return Number.isFinite(n) ? n : null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function mimeToFileType(mime: string, name: string): FileType {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (mime.includes('pdf') || ext === 'pdf') return 'pdf';
  if (mime.includes('presentation') || ext === 'ppt' || ext === 'pptx') return 'ppt';
  if (mime.includes('spreadsheet') || ext === 'xls' || ext === 'xlsx') return 'excel';
  if (mime.startsWith('video/') || ['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'video';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'aac'].includes(ext)) return 'audio';
  if (mime.includes('word') || ext === 'doc' || ext === 'docx') return 'word';
  return 'word';
}

export function apiFileToMaterial(
  item: FileItem,
  folderMap: MaterialFolderMap,
): MaterialFile {
  let category = 'upload-doc';
  let businessCategoryId: string | undefined;

  if (item.folder_id != null) {
    if (folderMap.folderIdToUploadKey[item.folder_id]) {
      category = folderMap.folderIdToUploadKey[item.folder_id];
    } else if (folderMap.folderIdToBizKey[item.folder_id]) {
      businessCategoryId = folderMap.folderIdToBizKey[item.folder_id];
      category = 'upload-doc';
    }
  }

  const created = item.created_at?.replace('T', ' ').slice(0, 16) ?? '';

  return {
    id: String(item.id),
    name: item.original_name,
    type: mimeToFileType(item.mime_type, item.original_name),
    size: formatFileSize(item.file_size),
    source: 'upload',
    category,
    businessCategoryId,
    folderId: item.folder_id,
    createdAt: created,
    updatedAt: created,
    tags: ['已上传'],
    downloadUrl: `/api/files/${item.id}/download`,
  };
}

function findFolder(nodes: FolderTreeNode[], name: string, parentId?: number): FolderTreeNode | undefined {
  for (const n of nodes) {
    if (n.name === name && (parentId === undefined || n.parent_id === parentId)) return n;
    const inChild = findFolder(n.children ?? [], name, parentId);
    if (inChild) return inChild;
  }
  return undefined;
}

function flattenFolders(nodes: FolderTreeNode[]): FolderTreeNode[] {
  const out: FolderTreeNode[] = [];
  const walk = (list: FolderTreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** 从目录树解析 folder 映射；缺目录时返回 null 表示需 bootstrap */
export function parseFolderMap(tree: FolderTreeNode[]): MaterialFolderMap | null {
  const flat = flattenFolders(tree);
  const root = flat.find((f) => f.name === MATERIAL_ROOT_NAME && f.parent_id == null);
  if (!root) return null;

  const uploadGroup = flat.find((f) => f.name === UPLOAD_GROUP_NAME && f.parent_id === root.id);
  const bizGroup = flat.find((f) => f.name === BIZ_GROUP_NAME && f.parent_id === root.id);
  if (!uploadGroup || !bizGroup) return null;

  const uploadTypeFolderIds: Record<string, number> = {};
  const folderIdToUploadKey: Record<number, string> = {};

  for (const tf of UPLOAD_TYPE_FOLDERS) {
    const node = flat.find((f) => f.parent_id === uploadGroup.id && f.name === tf.label);
    if (!node) return null;
    uploadTypeFolderIds[tf.id] = node.id;
    folderIdToUploadKey[node.id] = tf.id;
  }

  const bizFolderIds: Record<string, number> = {};
  const folderIdToBizKey: Record<number, string> = {};
  const bizNodes = flat.filter((f) => f.parent_id === bizGroup.id);
  bizNodes.forEach((n) => {
    const key = `biz-${n.id}`;
    bizFolderIds[key] = n.id;
    folderIdToBizKey[n.id] = key;
  });

  return {
    rootId: root.id,
    uploadGroupId: uploadGroup.id,
    bizGroupId: bizGroup.id,
    uploadTypeFolderIds,
    bizFolderIds,
    folderIdToBizKey,
    folderIdToUploadKey,
  };
}

export function buildBusinessCategories(
  tree: FolderTreeNode[],
  folderMap: MaterialFolderMap,
  files: MaterialFile[],
): BusinessCategory[] {
  const flat = flattenFolders(tree);
  const bizNodes = flat.filter((f) => f.parent_id === folderMap.bizGroupId);
  return bizNodes.map((n, idx) => {
    const key = `biz-${n.id}`;
    return {
      id: key,
      label: n.name,
      icon: BIZ_ICONS[idx % BIZ_ICONS.length],
      color: BIZ_COLORS[idx % BIZ_COLORS.length],
      count: files.filter((f) => f.businessCategoryId === key).length,
    };
  });
}

export function buildSidebarCategories(
  files: MaterialFile[],
  folderMap: MaterialFolderMap,
): MaterialCategory[] {
  const uploadCount = files.filter((f) => f.source === 'upload').length;
  const children = UPLOAD_TYPE_FOLDERS.map((tf) => ({
    id: folderKey(folderMap.uploadTypeFolderIds[tf.id]),
    label: tf.label,
    count: files.filter((f) => f.category === tf.id).length,
  }));

  return [
    { id: 'all', label: '全部素材', icon: 'ri-folder-2-line', count: files.length },
    {
      id: 'upload',
      label: '手动上传',
      icon: 'ri-upload-cloud-2-line',
      count: uploadCount,
      children,
    },
  ];
}

export function resolveUploadFolderId(
  categoryKey: string,
  bizCategoryId: string | undefined,
  folderMap: MaterialFolderMap,
): number {
  if (bizCategoryId && folderMap.bizFolderIds[bizCategoryId]) {
    return folderMap.bizFolderIds[bizCategoryId];
  }
  return folderMap.uploadTypeFolderIds[categoryKey] ?? folderMap.uploadTypeFolderIds['upload-doc'];
}

export function categoryLabelFromFolderName(name: string): string {
  return UPLOAD_LABEL_BY_KEY[name] ?? 'upload-doc';
}

export { findFolder, flattenFolders, BIZ_ICONS, BIZ_COLORS };
