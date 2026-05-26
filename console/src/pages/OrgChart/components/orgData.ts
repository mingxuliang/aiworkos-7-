export interface MaturityDimension {
  name: string;
  score: number;
  max: number;
}

export interface WorkflowStep {
  title: string;
  humanTask: string;
  aiTask: string;
  description?: string;
  aiRoleName?: string;
}

export interface OrgNode {
  id: string;
  name: string;
  title: string;
  aiLevel: 'high' | 'medium' | 'low';
  digitalScore: number;
  headcount: number;
  aiCoverage: number;
  aiTools: string[];
  dataFlow: number;
  aiEfficiencyBoost: number;
  aiReplacementRate: number;
  timeSaved: string;
  aiValue: string;
  positionDescription?: string;
  digitalMaturity: MaturityDimension[];
  children?: OrgNode[];
  roles?: string[];
  humanTasks: string[];
  aiTasks: string[];
  collaborativeTasks: string[];
  humanWorkloadPct: number;
  aiWorkloadPct: number;
  aiValueMetrics: Array<{ label: string; value: string; icon: string; color: string }>;
  workflowSteps?: WorkflowStep[];
}

export const aiConfig: Record<'high' | 'medium' | 'low', {
  badge: string; label: string; dot: string; bar: string; line: string;
  particle: string; glow: string; shadow: string; valueBg: string; chip: string;
  maturityBar: string; humanColor: string; aiColor: string; humanBg: string; aiBg: string;
}> = {
  high: {
    badge: 'bg-blue-50 text-blue-700 border-blue-200', label: 'AI 深度',
    dot: 'bg-blue-500', bar: 'bg-blue-500', line: '#2563EB', particle: '#3B82F6',
    glow: 'animate-node-pulse-blue', shadow: 'shadow-[0_0_20px_rgba(37,99,235,0.12)]',
    valueBg: 'bg-blue-500', chip: 'bg-blue-50 text-blue-600 border-blue-200',
    maturityBar: 'bg-blue-500', humanColor: 'text-slate-500', aiColor: 'text-blue-600',
    humanBg: 'bg-slate-400', aiBg: 'bg-blue-500',
  },
  medium: {
    badge: 'bg-sky-50 text-sky-700 border-sky-200', label: 'AI 辅助',
    dot: 'bg-sky-400', bar: 'bg-sky-400', line: '#38BDF8', particle: '#7DD3FC',
    glow: 'animate-node-pulse-sky', shadow: 'shadow-[0_0_15px_rgba(14,165,233,0.1)]',
    valueBg: 'bg-sky-400', chip: 'bg-sky-50 text-sky-600 border-sky-200',
    maturityBar: 'bg-sky-400', humanColor: 'text-slate-500', aiColor: 'text-sky-600',
    humanBg: 'bg-slate-400', aiBg: 'bg-sky-400',
  },
  low: {
    badge: 'bg-slate-100 text-slate-600 border-slate-200', label: '数字化',
    dot: 'bg-slate-400', bar: 'bg-slate-400', line: '#94A3B8', particle: '#CBD5E1',
    glow: '', shadow: '',
    valueBg: 'bg-slate-400', chip: 'bg-slate-50 text-slate-600 border-slate-200',
    maturityBar: 'bg-slate-400', humanColor: 'text-slate-500', aiColor: 'text-slate-600',
    humanBg: 'bg-slate-400', aiBg: 'bg-slate-400',
  },
};

