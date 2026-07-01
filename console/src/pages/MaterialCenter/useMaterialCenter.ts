import { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import { filesApi } from '@/api/modules/files';
import type { FolderTreeNode } from '@/api/types/files';
import type { BusinessCategory, MaterialCategory, MaterialFile } from '@/mocks/materialCenter';
import {
  BIZ_GROUP_NAME,
  MATERIAL_ROOT_NAME,
  UPLOAD_GROUP_NAME,
  UPLOAD_TYPE_FOLDERS,
  apiFileToMaterial,
  buildBusinessCategories,
  buildSidebarCategories,
  folderKey,
  parseFolderKey,
  parseFolderMap,
  resolveUploadFolderId,
  type MaterialFolderMap,
} from './materialAdapter';

async function ensureFolderStructure(): Promise<MaterialFolderMap> {
  let treeRes = await filesApi.getFolderTree();
  let map = parseFolderMap(treeRes.folders);
  if (map) return map;

  let rootNode = treeRes.folders.find((f) => f.name === MATERIAL_ROOT_NAME && f.parent_id == null);
  if (!rootNode) {
    const created = await filesApi.createFolder({ parent_id: null, name: MATERIAL_ROOT_NAME });
    rootNode = { ...created, file_count: 0, children: [] };
    treeRes = await filesApi.getFolderTree();
  }

  const flat = (nodes: FolderTreeNode[]): FolderTreeNode[] => {
    const out: FolderTreeNode[] = [];
    const walk = (list: FolderTreeNode[]) => {
      for (const n of list) {
        out.push(n);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(nodes);
    return out;
  };

  let all = flat(treeRes.folders);
  rootNode = all.find((f) => f.name === MATERIAL_ROOT_NAME && f.parent_id == null);
  if (!rootNode) throw new Error('无法创建素材中心根目录');

  let uploadGroup = all.find((f) => f.name === UPLOAD_GROUP_NAME && f.parent_id === rootNode!.id);
  if (!uploadGroup) {
    await filesApi.createFolder({ parent_id: rootNode.id, name: UPLOAD_GROUP_NAME });
    treeRes = await filesApi.getFolderTree();
    all = flat(treeRes.folders);
    uploadGroup = all.find((f) => f.name === UPLOAD_GROUP_NAME && f.parent_id === rootNode!.id);
  }
  if (!uploadGroup) throw new Error('无法创建手动上传目录');

  let bizGroup = all.find((f) => f.name === BIZ_GROUP_NAME && f.parent_id === rootNode!.id);
  if (!bizGroup) {
    await filesApi.createFolder({ parent_id: rootNode.id, name: BIZ_GROUP_NAME });
    treeRes = await filesApi.getFolderTree();
    all = flat(treeRes.folders);
    bizGroup = all.find((f) => f.name === BIZ_GROUP_NAME && f.parent_id === rootNode!.id);
  }
  if (!bizGroup) throw new Error('无法创建业务分类目录');

  for (const tf of UPLOAD_TYPE_FOLDERS) {
    const exists = all.find((f) => f.parent_id === uploadGroup!.id && f.name === tf.label);
    if (!exists) {
      await filesApi.createFolder({ parent_id: uploadGroup.id, name: tf.label });
    }
  }

  treeRes = await filesApi.getFolderTree();
  map = parseFolderMap(treeRes.folders);
  if (!map) throw new Error('无法初始化素材中心目录结构');
  return map;
}

export function useMaterialCenter() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folderMap, setFolderMap] = useState<MaterialFolderMap | null>(null);
  const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([]);
  const [files, setFiles] = useState<MaterialFile[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const reloadFiles = useCallback(async (map: MaterialFolderMap) => {
    const res = await filesApi.list({
      folder_id: map.rootId,
      recursive: true,
      page: 1,
      page_size: 100,
    });
    setFiles(res.items.map((item) => apiFileToMaterial(item, map)));
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const map = await ensureFolderStructure();
      const tree = await filesApi.getFolderTree();
      setFolderMap(map);
      setFolderTree(tree.folders);
      await reloadFiles(map);
    } catch (e) {
      let msg = e instanceof Error ? e.message : '加载素材失败';
      if (/not found/i.test(msg)) {
        msg =
          '文件素材库 API 不可用（本地后端未实现该接口）。请在 console/.env.development 中设置 VITE_DEV_API_PROXY_TARGET=http://101.36.143.21:8088 并重启前端服务。';
      }
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [reloadFiles]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const businessCategories: BusinessCategory[] = useMemo(() => {
    if (!folderMap) return [];
    return buildBusinessCategories(folderTree, folderMap, files);
  }, [folderMap, folderTree, files]);

  const sidebarCategories: MaterialCategory[] = useMemo(() => {
    if (!folderMap) {
      return [{ id: 'all', label: '全部素材', icon: 'ri-folder-2-line', count: 0 }];
    }
    return buildSidebarCategories(files, folderMap);
  }, [files, folderMap]);

  const totalBytes = useMemo(
    () => files.reduce((sum, f) => {
      const n = parseFloat(f.size);
      if (f.size.includes('GB')) return sum + n * 1024 * 1024 * 1024;
      if (f.size.includes('MB')) return sum + n * 1024 * 1024;
      if (f.size.includes('KB')) return sum + n * 1024;
      return sum + n;
    }, 0),
    [files],
  );

  const filtered = useMemo(() => {
    let list = [...files];

    if (activeCategory !== 'all') {
      const folderId = parseFolderKey(activeCategory);
      if (folderId != null) {
        list = list.filter((f) => f.folderId === folderId);
      } else if (activeCategory === 'upload') {
        list = list.filter((f) => f.source === 'upload');
      } else if (activeCategory.startsWith('biz-')) {
        list = list.filter((f) => f.businessCategoryId === activeCategory);
      } else {
        list = list.filter((f) => f.category === activeCategory);
      }
    }

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [files, activeCategory, searchText]);

  const handleUpload = useCallback(
    async (
      uploadedFiles: File[],
      category: string,
      tagsStr: string,
      bizCategoryId?: string,
    ) => {
      if (!folderMap) throw new Error('目录未就绪');
      const folderId = resolveUploadFolderId(category, bizCategoryId, folderMap);
      const tags = tagsStr
        ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean)
        : ['已上传'];

      for (const file of uploadedFiles) {
        const item = await filesApi.upload(file, folderId);
        const material = apiFileToMaterial(item, folderMap);
        material.tags = tags;
        setFiles((prev) => [material, ...prev]);
      }
      message.success(`已上传 ${uploadedFiles.length} 个文件`);
    },
    [folderMap],
  );

  const handleAddBusiness = useCallback(
    async (name: string) => {
      if (!folderMap) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      await filesApi.createFolder({ parent_id: folderMap.bizGroupId, name: trimmed });
      const tree = await filesApi.getFolderTree();
      setFolderTree(tree.folders);
      const newMap = parseFolderMap(tree.folders);
      if (newMap) setFolderMap(newMap);
      message.success('业务分类已创建');
    },
    [folderMap],
  );

  const handleDeleteBusiness = useCallback(
    async (bizKey: string) => {
      if (!folderMap) return;
      const folderId = folderMap.bizFolderIds[bizKey];
      if (!folderId) return;
      await filesApi.deleteFolder(folderId);
      const tree = await filesApi.getFolderTree();
      setFolderTree(tree.folders);
      const newMap = parseFolderMap(tree.folders);
      if (newMap) {
        setFolderMap(newMap);
        await reloadFiles(newMap);
      }
      if (activeCategory === bizKey || activeCategory === folderKey(folderId)) {
        setActiveCategory('all');
      }
      message.success('业务分类已删除');
    },
    [folderMap, activeCategory, reloadFiles],
  );

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedIds.length) return;
    const ids = selectedIds.map((id) => Number(id)).filter((n) => Number.isFinite(n));
    const res = await filesApi.batchDelete({ file_ids: ids });
    setFiles((prev) => prev.filter((f) => !res.deleted.includes(Number(f.id))));
    setSelectedIds([]);
    if (res.failed.length) {
      message.warning(`${res.failed.length} 个文件删除失败`);
    } else {
      message.success('删除成功');
    }
  }, [selectedIds]);

  const handleDownload = useCallback(async (file: MaterialFile) => {
    const id = Number(file.id);
    if (!Number.isFinite(id)) return;
    await filesApi.downloadBlob(id, file.name);
  }, []);

  const handleDownloadSelected = useCallback(async () => {
    const selected = files.filter((f) => selectedIds.includes(f.id));
    for (const f of selected) {
      await handleDownload(f);
    }
  }, [files, selectedIds, handleDownload]);

  return {
    loading,
    error,
    files,
    filtered,
    folderMap,
    sidebarCategories,
    businessCategories,
    totalBytes,
    activeCategory,
    setActiveCategory,
    searchText,
    setSearchText,
    selectedIds,
    setSelectedIds,
    toggleSelect: (id: string) =>
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      ),
    selectAll: (ids: string[]) => setSelectedIds(ids),
    clearSelection: () => setSelectedIds([]),
    handleUpload,
    handleAddBusiness,
    handleDeleteBusiness,
    handleDeleteSelected,
    handleDownload,
    handleDownloadSelected,
    reload: bootstrap,
  };
}
