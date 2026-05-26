import { useState } from "react";
import { CopawWorkbenchShell } from "@/components/CopawWorkbenchShell";
import "../OrgPanorama/orgPanorama.css";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
interface TrendItem {
  date: string;
  tasks: number;
  sessions: number;
  llmCalls: number;
  productivity: number;
}

interface PositionData {
  id: string;
  name: string;
  avatar: string;
  department: string;
  role: string;
  description: string;
  responsibilities: string[];
  metrics: {
    totalTasks: number;
    taskChange: number;
    llmCalls: number;
    llmChange: number;
    toolCalls: number;
    toolChange: number;
  };
  trendData: TrendItem[];
}

// ------------------------------------------------------------------
// AI数字员工 Mock Data
// ------------------------------------------------------------------
const positions: PositionData[] = [
  {
    id: '1',
    name: '算法分析助手',
    avatar: 'https://readdy.ai/api/search-image?query=futuristic%20AI%20robot%20avatar%20icon%20minimal%20geometric%20abstract%20digital%20assistant%20orange%20and%20white%20color%20scheme%20clean%20flat%20design%20friendly%20face%20holographic%20style%20isolated%20on%20light%20gray%20background&width=64&height=64&seq=agent1',
    department: 'AI研发中心',
    role: '算法优化Agent',
    description:
      '基于大语言模型与强化学习框架，自动完成算法模型调优、实验对比与性能评估。支持多轮迭代优化，持续提升模型准确率与推理效率。',
    responsibilities: [
      '自动模型微调与参数优化',
      'A/B实验设计与结果分析',
      '训练数据质量评估与清洗',
      '模型推理性能监控与预警',
    ],
    metrics: {
      totalTasks: 142,
      taskChange: 12,
      llmCalls: 8432,
      llmChange: 23,
      toolCalls: 2156,
      toolChange: 8,
    },
    trendData: [
      { date: '05-13', tasks: 18, sessions: 24, llmCalls: 1100, productivity: 78 },
      { date: '05-14', tasks: 22, sessions: 28, llmCalls: 1250, productivity: 82 },
      { date: '05-15', tasks: 19, sessions: 26, llmCalls: 1080, productivity: 79 },
      { date: '05-16', tasks: 25, sessions: 32, llmCalls: 1420, productivity: 88 },
      { date: '05-17', tasks: 20, sessions: 27, llmCalls: 1150, productivity: 81 },
      { date: '05-18', tasks: 23, sessions: 30, llmCalls: 1300, productivity: 85 },
      { date: '05-19', tasks: 15, sessions: 20, llmCalls: 932, productivity: 72 },
    ],
  },
  {
    id: '2',
    name: '产品规划Agent',
    avatar: 'https://readdy.ai/api/search-image?query=futuristic%20AI%20robot%20avatar%20icon%20minimal%20geometric%20abstract%20digital%20assistant%20blue%20and%20white%20color%20scheme%20clean%20flat%20design%20friendly%20face%20holographic%20style%20isolated%20on%20light%20gray%20background&width=64&height=64&seq=agent2',
    department: '产品部',
    role: '需求分析Agent',
    description:
      '基于用户行为数据与竞品分析，自动生成产品需求文档、功能优先级排序与迭代规划建议。支持多维度数据驱动的决策支持。',
    responsibilities: [
      '用户反馈自动聚类与洞察提取',
      '竞品功能差异对比分析',
      'PRD文档自动生成与评审',
      '版本迭代节奏智能规划',
    ],
    metrics: {
      totalTasks: 98,
      taskChange: -5,
      llmCalls: 5621,
      llmChange: 15,
      toolCalls: 1843,
      toolChange: 22,
    },
    trendData: [
      { date: '05-13', tasks: 12, sessions: 18, llmCalls: 720, productivity: 68 },
      { date: '05-14', tasks: 15, sessions: 22, llmCalls: 890, productivity: 74 },
      { date: '05-15', tasks: 14, sessions: 20, llmCalls: 810, productivity: 71 },
      { date: '05-16', tasks: 18, sessions: 26, llmCalls: 1050, productivity: 80 },
      { date: '05-17', tasks: 16, sessions: 23, llmCalls: 920, productivity: 76 },
      { date: '05-18', tasks: 13, sessions: 19, llmCalls: 780, productivity: 69 },
      { date: '05-19', tasks: 10, sessions: 15, llmCalls: 451, productivity: 60 },
    ],
  },
  {
    id: '3',
    name: '代码生成Agent',
    avatar: 'https://readdy.ai/api/search-image?query=futuristic%20AI%20robot%20avatar%20icon%20minimal%20geometric%20abstract%20digital%20assistant%20green%20and%20white%20color%20scheme%20clean%20flat%20design%20friendly%20face%20holographic%20style%20isolated%20on%20light%20gray%20background&width=64&height=64&seq=agent3',
    department: '技术部',
    role: '全栈开发Agent',
    description:
      '基于自然语言描述自动生成高质量代码，覆盖前后端开发、单元测试编写与CI/CD流水线配置。支持多语言代码补全与重构建议。',
    responsibilities: [
      '需求到代码的自动转换',
      '单元测试与集成测试生成',
      '代码审查与Bug自动修复',
      '技术文档与API规范生成',
    ],
    metrics: {
      totalTasks: 186,
      taskChange: 28,
      llmCalls: 12450,
      llmChange: 45,
      toolCalls: 3680,
      toolChange: 34,
    },
    trendData: [
      { date: '05-13', tasks: 24, sessions: 35, llmCalls: 1650, productivity: 85 },
      { date: '05-14', tasks: 28, sessions: 40, llmCalls: 1920, productivity: 90 },
      { date: '05-15', tasks: 26, sessions: 38, llmCalls: 1780, productivity: 87 },
      { date: '05-16', tasks: 30, sessions: 44, llmCalls: 2100, productivity: 94 },
      { date: '05-17', tasks: 27, sessions: 39, llmCalls: 1850, productivity: 89 },
      { date: '05-18', tasks: 29, sessions: 42, llmCalls: 1980, productivity: 91 },
      { date: '05-19', tasks: 22, sessions: 32, llmCalls: 1170, productivity: 82 },
    ],
  },
  {
    id: '4',
    name: '数据洞察助手',
    avatar: 'https://readdy.ai/api/search-image?query=futuristic%20AI%20robot%20avatar%20icon%20minimal%20geometric%20abstract%20digital%20assistant%20purple%20and%20white%20color%20scheme%20clean%20flat%20design%20friendly%20face%20holographic%20style%20isolated%20on%20light%20gray%20background&width=64&height=64&seq=agent4',
    department: '数据智能部',
    role: '数据分析Agent',
    description:
      '自动完成海量业务数据的清洗、建模与可视化分析，生成智能洞察报告与异常预警。支持自然语言查询即席分析需求。',
    responsibilities: [
      '数据ETL流程自动编排',
      '异常检测与根因分析',
      '自助式数据看板生成',
      '业务指标预测与预警',
    ],
    metrics: {
      totalTasks: 115,
      taskChange: 7,
      llmCalls: 9870,
      llmChange: 31,
      toolCalls: 2780,
      toolChange: 18,
    },
    trendData: [
      { date: '05-13', tasks: 15, sessions: 21, llmCalls: 1320, productivity: 75 },
      { date: '05-14', tasks: 18, sessions: 25, llmCalls: 1580, productivity: 80 },
      { date: '05-15', tasks: 16, sessions: 23, llmCalls: 1420, productivity: 77 },
      { date: '05-16', tasks: 20, sessions: 28, llmCalls: 1750, productivity: 84 },
      { date: '05-17', tasks: 17, sessions: 24, llmCalls: 1500, productivity: 79 },
      { date: '05-18', tasks: 19, sessions: 26, llmCalls: 1650, productivity: 82 },
      { date: '05-19', tasks: 10, sessions: 15, llmCalls: 650, productivity: 65 },
    ],
  },
  {
    id: '5',
    name: '测试自动化Agent',
    avatar: 'https://readdy.ai/api/search-image?query=futuristic%20AI%20robot%20avatar%20icon%20minimal%20geometric%20abstract%20digital%20assistant%20red%20and%20white%20color%20scheme%20clean%20flat%20design%20friendly%20face%20holographic%20style%20isolated%20on%20light%20gray%20background&width=64&height=64&seq=agent5',
    department: '质量保障部',
    role: 'QA自动化Agent',
    description:
      '基于需求文档自动生成测试用例、执行自动化测试并输出质量报告。支持UI自动化、接口测试与性能压测的全流程覆盖。',
    responsibilities: [
      '测试用例自动生成与补全',
      'UI/API自动化测试执行',
      '缺陷智能定位与归因',
      '质量门禁与发布决策',
    ],
    metrics: {
      totalTasks: 128,
      taskChange: 18,
      llmCalls: 7650,
      llmChange: 27,
      toolCalls: 2340,
      toolChange: 15,
    },
    trendData: [
      { date: '05-13', tasks: 16, sessions: 22, llmCalls: 1020, productivity: 73 },
      { date: '05-14', tasks: 19, sessions: 26, llmCalls: 1250, productivity: 78 },
      { date: '05-15', tasks: 18, sessions: 24, llmCalls: 1150, productivity: 76 },
      { date: '05-16', tasks: 22, sessions: 30, llmCalls: 1450, productivity: 85 },
      { date: '05-17', tasks: 20, sessions: 27, llmCalls: 1280, productivity: 80 },
      { date: '05-18', tasks: 21, sessions: 28, llmCalls: 1350, productivity: 82 },
      { date: '05-19', tasks: 12, sessions: 18, llmCalls: 750, productivity: 68 },
    ],
  },
];