export const orgData: OrgNode = {
  id: 'ceo',
  name: '张明',
  title: '首席执行官',
  aiLevel: 'high',
  digitalScore: 5,
  headcount: 1,
  aiCoverage: 100,
  aiTools: ['战略决策AI', '全域数据分析', '智能会议'],
  dataFlow: 8500,
  aiEfficiencyBoost: 55,
  aiReplacementRate: 40,
  timeSaved: '日均节省 2.5h',
  aiValue: '战略决策效率提升 55%，会议耗时降低 40%',
  positionDescription: '张明 岗位基于 OPT 人机协作岗位平台构建，人工员工专注战略判断、关系经营与创意决策，AI 数字员工承担数据挖掘、方案生成、流程执行等标准化与规模化任务，形成「人类主导 + AI 赋能」的闭环协作模式。',
  digitalMaturity: [
    { name: '流程自动化', score: 4.8, max: 5 },
    { name: '数据驱动决策', score: 5.0, max: 5 },
    { name: 'AI 工具渗透', score: 4.5, max: 5 },
    { name: '协作数字化', score: 4.8, max: 5 },
    { name: '知识管理', score: 4.2, max: 5 },
  ],
  humanTasks: ['战略方向制定', '跨部门资源协调', '对外战略合作'],
  aiTasks: ['全域数据实时监控', '竞品动态分析', '会议纪要自动生成'],
  collaborativeTasks: ['季度经营复盘', '投资决策分析', '组织架构优化'],
  humanWorkloadPct: 35,
  aiWorkloadPct: 45,
  aiValueMetrics: [
    { label: '决策提速', value: '55%', icon: 'ri-rocket-line', color: 'blue' },
    { label: '数据覆盖', value: '全域', icon: 'ri-global-line', color: 'blue' },
    { label: '会议效率', value: '+40%', icon: 'ri-group-line', color: 'sky' },
  ],
  workflowSteps: [
    {
      title: '战略决策',
      humanTask: '制定企业中长期战略方向，审批重大投资决策与组织架构调整。',
      aiTask: '实时聚合市场数据、竞品动态与内部经营指标，生成战略模拟与风险评估报告。',
      aiRoleName: '战略分析助手',
    },
    {
      title: '资源协调',
      humanTask: '跨部门资源调配与优先级仲裁，推动关键项目落地与组织协同。',
      aiTask: '自动分析各部门产能、项目进度与资源利用率，推荐最优资源配置方案。',
      aiRoleName: '资源调度助手',
    },
    {
      title: '经营复盘',
      humanTask: '主持季度经营复盘会议，评估目标达成情况，调整下一阶段重点。',
      aiTask: '自动汇总各业务线经营数据，生成对标分析报告与预警清单。',
      aiRoleName: '经营分析助手',
    },
    {
      title: '对外合作',
      humanTask: '推动重大战略合作谈判，维护投资方、客户和合作伙伴关键关系。',
      aiTask: '实时监控合作方动态，分析行业动向，生成合作备忘录与谈判参考要点。',
      aiRoleName: '合作洞察助手',
    },
  ],
  children: [
    {
      id: 'cto',
      name: '李强',
      title: '技术总监',
      aiLevel: 'high',
      digitalScore: 5,
      headcount: 1,
      aiCoverage: 95,
      aiTools: ['Copilot', 'Cursor', 'ChatGPT'],
      dataFlow: 6200,
      aiEfficiencyBoost: 72,
      aiReplacementRate: 55,
      timeSaved: '日均节省 4.2h',
      aiValue: '代码生成提速 72%，自动化测试覆盖 92%',
      digitalMaturity: [
        { name: '流程自动化', score: 5.0, max: 5 },
        { name: '数据驱动决策', score: 4.8, max: 5 },
        { name: 'AI 工具渗透', score: 5.0, max: 5 },
        { name: '协作数字化', score: 4.8, max: 5 },
        { name: '知识管理', score: 4.5, max: 5 },
      ],
      humanTasks: ['技术架构决策', '团队管理', '技术选型与评估'],
      aiTasks: ['代码审查辅助', '自动化测试生成', 'Bug 预测与修复'],
      collaborativeTasks: ['技术方案评审', '代码重构优化', '性能瓶颈分析'],
      humanWorkloadPct: 40,
      aiWorkloadPct: 42,
      aiValueMetrics: [
        { label: '编码提速', value: '72%', icon: 'ri-code-line', color: 'blue' },
        { label: '测试覆盖', value: '92%', icon: 'ri-shield-check-line', color: 'blue' },
        { label: 'Bug检出', value: '3x', icon: 'ri-bug-line', color: 'sky' },
      ],
      workflowSteps: [
        {
          title: '架构设计',
          humanTask: '制定系统架构蓝图，做出关键技术路线选择，攻克复杂技术难关。',
          aiTask: '自动生成架构对比报告、性能基准测试数据与业务规模扩展参考建议。',
          aiRoleName: '架构推演助手',
        },
        {
          title: '技术选型',
          humanTask: '评估新技术引入对项目和团队成员的影响，确定试点范围再推广。',
          aiTask: '自动扫描技术社区、分析框架活跃度与迁移成本，出具选型分析与预测报告。',
          aiRoleName: '技术雷达助手',
        },
        {
          title: '代码管理',
          humanTask: '审核核心模块逻辑，把关架构一致性，决定是否合并发版。',
          aiTask: '自动扫描代码规范、安全漏洞、重复逻辑并给出修复建议与复杂度报告。',
          aiRoleName: '代码质量助手',
        },
        {
          title: '团队管理',
          humanTask: '推动技术团队成长路径，分配技术项目资源，驱动团队文化建设。',
          aiTask: '分析团队成员技能画像和项目负载，生成培训建议与绩效数据报告。',
          aiRoleName: '团队动态助手',
        },
      ],
      children: [
        {
          id: 'rnd',
          name: '研发中心',
          title: '',
          aiLevel: 'high',
          digitalScore: 5,
          headcount: 32,
          aiCoverage: 95,
          aiTools: ['Copilot', 'Cursor', 'ChatGPT', 'Claude'],
          dataFlow: 4800,
          aiEfficiencyBoost: 65,
          aiReplacementRate: 48,
          timeSaved: '日均节省 3.8h',
          aiValue: '代码生成提速 65%，Bug 检出率提升 3x',
          digitalMaturity: [
            { name: '流程自动化', score: 4.8, max: 5 },
            { name: '数据驱动决策', score: 4.5, max: 5 },
            { name: 'AI 工具渗透', score: 5.0, max: 5 },
            { name: '协作数字化', score: 4.6, max: 5 },
            { name: '知识管理', score: 4.0, max: 5 },
          ],
          roles: ['前端开发', '后端开发', '架构师', '测试工程师', 'DevOps'],
          humanTasks: ['复杂业务逻辑设计', '系统架构设计', '技术难点攻关', '代码审查最终决策'],
          aiTasks: ['API 代码生成', '单元测试自动生成', 'Bug 定位与修复', '文档自动生成'],
          collaborativeTasks: ['需求评审与技术方案讨论', '代码重构与性能优化', 'CR 流程中的人机结合审查'],
          humanWorkloadPct: 32,
          aiWorkloadPct: 48,
          aiValueMetrics: [
            { label: '编码效率', value: '65%', icon: 'ri-code-s-slash-line', color: 'blue' },
            { label: '测试生成', value: '92%', icon: 'ri-checkbox-multiple-line', color: 'blue' },
            { label: '节省工时', value: '3.8h', icon: 'ri-time-line', color: 'sky' },
          ],
          workflowSteps: [
            {
              title: '需求评审',
              humanTask: '分析产品需求文档，确认业务逻辑与关键技术约束，识别风险。',
              aiTask: '自动生成需求文档摘要、接口定义建议、数据库建模与工时估算平均。',
              aiRoleName: '需求分析助手',
            },
            {
              title: '代码管理',
              humanTask: '审核核心模块逻辑，把关架构一致性，决定是否合并发版。',
              aiTask: '自动扫描代码规范、安全漏洞、重复逻辑并给出修复建议与复杂度报告。',
              aiRoleName: '代码质量助手',
            },
            {
              title: '发布管理',
              humanTask: '制定发布计划，审批发布灰度范围，复核测试，确认发布上线。',
              aiTask: '自动生成发布检查清单、执行回归脚本、实时追踪发布进度与采集日志。',
              aiRoleName: '发布助手',
            },
          ],
        },
        {
          id: 'ai-lab',
          name: 'AI 实验室',
          title: '',
          aiLevel: 'high',
          digitalScore: 5,
          headcount: 18,
          aiCoverage: 100,
          aiTools: ['自研模型', 'AutoML', 'LLaMA', 'LangChain'],
          dataFlow: 5600,
          aiEfficiencyBoost: 85,
          aiReplacementRate: 62,
          timeSaved: '日均节省 5.5h',
          aiValue: '模型训练周期缩短 85%，推理成本降低 60%',
          digitalMaturity: [
            { name: '流程自动化', score: 5.0, max: 5 },
            { name: '数据驱动决策', score: 5.0, max: 5 },
            { name: 'AI 工具渗透', score: 5.0, max: 5 },
            { name: '协作数字化', score: 4.8, max: 5 },
            { name: '知识管理', score: 4.8, max: 5 },
          ],
          roles: ['算法工程师', '模型训练师', 'AI 应用开发', '数据科学家'],
          humanTasks: ['前沿算法研究', '模型架构创新设计', '业务场景定义与评估', '模型上线最终决策'],
          aiTasks: ['超参数自动搜索', '数据清洗与标注', '模型自动蒸馏', '推理性能自动优化'],
          collaborativeTasks: ['训练数据质量审核', '模型效果迭代调优', 'A/B 测试策略设计'],
          humanWorkloadPct: 25,
          aiWorkloadPct: 55,
          aiValueMetrics: [
            { label: '训练提速', value: '85%', icon: 'ri-speed-line', color: 'blue' },
            { label: '推理降本', value: '60%', icon: 'ri-coins-line', color: 'blue' },
            { label: '节省工时', value: '5.5h', icon: 'ri-time-line', color: 'sky' },
          ],
          workflowSteps: [
            {
              title: '模型立项',
              humanTask: '确定模型目标、评估指标与业务约束，选择网络架构方向。',
              aiTask: '自动推荐候选模型结构、生成训练 pipeline 与超参数搜索空间。',
              aiRoleName: '模型规划助手',
            },
            {
              title: '模型训练',
              humanTask: '监控训练过程，处理异常曲线，判断是否提前停止训练。',
              aiTask: '自动执行超参优化、数据增强，模型结构演进与训练优化。',
              aiRoleName: '训练优化助手',
            },
            {
              title: '效果评估',
              humanTask: '对照业务评估标准，判断模型是否达到上线效果并决定推广范围。',
              aiTask: '自动运行 A/B 测试、生成效果对比报告与异常指标预警清单。',
              aiRoleName: '评估助手',
            },
          ],
        },
      ],
    },
    {
      id: 'cmo',
      name: '王芳',
      title: '市场总监',
      aiLevel: 'medium',
      digitalScore: 4,
      headcount: 1,
      aiCoverage: 60,
      aiTools: ['数据分析', 'AIGC', '智能投放'],
      dataFlow: 3900,
      aiEfficiencyBoost: 48,
      aiReplacementRate: 35,
      timeSaved: '日均节省 2.8h',
      aiValue: '广告投放 ROI 提升 40%，文案产出效率提升 3x',
      digitalMaturity: [
        { name: '流程自动化', score: 3.8, max: 5 },
        { name: '数据驱动决策', score: 4.2, max: 5 },
        { name: 'AI 工具渗透', score: 3.8, max: 5 },
        { name: '协作数字化', score: 4.0, max: 5 },
        { name: '知识管理', score: 3.5, max: 5 },
      ],
      humanTasks: ['品牌战略制定', '大型活动策划', '媒体关系维护'],
      aiTasks: ['竞品舆情监控', '投放效果实时分析', '用户画像自动更新'],
      collaborativeTasks: ['营销方案共创', '内容矩阵规划', '投放预算优化'],
      humanWorkloadPct: 50,
      aiWorkloadPct: 28,
      aiValueMetrics: [
        { label: '投放ROI', value: '+40%', icon: 'ri-line-chart-line', color: 'sky' },
        { label: '文案效率', value: '3x', icon: 'ri-edit-line', color: 'sky' },
        { label: '洞察覆盖', value: '全域', icon: 'ri-radar-line', color: 'sky' },
      ],
      workflowSteps: [
        {
          title: '品牌策略',
          humanTask: '制定品牌定位和创意主张，把控大型活动策划与媒体采买策略。',
          aiTask: '实时监测竞品舆论、行业媒体热度，生成竞品洞察与策略支撑报告。',
          aiRoleName: '品牌洞察助手',
        },
        {
          title: '投放优化',
          humanTask: '审定投放预算分配，把握核心渠道优先级，拍板大额采买方向。',
          aiTask: '实时调整投放数据，自动优化出价、圈选，降低流量采购成本。',
          aiRoleName: '智能投放助手',
        },
        {
          title: '内容管理',
          humanTask: '把控品牌调性，审核创意内容，确保 AI 生产内容与品牌一致性。',
          aiTask: '自动生成多版本平台文案、视频脚本与视觉素材，实时监测内容热度。',
          aiRoleName: '内容创作助手',
        },
        {
          title: '效果复盘',
          humanTask: '分析整体营销 ROI，决定下一阶段策略重点调整与预算分配。',
          aiTask: '自动归因各渠道转化路径，生成全域漏斗洞察与竞品对比报告。',
          aiRoleName: '效果复盘助手',
        },
      ],
      children: [
        {
          id: 'brand',
          name: '品牌营销',
          title: '',
          aiLevel: 'medium',
          digitalScore: 3,
          headcount: 12,
          aiCoverage: 45,
          aiTools: ['文案生成', '数据监听', 'AIGC'],
          dataFlow: 2100,
          aiEfficiencyBoost: 42,
          aiReplacementRate: 28,
          timeSaved: '日均节省 2.1h',
          aiValue: '品牌文案产出效率提升 42%，舆情监控覆盖率提升 50%',
          digitalMaturity: [
            { name: '流程自动化', score: 3.2, max: 5 },
            { name: '数据驱动决策', score: 3.5, max: 5 },
            { name: 'AI 工具渗透', score: 3.0, max: 5 },
            { name: '协作数字化', score: 3.5, max: 5 },
            { name: '知识管理', score: 3.0, max: 5 },
          ],
          roles: ['品牌经理', 'PR 专员', '活动策划'],
          humanTasks: ['品牌策略制定', '大型活动策划执行', '媒体关系维护', '创意方向把控'],
          aiTasks: ['日常媒体文案生成', '舆情监测与报告', '竞品数据分析'],
          collaborativeTasks: ['营销文案与视觉角色', '视觉素材 AIGC 制作', '效果数据分析'],
          humanWorkloadPct: 55,
          aiWorkloadPct: 22,
          aiValueMetrics: [
            { label: '文案效率', value: '42%', icon: 'ri-article-line', color: 'sky' },
            { label: '周期缩短', value: '-50%', icon: 'ri-refresh-line', color: 'sky' },
            { label: '监测覆盖', value: '24/7', icon: 'ri-eye-line', color: 'sky' },
          ],
          workflowSteps: [
            {
              title: '内容策划',
              humanTask: '把控品牌调性，策划活动创意主题，制定 campaign 方向。',
              aiTask: '自动生成多平台文案、视觉脚本与配音素材，基于热点话题。',
              aiRoleName: '文案创作助手',
            },
            {
              title: '效果监测',
              humanTask: '判断 campaign 传播效果，指导运营团队做下一步策略调整。',
              aiTask: '实时追踪曝光、互动转化数据，自动生成报表与异常预警。',
              aiRoleName: '数据监测助手',
            },
            {
              title: '舆情管理',
              humanTask: '制定危机公关预案，处理突发舆情负面事件的回应决策。',
              aiTask: '7×24 全网品牌舆情监测与负面识别，实时预警并推送应对建议。',
              aiRoleName: '舆情监测助手',
            },
          ],
        },
        {
          id: 'growth',
          name: '用户增长',
          title: '',
          aiLevel: 'high',
          digitalScore: 4,
          headcount: 15,
          aiCoverage: 82,
          aiTools: ['智能投放', 'AIGC', 'AB测试AI'],
          dataFlow: 3400,
          aiEfficiencyBoost: 58,
          aiReplacementRate: 45,
          timeSaved: '日均节省 3.5h',
          aiValue: '投放转化提升 58%，A/B 测试周期从 2 周缩至 3 天',
          digitalMaturity: [
            { name: '流程自动化', score: 4.2, max: 5 },
            { name: '数据驱动决策', score: 4.5, max: 5 },
            { name: 'AI 工具渗透', score: 4.2, max: 5 },
            { name: '协作数字化', score: 4.0, max: 5 },
            { name: '知识管理', score: 3.5, max: 5 },
          ],
          roles: ['投放专员', 'SEO', '增长营销', '数据分析师'],
          humanTasks: ['增长目标制定与归因', '渠道拓展合作谈判', '用户运营策略与活动运营'],
          aiTasks: ['智能出价与预算预测分配', '素材自动测试与圈选', '漏斗自动诊断与圈选'],
          collaborativeTasks: ['投放策略人机迭代', 'A/B 测试方案设计', '转化漏斗归因分析'],
          humanWorkloadPct: 30,
          aiWorkloadPct: 45,
          aiValueMetrics: [
            { label: '转化提升', value: '58%', icon: 'ri-filter-line', color: 'blue' },
            { label: '测试提速', value: '-89%', icon: 'ri-timer-flash-line', color: 'blue' },
            { label: '节省工时', value: '3.5h', icon: 'ri-time-line', color: 'sky' },
          ],
          workflowSteps: [
            {
              title: '增长策划',
              humanTask: '制定增长目标与归因背景指标，审批核心渠道预算分配。',
              aiTask: '分析历史投放数据和用户行为，预测各渠道 ROI 预期。',
              aiRoleName: '增长预测助手',
            },
            {
              title: 'A/B 测试',
              humanTask: '审定实验方案，判断胜出组结果，决策是否全量推广。',
              aiTask: '自动创建实验，实时统计测试结果，推荐胜出方案，生成迭代报告。',
              aiRoleName: '测试优化助手',
            },
            {
              title: '用户分层',
              humanTask: '定义高价值用户画像，优化分层运营策略与资源投入优先级。',
              aiTask: '自动分析用户行为特征，生成精细化召回方案，预测流失清单。',
              aiRoleName: '用户分层助手',
            },
          ],
        },
      ],
    },
    {
      id: 'cso',
      name: '陈刚',
      title: '销售总监',
      aiLevel: 'high',
      digitalScore: 4,
      headcount: 1,
      aiCoverage: 78,
      aiTools: ['CRM智能分析', '客户画像AI', '智能报价', '合同AI'],
      dataFlow: 5200,
      aiEfficiencyBoost: 62,
      aiReplacementRate: 40,
      timeSaved: '日均节省 3.8h',
      aiValue: '客户转化效率提升 62%，销售周期缩短 45%',
      digitalMaturity: [
        { name: '流程自动化', score: 4.2, max: 5 },
        { name: '数据驱动决策', score: 4.5, max: 5 },
        { name: 'AI 工具渗透', score: 4.2, max: 5 },
        { name: '协作数字化', score: 4.0, max: 5 },
        { name: '知识管理', score: 3.5, max: 5 },
      ],
      humanTasks: ['大客户战略关系维护', '关键合同谈判与签约', '销售团队目标制定与督导', '跨部门资源协调'],
      aiTasks: ['销售漏斗实时预测', '客户画像自动更新', '竞品报价动态监测', '销售报告自动生成'],
      collaborativeTasks: ['销售方案评审', '大客户激励方案制定', '销售话术库优化'],
      humanWorkloadPct: 30,
      aiWorkloadPct: 48,
      aiValueMetrics: [
        { label: '转化提升', value: '62%', icon: 'ri-funds-line', color: 'blue' },
        { label: '周期缩短', value: '-45%', icon: 'ri-time-line', color: 'blue' },
        { label: '预测准确', value: '92%', icon: 'ri-bar-chart-line', color: 'sky' },
      ],
      workflowSteps: [
        {
          title: '销售策划',
          humanTask: '制定季度销售目标与市场进攻策略，审批重要客户的优先级安排。',
          aiTask: '实时分析销售漏斗与市场态势和竞品动态，生成策略支撑的参考建议。',
          aiRoleName: '策略分析助手',
        },
        {
          title: '大客户跟进',
          humanTask: '维护战略客户关系，推进关键谈判，建立信任与推动拔漏斗。',
          aiTask: '自动生成客户洞察报告、跟进计划预测提醒与商机推荐清单。',
          aiRoleName: '客户洞察助手',
        },
        {
          title: '团队赋能',
          humanTask: '组织销售培训体系，开展实战演练，经验萃取推动团队快速成长。',
          aiTask: '自动分析销售通话记录，生成话术优化与异常处理模板。',
          aiRoleName: '销售教练助手',
        },
        {
          title: '业绩管理',
          humanTask: '监控月度业绩进展，识别瓶颈环节，推动下阶段过程方案。',
          aiTask: '自动识别业绩落后路径并预测缺口，推荐资源补充方案清单。',
          aiRoleName: '业绩预测助手',
        },
      ],
      children: [
        {
          id: 'sales-major',
          name: '大客户销售',
          title: '',
          aiLevel: 'high',
          digitalScore: 4,
          headcount: 12,
          aiCoverage: 80,
          aiTools: ['CRM AI', '智能报价', '合同生成AI', '客户档案'],
          dataFlow: 3600,
          aiEfficiencyBoost: 65,
          aiReplacementRate: 42,
          timeSaved: '日均节省 4.0h',
          aiValue: '大客户签约周期缩短 65%，客户匹配准确率提升至 88%',
          positionDescription: '大客户销售岗位基于 OPT 人机协作岗位平台，人工员工专注大客户关系维护与销售关键节点把控，AI 数字员工承担线索筛选、客户服务、方案生成、合同生成等规模化任务，形成「人工主导关系 + AI 赋能规模」的销售协同闭环。',
          digitalMaturity: [
            { name: '流程自动化', score: 4.0, max: 5 },
            { name: '数据驱动决策', score: 4.2, max: 5 },
            { name: 'AI 工具渗透', score: 4.5, max: 5 },
            { name: '协作数字化', score: 4.0, max: 5 },
            { name: '知识管理', score: 3.5, max: 5 },
          ],
          roles: ['大客户经理', '售前顾问', '商务谈判', '客户关系'],
          humanTasks: ['关键客户深度拜访和关系维护', '商务谈判和合同条款审定', '销售演示投资回报说明', '客户危机关系协调'],
          aiTasks: ['潜在客户情报自动筛选分析', '客户公司画像和信息自动更新', '竞品报价与方案自动对比', '合同条款自动识别'],
          collaborativeTasks: ['方案撰写人机协同起草', '客户演示材料 AI 辅助生成', '签约后客户生命周期管理'],
          humanWorkloadPct: 28,
          aiWorkloadPct: 50,
          aiValueMetrics: [
            { label: '签约缩短', value: '-65%', icon: 'ri-calendar-check-line', color: 'blue' },
            { label: '匹配准确', value: '88%', icon: 'ri-shield-check-line', color: 'blue' },
            { label: '线索筛选', value: '10x', icon: 'ri-search-line', color: 'sky' },
          ],
          workflowSteps: [
            {
              title: '线索情报筛选',
              humanTask: '确定目标客户画像和行业优先级，审核 AI 筛选出的高价值候选清单，判断是否拨入销售资源。',
              aiTask: '实时扫描全网行业动态、招标信息、公司公告，自动匹配 ICP 画像并创建潜在客户 Top 20 优先联络建议与接触建议。',
              description: '深度情报研究准确定位潜在大客户',
              aiRoleName: '情报线索筛选助手',
            },
            {
              title: '客户深度洞察',
              humanTask: '阅读 AI 生成的客户洞察报告，补充一线业务判断与信息，识别关键决策人和潜在顾虑。',
              aiTask: '自动综合客户公司财报、组织架构、竞品动态与社交媒体信息，生成结构化客户洞察全景图，标注信号。',
              description: '深度了解客户知己知彼',
              aiRoleName: '客户洞察分析助手',
            },
            {
              title: '商务拜访建立',
              humanTask: '开展客户谈判沟通，挖掘客户真实需求与战略目标，判断实际预算范围与决策时间节点。',
              aiTask: '实时转录会议对话，自动提取关键词、潜在反对意见优先级顺序；结合历史成交记录推荐推进策略与实战建议。',
              description: '精准识别客户实际需求',
              aiRoleName: '商务智能分析助手',
            },
            {
              title: '方案驱动破局',
              humanTask: '基于 AI 生成的方案建议，加入行业洞察与业务计划核心数据，确认价值主张和匹配客户预期。',
              aiTask: '根据客户画像自动匹配最优产品组合，生成定制化方案建议 PPT、ROI 计算器与实施路线图，自动测试提案与技术问答。',
              description: '人机协同精准方案匹配确认价值',
              aiRoleName: '方案生成智能助手',
            },
            {
              title: '商务谈判签约',
              humanTask: '推进谈判进展，处理核心条款协商，应对客户异议，把握合同签约时机。',
              aiTask: '实时分析谈判对话，推荐应对策略与话术，自动生成合同草稿包含附件、历史成交记录与谈判会议记录参考。',
              description: '谈判底线与人机互鉴双赢结果',
              aiRoleName: '谈判辅助智能助手',
            },
            {
              title: '售后综合跟进',
              humanTask: '定期回访客户高层，收集反馈，深化关系，召开客户转化会议，维护长期战略合作关系。',
              aiTask: '自动追踪签约后客户使用数据，预测客户流失风险，自动生成客户满意度报告、续费预测与追加销售推荐清单。',
              description: '签约维护与客户的闭环增长',
              aiRoleName: '客户成功管理助手',
            },
          ],
        },
        {
          id: 'sales-inside',
          name: '内部销售',
          title: '',
          aiLevel: 'medium',
          digitalScore: 3,
          headcount: 18,
          aiCoverage: 55,
          aiTools: ['电话AI', '邮件AI', 'CRM自动录入'],
          dataFlow: 2800,
          aiEfficiencyBoost: 45,
          aiReplacementRate: 30,
          timeSaved: '日均节省 2.5h',
          aiValue: '销售触达效率提升 45%，邮件回复率提升 3x',
          digitalMaturity: [
            { name: '流程自动化', score: 3.5, max: 5 },
            { name: '数据驱动决策', score: 3.5, max: 5 },
            { name: 'AI 工具渗透', score: 3.5, max: 5 },
            { name: '协作数字化', score: 3.2, max: 5 },
            { name: '知识管理', score: 3.0, max: 5 },
          ],
          roles: ['SDR', 'AE', '客户成功'],
          humanTasks: ['中小客户深入沟通', '异议处理与转化推进', '客户成功续约谈判'],
          aiTasks: ['线索清洗自动化筛选', '个性化邮件自动生成', '合同续签自动提醒'],
          collaborativeTasks: ['销售话术库持续优化', '客户分层运营管理', '售前售后人机协同'],
          humanWorkloadPct: 45,
          aiWorkloadPct: 28,
          aiValueMetrics: [
            { label: '触达效率', value: '45%', icon: 'ri-phone-line', color: 'sky' },
            { label: '邮件回复', value: '3x', icon: 'ri-mail-line', color: 'sky' },
            { label: '录入效率', value: '90%', icon: 'ri-input-method-line', color: 'sky' },
          ],
          workflowSteps: [
            {
              title: '线索筛选',
              humanTask: '设定过滤条件与转化优先判断标准，调整 AI 筛出的潜力线索优先级安排。',
              aiTask: '自动清洗重复去除、数据标准化，识别已成交时间窗口与联系偏好。',
              aiRoleName: '线索筛选助手',
            },
            {
              title: '线索转化',
              humanTask: '与潜力线索进行电话沟通，挖掘客户需求，推动签约落实。',
              aiTask: '自动生成个性化邮件与跟进序列，制定次优联系时间与话题推荐。',
              aiRoleName: '销售跟进助手',
            },
            {
              title: '签约续签',
              humanTask: '审核合同内容与报价方案，协商合同权益，判断交接合适节点。',
              aiTask: '自动识别合同争议点、生成报价对比分析，并提出合规异议建议。',
              aiRoleName: '合同助手',
            },
          ],
        },
      ],
    },
    {
      id: 'coo',
      name: '赵磊',
      title: '运营总监',
      aiLevel: 'medium',
      digitalScore: 4,
      headcount: 1,
      aiCoverage: 55,
      aiTools: ['运营看板', 'RPA', '智能客服'],
      dataFlow: 4100,
      aiEfficiencyBoost: 52,
      aiReplacementRate: 38,
      timeSaved: '日均节省 3.0h',
      aiValue: '用户运营响应率提升 52%，工单处理效率提升 4x',
      digitalMaturity: [
        { name: '流程自动化', score: 4.0, max: 5 },
        { name: '数据驱动决策', score: 4.0, max: 5 },
        { name: 'AI 工具渗透', score: 3.8, max: 5 },
        { name: '协作数字化', score: 4.2, max: 5 },
        { name: '知识管理', score: 3.5, max: 5 },
      ],
      humanTasks: ['运营策略制定', '重大客户维护', '跨部门流程优化'],
      aiTasks: ['用户分层自动运营', '服务异常预测', '异常运营自动预警'],
      collaborativeTasks: ['运营指标复盘', '客户体验改进', '流程效率优化'],
      humanWorkloadPct: 45,
      aiWorkloadPct: 30,
      aiValueMetrics: [
        { label: '响应提升', value: '52%', icon: 'ri-reply-line', color: 'sky' },
        { label: '工单效率', value: '4x', icon: 'ri-file-list-line', color: 'sky' },
        { label: '服务时段', value: '7×24', icon: 'ri-24-hours-line', color: 'sky' },
      ],
      workflowSteps: [
        {
          title: '运营策划',
          humanTask: '制定季度运营目标与用户分层策略，审批重要活动的预算。',
          aiTask: '分析用户行为数据、历史指标与季节性规律，预测策略效果与最佳投放时机。',
          aiRoleName: '运营规划助手',
        },
        {
          title: '流程优化',
          humanTask: '识别跨部门运营流程瓶颈，推动流程标准化，把控关键里程碑。',
          aiTask: '自动分析流程执行数据，预测异常节点并推荐优化路径。',
          aiRoleName: '流程优化助手',
        },
        {
          title: '数据监控',
          humanTask: '审核核心运营指标与预警值，决策应对突发异常方向。',
          aiTask: '7×24 实时监控业务指标，自动推送异常预警与情况上报。',
          aiRoleName: '监控预警助手',
        },
        {
          title: '跨部门协同',
          humanTask: '协调产品、技术、营销等部门资源，推动重大项目优先落地。',
          aiTask: '自动追踪跨部门项目状态与资源占用情况，标注协同进度异常并建议。',
          aiRoleName: '协同追踪助手',
        },
      ],
      children: [
        {
          id: 'product-design',
          name: '产品设计',
          title: '',
          aiLevel: 'high',
          digitalScore: 4,
          headcount: 20,
          aiCoverage: 76,
          aiTools: ['Midjourney', 'Figma AI', 'UX AI'],
          dataFlow: 3200,
          aiEfficiencyBoost: 68,
          aiReplacementRate: 42,
          timeSaved: '日均节省 4.0h',
          aiValue: '设计原型产出提速 68%，用户测试覆盖率提升 3x',
          digitalMaturity: [
            { name: '流程自动化', score: 4.0, max: 5 },
            { name: '数据驱动决策', score: 4.2, max: 5 },
            { name: 'AI 工具渗透', score: 4.5, max: 5 },
            { name: '协作数字化', score: 4.5, max: 5 },
            { name: '知识管理', score: 3.8, max: 5 },
          ],
          roles: ['UI 设计师', 'UX 研究员', '产品经理', '交互设计师'],
          humanTasks: ['用户深度访谈', '产品策略方向把控', '复杂交互逻辑设计', '设计评审最终决策'],
          aiTasks: ['低保真原型自动生成', '设计规范自动检查', '界面标注图生成', '设计资产组件化'],
          collaborativeTasks: ['设计稿 AI 辅助评审', '用户测试方案设计', 'A/B 测试视觉素材'],
          humanWorkloadPct: 35,
          aiWorkloadPct: 42,
          aiValueMetrics: [
            { label: '原型产出', value: '68%', icon: 'ri-pencil-ruler-line', color: 'blue' },
            { label: '测试覆盖', value: '3x', icon: 'ri-flask-line', color: 'blue' },
            { label: '节省工时', value: '4.0h', icon: 'ri-time-line', color: 'sky' },
          ],
          workflowSteps: [
            {
              title: '用户研究',
              humanTask: '制定研究方案，执行深度用户访谈，分析真实使用行为。',
              aiTask: '自动分析访谈录音，生成行为数据，输出用户旅程图和需求优先级。',
              aiRoleName: '用户研究助手',
            },
            {
              title: '原型设计',
              humanTask: '把控产品策略，主导视觉交互和信息架构设计。',
              aiTask: '基于需求自动生成低保真原型、设计规范检查与界面标注图。',
              aiRoleName: '原型生成助手',
            },
            {
              title: '设计验证',
              humanTask: '组织可用性测试，观察用户行为，推进后续设计优化决策。',
              aiTask: '自动生成测试问卷脚本，量化界面问题，运行 A/B 测试推荐改进。',
              aiRoleName: '验证助手',
            },
          ],
        },
        {
          id: 'ops-service',
          name: '运营服务',
          title: '',
          aiLevel: 'medium',
          digitalScore: 3,
          headcount: 28,
          aiCoverage: 38,
          aiTools: ['智能客服', 'RPA', '工单AI'],
          dataFlow: 2800,
          aiEfficiencyBoost: 45,
          aiReplacementRate: 30,
          timeSaved: '日均节省 2.2h',
          aiValue: '智能客服覆盖率 85%，工单平均处理时长缩短 70%',
          digitalMaturity: [
            { name: '流程自动化', score: 3.5, max: 5 },
            { name: '数据驱动决策', score: 3.5, max: 5 },
            { name: 'AI 工具渗透', score: 3.2, max: 5 },
            { name: '协作数字化', score: 3.8, max: 5 },
            { name: '知识管理', score: 3.0, max: 5 },
          ],
          roles: ['用户运营', '客服专员', '活动运营', '供应商'],
          humanTasks: ['高价值客户专属维护', '复杂客诉调解处理', '供应商异常协调', '活动执行'],
          aiTasks: ['7×24 智能客服响应', '工单自动分类与生成', 'FAQ 知识库自动更新', '用户情绪自动分析'],
          collaborativeTasks: ['客服问题 AI 辅助解答', '客户满意度调研', '运营报告人机协同', '效果数据进行反馈'],
          humanWorkloadPct: 50,
          aiWorkloadPct: 25,
          aiValueMetrics: [
            { label: '客服覆盖', value: '85%', icon: 'ri-customer-service-line', color: 'sky' },
            { label: '工单效率', value: '70%', icon: 'ri-task-line', color: 'sky' },
            { label: '服务时段', value: '7×24', icon: 'ri-24-hours-line', color: 'sky' },
          ],
          workflowSteps: [
            {
              title: '客服响应',
              humanTask: '处理复杂客诉问题和投诉，维护高价值客户专属关系。',
              aiTask: '7×24 响应常见问题，自动推送工单分类与推荐方案及常见问题解答。',
              aiRoleName: '智能客服助手',
            },
            {
              title: '工单管理',
              humanTask: '审核高复杂工单类型，决策关键异常，负责大客户升级问题处理。',
              aiTask: '自动生成工单追踪进度、预测处理时间，并生成产品改进反馈报告。',
              aiRoleName: '工单管理助手',
            },
            {
              title: '用户留存',
              humanTask: '制定客户留存活动与运营策略，重点跟进 VIP 客户特殊关怀。',
              aiTask: '自动分析用户活跃度变化，检测 NPS 变化，生成改进建议清单。',
              aiRoleName: '留存助手',
            },
          ],
        },
      ],
    },
    {
      id: 'cfo',
      name: '刘梅',
      title: '财务总监',
      aiLevel: 'low',
      digitalScore: 3,
      headcount: 1,
      aiCoverage: 30,
      aiTools: ['财税报表AI', '审计AI'],
      dataFlow: 1800,
      aiEfficiencyBoost: 35,
      aiReplacementRate: 22,
      timeSaved: '日均节省 1.8h',
      aiValue: '财务自动化覆盖率 60%，审计效率提升 35%',
      digitalMaturity: [
        { name: '流程自动化', score: 3.0, max: 5 },
        { name: '数据驱动决策', score: 3.2, max: 5 },
        { name: 'AI 工具渗透', score: 2.8, max: 5 },
        { name: '协作数字化', score: 3.0, max: 5 },
        { name: '知识管理', score: 2.5, max: 5 },
      ],
      humanTasks: ['财务合规决策', '预算规划审批', '税务筹划与申报'],
      aiTasks: ['报表数据自动汇总', '异常交易自动预警', '高频表格批量处理'],
      collaborativeTasks: ['预算执行分析', '审计配合', '成本结构优化'],
      humanWorkloadPct: 65,
      aiWorkloadPct: 15,
      aiValueMetrics: [
        { label: '财务自动', value: '60%', icon: 'ri-file-chart-line', color: 'slate' },
        { label: '审计效率', value: '35%', icon: 'ri-search-line', color: 'slate' },
        { label: '异常预警', value: '实时', icon: 'ri-alarm-warning-line', color: 'slate' },
      ],
      workflowSteps: [
        {
          title: '预算规划',
          humanTask: '制定年度预算总量，审批大额支出和投资优先级指引。',
          aiTask: '自动整合历史财务数据，生成预算草稿分配建议与弹性预测模型。',
          aiRoleName: '预算分析助手',
        },
        {
          title: '账务处理',
          humanTask: '执行合规审核流程，处理重大异常账务，决策账目调整。',
          aiTask: '自动识别异常账务、记账规则匹配，生成合规核查预警清单。',
          aiRoleName: '账务审核助手',
        },
        {
          title: '税务筹划',
          humanTask: '研究税收政策变化，制定合规合理税务优化策略与申报方案。',
          aiTask: '自动匹配最新税收法规，生成税务优化建议与合规申报辅助清单。',
          aiRoleName: '税务合规助手',
        },
        {
          title: '资金管理',
          humanTask: '统筹资金使用计划，审批关键融资与投资安排。',
          aiTask: '实时监控账户余额与应收应付，预测资金状态并给出确切分析。',
          aiRoleName: '资金预测助手',
        },
      ],
      children: [
        {
          id: 'finance',
          name: '财务会计',
          title: '',
          aiLevel: 'low',
          digitalScore: 3,
          headcount: 8,
          aiCoverage: 25,
          aiTools: ['自动记账', '审计AI'],
          dataFlow: 1200,
          aiEfficiencyBoost: 32,
          aiReplacementRate: 18,
          timeSaved: '日均节省 1.5h',
          aiValue: '账务处理时长缩短 32%，合规核查自动化 55%',
          digitalMaturity: [
            { name: '流程自动化', score: 2.8, max: 5 },
            { name: '数据驱动决策', score: 3.0, max: 5 },
            { name: 'AI 工具渗透', score: 2.5, max: 5 },
            { name: '协作数字化', score: 2.8, max: 5 },
            { name: '知识管理', score: 2.2, max: 5 },
          ],
          roles: ['会计', '预算分析师', '审计'],
          humanTasks: ['凭证核查审核', '税务申报', '预算分析', '审计配合'],
          aiTasks: ['凭证自动录入', '发票自动识别', '报表自动汇总'],
          collaborativeTasks: ['新账务处理优化', '异常科目分析', '内控流程优化'],
          humanWorkloadPct: 68,
          aiWorkloadPct: 12,
          aiValueMetrics: [
            { label: '账务提效', value: '32%', icon: 'ri-file-reduce-line', color: 'slate' },
            { label: '合规自动', value: '55%', icon: 'ri-shield-check-line', color: 'slate' },
            { label: '发票识别', value: '95%', icon: 'ri-scan-line', color: 'slate' },
          ],
          workflowSteps: [
            {
              title: '账务录入',
              humanTask: '审核原始凭证，处理异常账务，确认账实相符准确。',
              aiTask: '自动识别发票，自动录入凭证，自动完成科目归集汇总。',
              aiRoleName: '账务助手',
            },
            {
              title: '预算分析',
              humanTask: '分析预算执行偏差并撰写分析报告，识别并制定改进计划。',
              aiTask: '自动汇总各预算执行数据，标识偏差异常，生成对比预测。',
              aiRoleName: '预算分析助手',
            },
            {
              title: '合规申报',
              humanTask: '审核税务申报数据，确保合规报告准确性，应对税务稽查。',
              aiTask: '自动匹配最新税收政策，生成申报辅助建议与备查提示清单。',
              aiRoleName: '合规助手',
            },
          ],
        },
        {
          id: 'hr',
          name: '人力资源',
          title: '',
          aiLevel: 'medium',
          digitalScore: 3,
          headcount: 6,
          aiCoverage: 52,
          aiTools: ['AI招聘', '人才库AI', '绩效AI'],
          dataFlow: 1500,
          aiEfficiencyBoost: 48,
          aiReplacementRate: 35,
          timeSaved: '日均节省 2.6h',
          aiValue: '简历筛选效率提升 8x，职位匹配准确率提升 40%',
          digitalMaturity: [
            { name: '流程自动化', score: 3.5, max: 5 },
            { name: '数据驱动决策', score: 3.5, max: 5 },
            { name: 'AI 工具渗透', score: 3.8, max: 5 },
            { name: '协作数字化', score: 3.2, max: 5 },
            { name: '知识管理', score: 3.0, max: 5 },
          ],
          roles: ['招聘专员', '培训师', '绩效专员'],
          humanTasks: ['核定岗位需求与胜任模型', '员工的关怀面谈', '薪酬体系设计', '员工关系维护'],
          aiTasks: ['简历自动筛选评分', 'JD 自动生成优化', '培训课程自动推荐', '培训内容自动匹配'],
          collaborativeTasks: ['人才发展路径建模', '绩效数据分析优化', '校招方案人机迭代', '离职原因分析预测'],
          humanWorkloadPct: 42,
          aiWorkloadPct: 35,
          aiValueMetrics: [
            { label: '筛选效率', value: '8x', icon: 'ri-user-search-line', color: 'sky' },
            { label: '匹配准确', value: '+40%', icon: 'ri-user-star-line', color: 'sky' },
            { label: '节省工时', value: '2.6h', icon: 'ri-time-line', color: 'sky' },
          ],
          workflowSteps: [
            {
              title: '招聘筛选',
              humanTask: '设计岗位胜任力模型，面试顶候选人，推进 offer 谈薪。',
              aiTask: '自动筛选简历打分、评估候选人与 JD 匹配度并推荐人才。',
              aiRoleName: '招聘筛选助手',
            },
            {
              title: '绩效管理',
              humanTask: '推进绩效面谈校准，制定晋升标准，推动改进计划与激励机制。',
              aiTask: '自动汇总绩效数据、360 度反馈问卷与分析改进建议报告。',
              aiRoleName: '绩效分析助手',
            },
            {
              title: '人才发展',
              humanTask: '制定人才梯队计划，辅导高潜员工加速路径，决策激励机制。',
              aiTask: '自动分析员工技能画像与学习轨迹，生成发展建议与培训匹配方案。',
              aiRoleName: '人才发展助手',
            },
          ],
        },
      ],
    },
  ],
};

