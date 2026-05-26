import type { NewsItem } from "./types";

export const NEWS_CATEGORIES = [
  "all",
  "产品更新",
  "AI动态",
  "组织变革",
  "考核",
] as const;

export const newsData: NewsItem[] = [
  {
    id: "n1",
    title: "AI数字全景系统 v2.0 发布",
    summary: "全新岗位工作台上线，支持AI员工实时监控与效能分析",
    category: "产品更新",
    date: "2026.05.19",
    tag: "重要",
    tagVariant: "important",
    readTime: "3 分钟",
    views: 2847,
    coverImage:
      "https://readdy.ai/api/search-image?query=futuristic%20AI%20control%20dashboard%20interface%20holographic%20displays%20teal%20emerald%20glowing%20dark%20background%20minimal%20clean%20modern%20technology%20workspace&width=640&height=360&seq=ws-news1",
    content:
      "AI数字全景系统 v2.0 今日正式发布。本次升级带来三大核心能力：\n\n**1. 岗位工作台全新改版**\n采用卡片式布局，支持拖拽自定义工作台模块。每个岗位可配置专属的AI Agent看板，实时展示员工效能数据。\n\n**2. AI员工实时监控**\n新增「运行中」状态实时追踪，所有AI Agent的状态变更可在3秒内同步到工作台。支持异常告警与自动降级机制。\n\n**3. 效能分析中心**\n内置12项核心效能指标，包括人均LLM调用次数、会话响应时长、任务完成率等。数据每日自动汇总，支持周/月趋势对比。",
    author: "产品团队",
  },
  {
    id: "n2",
    title: "DeepSeek-V4-Pro 模型接入完成",
    summary: "全部11个AI Agent已升级至最新大模型，响应速度提升40%",
    category: "AI动态",
    date: "2026.05.18",
    tag: "技术",
    tagVariant: "tech",
    readTime: "4 分钟",
    views: 1562,
    coverImage:
      "https://readdy.ai/api/search-image?query=abstract%20neural%20network%20brain%20circuit%20connections%20glowing%20nodes%20deep%20learning%20model%20visualization%20teal%20blue%20gradient%20dark%20background%20minimal%20clean%20modern%20technology&width=640&height=360&seq=ws-news2",
    content:
      "经过两周的联调测试，全部11个AI Agent已完成 DeepSeek-V4-Pro 模型升级。\n\n**升级亮点**\n- 平均响应延迟从 1.2s 降至 0.72s，提升 40%\n- 长文本处理能力增强，单次上下文长度支持 128K tokens\n- 逻辑推理准确率提升 12%，代码生成通过率提升 18%\n\n**受影响Agent**\n标书智能体、代码审查Agent、数据分析助手、文档生成器等高频使用Agent已全部切换至新模型。切换过程零停机，用户无感知。",
    author: "技术团队",
  },
  {
    id: "n3",
    title: "组织架构调整通知",
    summary: "产品部与技术部合并为「AI研发中心」，下设算法与应用两个方向",
    category: "组织变革",
    date: "2026.05.17",
    tag: "公告",
    tagVariant: "announce",
    readTime: "2 分钟",
    views: 3201,
    coverImage:
      "https://readdy.ai/api/search-image?query=modern%20corporate%20organization%20chart%20abstract%20geometric%20structure%20teal%20amber%20gradient%20clean%20minimal%20professional%20business%20team%20network&width=640&height=360&seq=ws-news3",
    content:
      "为适应公司AI战略升级，经管理层决议，自2026年6月1日起进行组织架构调整：\n\n**产品部 + 技术部 → AI研发中心**\n\n下设两个子方向：\n- **算法组**：负责大模型调优、RAG架构、模型评估\n- **应用组**：负责Agent产品化、业务场景落地、用户体验优化\n\n本次调整不涉及人员裁撤，现有团队整体平移。后续招聘重点向算法工程师和AI产品经理倾斜。",
    author: "人力资源部",
  },
  {
    id: "n4",
    title: "Q2 OKR考核结果公示",
    summary: "整体目标达成率87.3%，算法优化Agent达成率最高（96%）",
    category: "考核",
    date: "2026.05.16",
    tag: "数据",
    tagVariant: "data",
    readTime: "2 分钟",
    views: 1984,
    coverImage:
      "https://readdy.ai/api/search-image?query=abstract%20performance%20metrics%20dashboard%20charts%20KPI%20targets%20data%20visualization%20teal%20gradient%20clean%20minimal%20modern%20business%20analytics&width=640&height=360&seq=ws-news4",
    content:
      "Q2 OKR考核周期已结束，整体达成情况如下：\n\n**部门达成率排行**\n1. 算法优化Agent — 96%\n2. 标书智能体 — 91%\n3. 客服Agent — 88%\n4. 运营岗-讲师助手 — 85%\n5. 数据分析助手 — 82%\n\n**关键举措**\n- 对达成率低于 80% 的Agent启动专项优化计划\n- 新增「AI工具使用深度」作为 Q3 考核维度\n- 设立月度AI创新奖，鼓励员工探索AI新应用场景",
    author: "运营管理部",
  },
];