// ------------------------------------------------------------------
// Reusable Chart Tooltip
// ------------------------------------------------------------------
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-lg">
      <div className="text-[12px] font-semibold text-slate-800 mb-1">{label}</div>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 text-[12px] text-slate-600">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span>{entry.name}</span>
          <span className="font-medium text-slate-800">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
// Metric Card
// ------------------------------------------------------------------
function MetricCard({
  label,
  value,
  change,
  icon,
  accent,
}: {
  label: string;
  value: string;
  change: number;
  icon: string;
  accent: string;
}) {
  const positive = change >= 0;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] text-slate-500">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
          <i className={`${icon} text-sm`} />
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-800 mb-1">{value}</div>
      <div className="flex items-center gap-1">
        <i
          className={`${positive ? 'ri-arrow-up-line' : 'ri-arrow-down-line'} text-xs ${
            positive ? 'text-emerald-500' : 'text-rose-500'
          }`}
        />
        <span className={`text-[12px] font-medium ${positive ? 'text-emerald-500' : 'text-rose-500'}`}>
          {positive ? '+' : ''}
          {change}%
        </span>
        <span className="text-[11px] text-slate-400 ml-1">较上周</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Main Page
// ------------------------------------------------------------------
export default function AIOKRPage() {
  const [selectedId, setSelectedId] = useState<string>(positions[0].id);
  const pos = positions.find((p) => p.id === selectedId)!;

  return (
    <CopawWorkbenchShell>
    <div className="text-slate-800">
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-6">
        {/* Header + Position Selector */}
        <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                <i className="ri-focus-3-line text-violet-600 text-sm" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">AI-OKR 岗位考核分析</h1>
            </div>
            <p className="text-sm text-slate-500">
              选择 AI 数字员工查看 OKR 核心指标与趋势分析
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <i className="ri-robot-2-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="appearance-none bg-white border border-slate-200 rounded-lg pl-9 pr-8 py-2 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-300 cursor-pointer min-w-[260px]"
              >
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.role}
                  </option>
                ))}
              </select>
              <i className="ri-arrow-down-s-line absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none" />
            </div>
          </div>
        </header>

        {/* Agent Info Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
          <div className="flex items-start gap-4">
            <img
              src={pos.avatar}
              alt={pos.name}
              className="w-14 h-14 rounded-full object-cover border border-slate-100 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="text-base font-semibold text-slate-800">{pos.name}</h2>
                <span className="text-[11px] px-2 py-0.5 bg-violet-50 text-violet-600 rounded-full font-medium">
                  {pos.role}
                </span>
                <span className="text-[11px] px-2 py-0.5 bg-slate-50 text-slate-500 rounded-full">
                  {pos.department}
                </span>
              </div>
              <p className="text-[13px] text-slate-600 leading-relaxed mb-3">{pos.description}</p>
              <div className="flex flex-wrap gap-2">
                {pos.responsibilities.map((r) => (
                  <span
                    key={r}
                    className="text-[11px] px-2.5 py-1 bg-slate-50 text-slate-500 rounded-md border border-slate-100"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* OKR Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <MetricCard
            label="执行任务总数"
            value={pos.metrics.totalTasks.toLocaleString()}
            change={pos.metrics.taskChange}
            icon="ri-task-line"
            accent="bg-amber-50 text-amber-600"
          />
          <MetricCard
            label="LLM 调用次数"
            value={pos.metrics.llmCalls.toLocaleString()}
            change={pos.metrics.llmChange}
            icon="ri-brain-line"
            accent="bg-violet-50 text-violet-600"
          />
          <MetricCard
            label="工具调用次数"
            value={pos.metrics.toolCalls.toLocaleString()}
            change={pos.metrics.toolChange}
            icon="ri-tools-line"
            accent="bg-teal-50 text-teal-600"
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 1. 任务趋势 */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-amber-50 flex items-center justify-center">
                  <i className="ri-line-chart-line text-amber-600 text-xs" />
                </div>
                <h3 className="text-[14px] font-semibold text-slate-800">任务趋势</h3>
              </div>
              <span className="text-[11px] text-slate-400">近7天</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={pos.trendData}>
                <defs>
                  <linearGradient id="taskGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="tasks"
                  name="执行任务"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#taskGradient)"
                  dot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* 2. 会话趋势 */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-sky-50 flex items-center justify-center">
                  <i className="ri-chat-3-line text-sky-600 text-xs" />
                </div>
                <h3 className="text-[14px] font-semibold text-slate-800">会话趋势</h3>
              </div>
              <span className="text-[11px] text-slate-400">近7天</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={pos.trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="sessions"
                  name="会话次数"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#0ea5e9', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 3. LLM调用趋势分析 */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-violet-50 flex items-center justify-center">
                  <i className="ri-brain-line text-violet-600 text-xs" />
                </div>
                <h3 className="text-[14px] font-semibold text-slate-800">LLM 调用趋势分析</h3>
              </div>
              <span className="text-[11px] text-slate-400">近7天</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={pos.trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="llmCalls"
                  name="LLM调用"
                  fill="#8b5cf6"
                  radius={[4, 4, 0, 0]}
                  barSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 4. AI生产力分析 */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-teal-50 flex items-center justify-center">
                  <i className="ri-sparkling-line text-teal-600 text-xs" />
                </div>
                <h3 className="text-[14px] font-semibold text-slate-800">AI 生产力分析</h3>
              </div>
              <span className="text-[11px] text-slate-400">近7天</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={pos.trendData}>
                <defs>
                  <linearGradient id="prodGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                  iconType="circle"
                  iconSize={8}
                />
                <Area
                  type="monotone"
                  dataKey="productivity"
                  name="生产力指数"
                  stroke="#14b8a6"
                  strokeWidth={2}
                  fill="url(#prodGradient)"
                  dot={{ r: 3, fill: '#14b8a6', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
    </CopawWorkbenchShell>
  );
}