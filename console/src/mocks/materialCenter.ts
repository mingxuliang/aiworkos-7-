export type FileType = 'ppt' | 'word' | 'pdf' | 'video' | 'image' | 'audio' | 'excel';
export type FileSource = 'platform' | 'upload';

export interface MaterialFile {
  id: string;
  name: string;
  type: FileType;
  size: string;
  source: FileSource;
  category: string;
  businessCategoryId?: string;
  /** 文件素材库 folder_id */
  folderId?: number | null;
  /** 下载 API 路径，如 /api/files/42/download */
  downloadUrl?: string;
  courseName?: string;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
  duration?: string;
  pages?: number;
  tags: string[];
}

export interface BusinessCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  count: number;
}

export const defaultBusinessCategories: BusinessCategory[] = [
  { id: 'biz-sales', label: '销售管理', icon: 'ri-line-chart-line', color: 'text-sky-500', count: 0 },
  { id: 'biz-hr', label: '人力资源', icon: 'ri-team-line', color: 'text-indigo-500', count: 0 },
  { id: 'biz-product', label: '产品研发', icon: 'ri-lightbulb-line', color: 'text-blue-500', count: 0 },
  { id: 'biz-ops', label: '运营管理', icon: 'ri-settings-3-line', color: 'text-cyan-500', count: 0 },
  { id: 'biz-finance', label: '财务合规', icon: 'ri-money-cny-circle-line', color: 'text-emerald-500', count: 0 },
  { id: 'biz-leader', label: '领导力发展', icon: 'ri-user-star-line', color: 'text-blue-600', count: 0 },
];

export interface MaterialCategory {
  id: string;
  label: string;
  icon: string;
  count: number;
  children?: { id: string; label: string; count: number }[];
}

export const materialCategories: MaterialCategory[] = [
  {
    id: 'all',
    label: '全部素材',
    icon: 'ri-folder-2-line',
    count: 0,
  },
  {
    id: 'platform',
    label: '平台生成',
    icon: 'ri-robot-2-line',
    count: 0,
    children: [
      { id: 'platform-ppt', label: 'PPT 课件', count: 0 },
      { id: 'platform-video', label: '微课视频', count: 0 },
      { id: 'platform-script', label: '课程讲稿', count: 0 },
      { id: 'platform-outline', label: '课程大纲', count: 0 },
    ],
  },
  {
    id: 'upload',
    label: '手动上传',
    icon: 'ri-upload-cloud-2-line',
    count: 0,
    children: [
      { id: 'upload-doc', label: '文档资料', count: 0 },
      { id: 'upload-video', label: '视频素材', count: 0 },
      { id: 'upload-image', label: '图片素材', count: 0 },
      { id: 'upload-audio', label: '音频素材', count: 0 },
    ],
  },
  {
    id: 'shared',
    label: '共享素材',
    icon: 'ri-share-line',
    count: 0,
  },
];