export function collectConnections(
  node: OrgNode
): Array<{ from: string; to: string; level: 'high' | 'medium' | 'low' }> {
  const connections: Array<{ from: string; to: string; level: 'high' | 'medium' | 'low' }> = [];
  if (node.children) {
    node.children.forEach((child) => {
      connections.push({ from: node.id, to: child.id, level: child.aiLevel });
      connections.push(...collectConnections(child));
    });
  }
  return connections;
}

// ─── 后端 Department → OrgNode mapper ────────────────────────────────────────

import type { Department } from '@/api/types/department';

function levelToAiLevel(level: 1 | 2 | 3): 'high' | 'medium' | 'low' {
  if (level === 3) return 'high';
  if (level === 2) return 'medium';
  return 'low';
}

export function backendToOrgNode(dept: Department): OrgNode {
  const aiLevel = levelToAiLevel(dept.ai_empowerment_level);
  const efficiency = dept.efficiency_improvement_percent ?? 0;
  const aiCoverage = aiLevel === 'high' ? 90 : aiLevel === 'medium' ? 60 : 30;
  const digitalScore = aiLevel === 'high' ? 5 : aiLevel === 'medium' ? 4 : 3;

  const workflowSteps = (dept.sub_jobs ?? []).map(s => ({
    title: s.job_title,
    humanTask: s.manual_task,
    aiTask: s.agent_task,
    description: s.job_desc,
    aiRoleName: s.agent_id,
  }));

  return {
    id: String(dept.id),
    name: dept.department_name,
    title: dept.position_title ?? '',
    aiLevel,
    digitalScore,
    headcount: 1,
    aiCoverage,
    aiTools: ['AI助手'],
    dataFlow: 200,
    aiEfficiencyBoost: efficiency,
    aiReplacementRate: aiLevel === 'high' ? 40 : aiLevel === 'medium' ? 25 : 15,
    timeSaved: efficiency > 0 ? `效率提升 ${efficiency}%` : '暂无数据',
    aiValue: `${dept.department_name} — ${dept.position_title ?? ''}`,
    positionDescription: dept.job_desc ?? '',
    digitalMaturity: [
      { name: '流程自动化', score: digitalScore, max: 5 },
      { name: '数据驱动', score: digitalScore, max: 5 },
      { name: 'AI渗透率', score: digitalScore, max: 5 },
      { name: '协作数字化', score: digitalScore, max: 5 },
      { name: '知识管理', score: Math.max(1, digitalScore - 0.5), max: 5 },
    ],
    humanTasks: ['人工决策'],
    aiTasks: ['AI自动化'],
    collaborativeTasks: ['人机协同'],
    humanWorkloadPct: 50,
    aiWorkloadPct: 30,
    aiValueMetrics: [
      { label: '效率提升', value: efficiency > 0 ? `+${efficiency}%` : 'N/A', icon: 'ri-rocket-line', color: 'blue' },
      { label: 'AI覆盖', value: `${aiCoverage}%`, icon: 'ri-pie-chart-line', color: 'sky' },
    ],
    workflowSteps: workflowSteps.length > 0 ? workflowSteps : undefined,
    children: (dept.children ?? []).length > 0
      ? (dept.children ?? []).map(backendToOrgNode)
      : undefined,
  };
}

// ─── 从树形数据计算 KPI ────────────────────────────────────────────────────────

export interface KpiStats {
  totalNodes: number;
  highAiCount: number;
  avgEfficiency: number;
  departmentCount: number;
}

export function calcKpiStats(dept: Department): KpiStats {
  let total = 0, highAi = 0, effSum = 0, effCount = 0;

  function walk(d: Department) {
    total++;
    if (d.ai_empowerment_level === 3) highAi++;
    if (d.efficiency_improvement_percent > 0) {
      effSum += d.efficiency_improvement_percent;
      effCount++;
    }
    (d.children ?? []).forEach(walk);
  }
  walk(dept);

  return {
    totalNodes: total,
    highAiCount: highAi,
    avgEfficiency: effCount > 0 ? Math.round(effSum / effCount) : 0,
    departmentCount: total,
  };
}
