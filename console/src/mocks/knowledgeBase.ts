export const knowledgeBases = [
  {
    id: 'kb1',
    name: '企业培训知识库',
    description: '包含内训师课程、绩效管理、领导力等企业培训核心内容',
    docCount: 128,
    icon: 'ri-building-2-line',
    color: 'from-blue-500 to-blue-700',
    updatedAt: '2025.10.10',
  },
  {
    id: 'kb2',
    name: '销售技能知识库',
    description: '涵盖销售流程、客户管理、谈判技巧等销售核心知识',
    docCount: 86,
    icon: 'ri-line-chart-line',
    color: 'from-sky-500 to-blue-600',
    updatedAt: '2025.10.08',
  },
  {
    id: 'kb3',
    name: '产品知识与技术文档',
    description: '产品手册、技术规范、操作指南等文档资料',
    docCount: 214,
    icon: 'ri-file-code-line',
    color: 'from-indigo-500 to-blue-600',
    updatedAt: '2025.10.05',
  },
  {
    id: 'kb4',
    name: '新员工入职手册',
    description: '公司文化、规章制度、岗位职责等入职必读内容',
    docCount: 45,
    icon: 'ri-user-add-line',
    color: 'from-cyan-500 to-sky-600',
    updatedAt: '2025.09.28',
  },
];

export const suggestedQuestions = [
  '如何制定有效的员工绩效考核方案？',
  '内训师课程开发有哪些关键步骤？',
  '企业组织文化建设的最佳实践是什么？',
  '如何提升销售团队的转化率？',
  '新员工入职培训的核心要素有哪些？',
  '领导力发展的主要模型和框架？',
];

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; page: string; kbName: string }[];
  timestamp: string;
}

export const initialMessages: ChatMessage[] = [
  {
    id: 'msg0',
    role: 'assistant',
    content: '你好！我是企业培训知识库助手，已加载 **企业培训知识库**、**销售技能知识库** 等 4 个知识库，共 473 份文档。\n\n你可以直接提问，我会从知识库中为你精准检索并给出答案。',
    timestamp: '10:00',
  },
];