export const mockMaterials: MaterialFile[] = [
  // Platform generated
  {
    id: 'f1',
    name: '最佳实践萃取-完整课件.pptx',
    type: 'ppt',
    size: '12.4 MB',
    source: 'platform',
    category: 'platform-ppt',
    courseName: '《最佳实践萃取》',
    createdAt: '2025.10.10 14:32',
    updatedAt: '2025.10.10 14:32',
    thumbnail: 'https://readdy.ai/api/search-image?query=professional%20PowerPoint%20presentation%20slide%20design%20blue%20gradient%20corporate%20training%20course%20cover%20title%20page%20elegant%20minimalist&width=320&height=200&seq=mat1&orientation=landscape',
    pages: 48,
    tags: ['PPT', '已完成', '企业培训'],
    businessCategoryId: 'biz-hr',
  },
  {
    id: 'f2',
    name: '数字化课程智能提取-课程大纲.docx',
    type: 'word',
    size: '1.2 MB',
    source: 'platform',
    category: 'platform-outline',
    courseName: '《数字化课程智能提取与课程生成》',
    createdAt: '2025.10.09 10:15',
    updatedAt: '2025.10.09 10:15',
    pages: 12,
    tags: ['大纲', '数字化'],
    businessCategoryId: 'biz-product',
  },
  {
    id: 'f3',
    name: '员工绩效管理-微课视频.mp4',
    type: 'video',
    size: '238 MB',
    source: 'platform',
    category: 'platform-video',
    courseName: '《员工绩效管理与激励机制》',
    createdAt: '2025.10.08 16:40',
    updatedAt: '2025.10.08 16:40',
    thumbnail: 'https://readdy.ai/api/search-image?query=professional%20training%20video%20thumbnail%20performance%20management%20employee%20motivation%20corporate%20education%20screen%20recording%20clean%20blue%20white%20background&width=320&height=200&seq=mat2&orientation=landscape',
    duration: '18:42',
    tags: ['视频', '绩效管理'],
    businessCategoryId: 'biz-hr',
  },
  {
    id: 'f4',
    name: '销售技巧与客户关系-讲稿全文.docx',
    type: 'word',
    size: '3.6 MB',
    source: 'platform',
    category: 'platform-script',
    courseName: '《销售技巧与客户关系管理》',
    createdAt: '2025.10.07 09:00',
    updatedAt: '2025.10.07 11:20',
    pages: 34,
    tags: ['讲稿', '销售'],
    businessCategoryId: 'biz-sales',
  },
  {
    id: 'f5',
    name: '如何划分职业发展通道-PPT课件.pptx',
    type: 'ppt',
    size: '8.9 MB',
    source: 'platform',
    category: 'platform-ppt',
    courseName: '《如何划分职业发展通道》',
    createdAt: '2025.10.06 15:22',
    updatedAt: '2025.10.06 15:22',
    thumbnail: 'https://readdy.ai/api/search-image?query=career%20development%20path%20visualization%20presentation%20slide%20modern%20navy%20blue%20indigo%20gradient%20professional%20corporate%20training%20minimal%20design&width=320&height=200&seq=mat3&orientation=landscape',
    pages: 32,
    tags: ['PPT', '职业发展'],
    businessCategoryId: 'biz-hr',
  },
  {
    id: 'f6',
    name: 'AI微课开发-课程视频合集.mp4',
    type: 'video',
    size: '512 MB',
    source: 'platform',
    category: 'platform-video',
    courseName: 'AI微课开发系列',
    createdAt: '2025.10.05 11:00',
    updatedAt: '2025.10.05 11:00',
    thumbnail: 'https://readdy.ai/api/search-image?query=AI%20micro%20course%20video%20thumbnail%20digital%20learning%20technology%20abstract%20blue%20glow%20modern%20clean%20interface%20screenshot%20training%20material&width=320&height=200&seq=mat4&orientation=landscape',
    duration: '42:15',
    tags: ['视频', 'AI微课'],
    businessCategoryId: 'biz-product',
  },
  {
    id: 'f7',
    name: '组织文化建设-课程大纲.docx',
    type: 'word',
    size: '0.9 MB',
    source: 'platform',
    category: 'platform-outline',
    courseName: '《组织文化建设与变革管理》',
    createdAt: '2025.10.04 13:55',
    updatedAt: '2025.10.04 13:55',
    pages: 8,
    tags: ['大纲', '组织文化'],
    businessCategoryId: 'biz-ops',
  },
  // Manually uploaded
  {
    id: 'f8',
    name: '2025年度培训规划方案.pdf',
    type: 'pdf',
    size: '5.2 MB',
    source: 'upload',
    category: 'upload-doc',
    createdAt: '2025.10.03 09:30',
    updatedAt: '2025.10.03 09:30',
    pages: 28,
    tags: ['规划', '年度方案'],
    businessCategoryId: 'biz-hr',
  },
  {
    id: 'f9',
    name: '企业内训素材-产品介绍视频.mp4',
    type: 'video',
    size: '180 MB',
    source: 'upload',
    category: 'upload-video',
    createdAt: '2025.09.28 15:00',
    updatedAt: '2025.09.28 15:00',
    thumbnail: 'https://readdy.ai/api/search-image?query=product%20introduction%20video%20corporate%20presentation%20screen%20clean%20minimal%20design%20showcase%20footage%20blue%20white%20background%20professional%20company&width=320&height=200&seq=mat5&orientation=landscape',
    duration: '08:30',
    tags: ['产品介绍', '视频'],
    businessCategoryId: 'biz-sales',
  },
  {
    id: 'f10',
    name: '内训师资质认证标准.xlsx',
    type: 'excel',
    size: '0.4 MB',
    source: 'upload',
    category: 'upload-doc',
    createdAt: '2025.09.25 11:10',
    updatedAt: '2025.09.26 09:00',
    pages: 3,
    tags: ['内训师', '认证'],
    businessCategoryId: 'biz-hr',
  },
  {
    id: 'f11',
    name: '课程封面设计素材包.zip',
    type: 'image',
    size: '45.6 MB',
    source: 'upload',
    category: 'upload-image',
    createdAt: '2025.09.22 14:00',
    updatedAt: '2025.09.22 14:00',
    thumbnail: 'https://readdy.ai/api/search-image?query=course%20cover%20design%20asset%20pack%20colorful%20graphic%20templates%20modern%20vibrant%20shapes%20abstract%20geometric%20illustration%20training%20education%20beautiful&width=320&height=200&seq=mat6&orientation=landscape',
    tags: ['设计', '封面', '图片'],
  },
  {
    id: 'f12',
    name: '领导力培训参考资料.pdf',
    type: 'pdf',
    size: '7.8 MB',
    source: 'upload',
    category: 'upload-doc',
    createdAt: '2025.09.18 10:00',
    updatedAt: '2025.09.18 10:00',
    pages: 56,
    tags: ['领导力', '参考资料'],
    businessCategoryId: 'biz-leader',
  },
  {
    id: 'f13',
    name: '背景音乐-企业培训专用.mp3',
    type: 'audio',
    size: '8.3 MB',
    source: 'upload',
    category: 'upload-audio',
    createdAt: '2025.09.15 16:45',
    updatedAt: '2025.09.15 16:45',
    duration: '03:52',
    tags: ['音频', '背景音乐'],
  },
  {
    id: 'f14',
    name: '新员工入职手册2025.docx',
    type: 'word',
    size: '2.1 MB',
    source: 'upload',
    category: 'upload-doc',
    createdAt: '2025.09.10 08:30',
    updatedAt: '2025.10.01 09:00',
    pages: 22,
    tags: ['入职', '手册'],
  },
  {
    id: 'f15',
    name: '绩效考核模板-季度版.xlsx',
    type: 'excel',
    size: '0.6 MB',
    source: 'upload',
    category: 'upload-doc',
    createdAt: '2025.09.05 14:20',
    updatedAt: '2025.09.05 14:20',
    pages: 5,
    tags: ['绩效', '模板', 'Excel'],
    businessCategoryId: 'biz-finance',
  },
];

// Compute counts
const countByCategory = (catId: string) => {
  if (catId === 'all') return mockMaterials.length;
  if (catId === 'platform') return mockMaterials.filter((f) => f.source === 'platform').length;
  if (catId === 'upload') return mockMaterials.filter((f) => f.source === 'upload').length;
  if (catId === 'shared') return 0;
  return mockMaterials.filter((f) => f.category === catId).length;
};

materialCategories.forEach((cat) => {
  cat.count = countByCategory(cat.id);
  if (cat.children) {
    cat.children.forEach((child) => {
      child.count = countByCategory(child.id);
    });
  }
});

// Compute business category counts
defaultBusinessCategories.forEach((biz) => {
  biz.count = mockMaterials.filter((f) => f.businessCategoryId === biz.id).length;
});
