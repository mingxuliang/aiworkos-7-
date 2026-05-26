import { type OrgNode, aiConfig } from './orgData';

function MaturityMiniPanel({ dimensions, aiLevel }: { dimensions: Array<{ name: string; score: number; max: number }>; aiLevel: 'high' | 'medium' | 'low' }) {
  const ai = aiConfig[aiLevel];
  const avg = dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length;

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <i className="ri-bar-chart-grouped-fill text-blue-400 text-[10px]" />
          <span className="text-[10px] font-semibold text-slate-700">数字化成熟度</span>
        </div>
        <span className="text-[11px] font-bold text-blue-600">{avg.toFixed(1)}/5.0</span>
      </div>
      <div className="space-y-1.5">
        {dimensions.map((d) => (
          <div key={d.name}>
            <div className="flex items-center justify-between text-[9px] mb-0.5">
              <span className="text-slate-500">{d.name}</span>
              <span className="text-slate-700 font-medium">{d.score}/{d.max}</span>
            </div>
            <div className="h-[3px] bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${ai.maturityBar}`}
                style={{ width: `${(d.score / d.max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 人工-AI 工作分工详情面板 */
function WorkloadBreakdown({ node }: { node: OrgNode }) {
  const ai = aiConfig[node.aiLevel];

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-slate-100 to-blue-50 border border-blue-100 flex items-center justify-center">
          <i className="ri-organization-chart text-blue-500 text-[10px]" />
        </div>
        <span className="text-xs font-bold text-slate-800">岗位工作分工 · 人工与 AI 交和配合</span>
      </div>

      {/* 顶部占比条 */}
      <div className="mb-3 bg-white rounded-xl border border-slate-100 p-3">
        <div className="flex items-center justify-between text-[10px] mb-1.5">
          <span className="text-slate-500 flex items-center gap-1">
            <i className="ri-user-line" />
            人工主导 {node.humanWorkloadPct}%
          </span>
          <span className={`${ai.aiColor} flex items-center gap-1 font-semibold`}>
            <i className="ri-robot-line" />
            AI 主导 {node.aiWorkloadPct}%
          </span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex items-center">
          <div className="h-full bg-gradient-to-r from-slate-300 to-slate-400 rounded-l-full" style={{ width: `${node.humanWorkloadPct}%` }} />
          <div className="h-full bg-gradient-to-r from-blue-200 to-blue-300 flex items-center justify-center" style={{ width: `${100 - node.humanWorkloadPct - node.aiWorkloadPct}%` }}>
            <i className="ri-shake-hands-line text-white/70 text-[8px]" />
          </div>
          <div className={`h-full rounded-r-full ${ai.aiBg}`} style={{ width: `${node.aiWorkloadPct}%` }} />
        </div>
        <div className="flex justify-between text-[9px] mt-1.5 text-slate-400">
          <span>人工独立完成</span>
          <span>人机交和协作</span>
          <span>AI 自动执行</span>
        </div>
      </div>

      {/* 三列任务面板 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 人工负责 */}
        <div className="rounded-xl border border-slate-100 bg-gradient-to-b from-white to-slate-50/50 p-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-slate-300 to-slate-400" />
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center">
              <i className="ri-user-line text-slate-500 text-[10px]" />
            </div>
            <span className="text-[10px] font-bold text-slate-700">人工负责</span>
            <span className="text-[9px] text-slate-400 ml-auto">{node.humanWorkloadPct}%</span>
          </div>
          <div className="space-y-1.5">
            {node.humanTasks.map((task) => (
              <div key={task} className="flex items-start gap-1.5">
                <span className="w-3.5 h-3.5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <i className="ri-check-line text-slate-500 text-[7px]" />
                </span>
                <span className="text-[10px] text-slate-600 leading-relaxed">{task}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[9px] text-slate-400 bg-slate-50 rounded-md px-2 py-1 border border-slate-100">
            <i className="ri-lightbulb-line mr-0.5" />
            需人类创造力、情感判断、复杂决策
          </div>
        </div>

        {/* 协作交和 */}
        <div className="rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50/40 to-white p-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-300 to-sky-300" />
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-5 h-5 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center">
              <i className="ri-shake-hands-line text-blue-500 text-[10px]" />
            </div>
            <span className="text-[10px] font-bold text-blue-700">人机交和</span>
            <span className="text-[9px] text-blue-400 ml-auto">{100 - node.humanWorkloadPct - node.aiWorkloadPct}%</span>
          </div>
          <div className="space-y-1.5">
            {node.collaborativeTasks.map((task) => (
              <div key={task} className="flex items-start gap-1.5">
                <span className="w-3.5 h-3.5 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 mt-0.5">
                  <i className="ri-loop-left-line text-blue-500 text-[7px]" />
                </span>
                <span className="text-[10px] text-slate-600 leading-relaxed">{task}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[9px] text-blue-600 bg-blue-50 rounded-md px-2 py-1 border border-blue-100">
            <i className="ri-exchange-line mr-0.5" />
            AI 辅助初稿，人工审核优化，反复迭代
          </div>
        </div>

        {/* AI 负责 */}
        <div className="rounded-xl border border-blue-100 bg-gradient-to-b from-white to-blue-50/30 p-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-400 to-blue-500" />
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-5 h-5 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-center">
              <i className="ri-robot-line text-blue-600 text-[10px]" />
            </div>
            <span className="text-[10px] font-bold text-blue-700">AI 负责</span>
            <span className="text-[9px] text-blue-400 ml-auto">{node.aiWorkloadPct}%</span>
          </div>
          <div className="space-y-1.5">
            {node.aiTasks.map((task) => (
              <div key={task} className="flex items-start gap-1.5">
                <span className="w-3.5 h-3.5 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0 mt-0.5">
                  <i className="ri-sparkling-line text-blue-500 text-[7px]" />
                </span>
                <span className="text-[10px] text-slate-600 leading-relaxed">{task}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[9px] text-blue-600 bg-blue-50 rounded-md px-2 py-1 border border-blue-100">
            <i className="ri-flashlight-line mr-0.5" />
            标准化、重复性、数据密集型任务自动化
          </div>
        </div>
      </div>

      {/* AI 岗位价值核心指标 */}
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl border border-blue-100 p-2.5 text-center">
          <div className="text-lg font-bold text-blue-600">{node.aiEfficiencyBoost}%</div>
          <div className="text-[9px] text-slate-500">效率提升</div>
          <div className="text-[8px] text-blue-400 mt-0.5">较传统工作模式</div>
        </div>
        <div className="bg-gradient-to-br from-sky-50 to-white rounded-xl border border-sky-100 p-2.5 text-center">
          <div className="text-lg font-bold text-sky-600">{node.aiReplacementRate}%</div>
          <div className="text-[9px] text-slate-500">任务替代率</div>
          <div className="text-[8px] text-sky-400 mt-0.5">重复性工作由AI接管</div>
        </div>
        <div className="bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-100 p-2.5 text-center">
          <div className="text-lg font-bold text-slate-700">{node.timeSaved.replace('日均节省 ', '')}</div>
          <div className="text-[9px] text-slate-500">日均节省</div>
          <div className="text-[8px] text-slate-400 mt-0.5">释放人力投入高价值工作</div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl border border-blue-100 p-2.5 text-center">
          <div className="text-lg font-bold text-blue-600">{node.dataFlow.toLocaleString()}</div>
          <div className="text-[9px] text-slate-500">日数据流转</div>
          <div className="text-[8px] text-blue-400 mt-0.5">AI驱动数据吞吐</div>
        </div>
      </div>
    </div>
  );
}

interface NodeDetailPanelProps {
  node: OrgNode;
}

export default function NodeDetailPanel({ node }: NodeDetailPanelProps) {
  const ai = aiConfig[node.aiLevel];

  return (
    <div className="mt-5 p-5 bg-gradient-to-br from-white via-blue-50/40 to-white rounded-2xl border border-blue-100/80 relative z-10 animate-shimmer-in shadow-[0_8px_32px_rgba(59,130,246,0.06)]">
      {/* 顶部装饰线 */}
      <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-blue-300/40 to-transparent" />

      {/* 头部 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
            <i className="ri-building-2-line text-blue-500 text-sm" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">{node.name}</h4>
            {node.title && <p className="text-[10px] text-slate-400">{node.title}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] border font-medium ${ai.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${ai.dot}`} />
            {ai.label}
          </span>
          <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
            {node.headcount} 人
          </span>
        </div>
      </div>

      {/* AI 赋能效果一句话 */}
      <div className="bg-gradient-to-r from-blue-50 to-sky-50/60 rounded-xl p-3 border border-blue-100/60 mb-4">
        <div className="flex items-center gap-2 mb-1.5">
          <i className="ri-sparkling-line text-blue-500 text-xs" />
          <span className="text-xs font-semibold text-blue-700">AI 岗位赋能效果</span>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed">{node.aiValue}</p>
      </div>

      {/* 核心：人工-AI 工作分工详情 */}
      <WorkloadBreakdown node={node} />

      {/* 岗位标签 */}
      {node.roles && (
        <div className="mt-4 mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <i className="ri-user-smile-line text-slate-400 text-[10px]" />
            <span className="text-[10px] font-semibold text-slate-600">岗位配置</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {node.roles.map((role) => (
              <span
                key={role}
                className="px-2.5 py-1 rounded-lg bg-white border border-blue-100/70 text-xs text-slate-600 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-default"
              >
                {role}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 分管部门 */}
      {node.children && !node.roles && (
        <div className="mt-4 mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <i className="ri-stack-line text-slate-400 text-[10px]" />
            <span className="text-[10px] font-semibold text-slate-600">分管部门</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {node.children.map((dept) => (
              <span
                key={dept.id}
                className="px-2.5 py-1 rounded-lg bg-white border border-blue-100/70 text-xs text-slate-600 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-default"
              >
                {dept.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI 工具 */}
      <div className="mt-3 mb-3">
        <div className="flex items-center gap-1.5 mb-2">
          <i className="ri-tools-line text-blue-400 text-[10px]" />
          <span className="text-[10px] font-semibold text-slate-600">AI 工具栈</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {node.aiTools.map((tool) => (
            <span
              key={tool}
              className={`px-2 py-0.5 rounded-md text-[9px] border font-medium ${ai.chip}`}
            >
              {tool}
            </span>
          ))}
        </div>
      </div>

      {/* 数字化成熟度 */}
      <MaturityMiniPanel dimensions={node.digitalMaturity} aiLevel={node.aiLevel} />
    </div>
  );
}