import { useEffect } from 'react';
import { type OrgNode } from './orgData';

/** 岗位基础信息片头 */
function PositionHeader({ node }: { node: OrgNode }) {
  const optDesc =
    node.positionDescription ||
    `${node.name} 岗位基于 OPT 人机协作岗位平台构建，人工员工专注战略判断、关系经营与创意决策，AI 数字员工承担数据挖掘、方案生成、流程执行等标准化与规模化任务，形成「人类主导 + AI 赋能」的闭环协作模式。`;

  return (
    <div className="flex items-start gap-4">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
        <i className="ri-building-2-line text-blue-500 text-2xl" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-bold text-slate-800">{node.name}</h2>
          {node.title && (
            <span className="text-sm text-slate-500">· {node.title}</span>
          )}
        </div>

        {/* OPT 平台岗位说明 */}
        <div className="mt-3 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/80 to-sky-50/40 p-3.5">
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0 mt-0.5">
              <i className="ri-hand-heart-line text-blue-600 text-sm" />
            </div>
            <div>
              <div className="text-xs font-semibold text-blue-700 mb-1">OPT 人机协作岗位平台</div>
              <p className="text-xs text-slate-600 leading-relaxed">{optDesc}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 单一步骤：人类 vs AI 双员工 + 协作图标 */
function WorkflowStepCard({
  stepNumber,
  title,
  description,
  humanTask,
  aiTask,
  aiRoleName,
  isLast,
}: {
  stepNumber: number;
  title: string;
  description?: string;
  humanTask: string;
  aiTask: string;
  aiRoleName?: string;
  isLast?: boolean;
}) {
  const aiLabel = aiRoleName ? `AI 员工 — ${aiRoleName}` : 'AI 员工';

  return (
    <div className="relative flex gap-0">
      {/* 左侧步骤线轴光环 */}
      <div className="flex flex-col items-center shrink-0 w-12 md:w-14">
        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">
          {stepNumber}
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-gradient-to-b from-blue-300 to-blue-100 mt-2 mb-1" />
        )}
      </div>

      {/* 步骤内容卡片 */}
      <div className="flex-1 pb-7">
        {/* 步骤标题 + OPT标签 */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">{title}</h3>
            <span className="px-2 py-0.5 rounded-md bg-gradient-to-r from-blue-50 to-sky-50 border border-blue-100 text-[10px] text-blue-600 font-semibold flex items-center gap-1">
              <i className="ri-shake-hands-line text-blue-500 text-[10px]" />
              OPT 协同
            </span>
          </div>
          <div className="flex-1 h-px bg-slate-100" />
        </div>

        {description && (
          <p className="text-xs text-slate-400 mb-3 italic">{description}</p>
        )}

        {/* 人类 vs AI 双栏 + 中间协作圆 */}
        <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3">
          {/* 人类员工 */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 overflow-hidden">
            <div className="px-3 py-1.5 bg-gradient-to-r from-slate-50 to-slate-100/50 border-b border-slate-100 flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center">
                <i className="ri-user-line text-slate-500 text-[10px]" />
              </div>
              <span className="text-[11px] font-bold text-slate-700">人类员工</span>
            </div>
            <div className="px-3 py-2.5">
              {humanTask ? (
                <p className="text-xs text-slate-600 leading-relaxed">{humanTask}</p>
              ) : (
                <p className="text-xs text-slate-400 italic">暂无描述人工任务</p>
              )}
            </div>
          </div>

          {/* 中间协作图标（桌面） */}
          <div className="hidden md:flex flex-col items-center justify-center">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 border-2 border-white shadow-md flex items-center justify-center">
              <i className="ri-shake-hands-line text-white text-sm" />
            </div>
            <div className="text-[10px] text-blue-500 font-semibold mt-1 whitespace-nowrap">协作</div>
          </div>

          {/* 移动端协作标签 */}
          <div className="md:hidden flex items-center justify-center py-1">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200">
              <i className="ri-shake-hands-line text-blue-500 text-xs" />
              <span className="text-[10px] text-blue-600 font-semibold">人机协作</span>
            </div>
          </div>

          {/* AI 员工 */}
          <div className="rounded-xl border border-blue-200 bg-gradient-to-b from-white to-blue-50/30 overflow-hidden">
            <div className="px-3 py-1.5 bg-gradient-to-r from-blue-50 to-sky-50/60 border-b border-blue-100 flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-blue-100 border border-blue-200 flex items-center justify-center">
                <i className="ri-robot-line text-blue-600 text-[10px]" />
              </div>
              <span className="text-[11px] font-bold text-blue-700">{aiLabel}</span>
            </div>
            <div className="px-3 py-2.5">
              {aiTask ? (
                <p className="text-xs text-slate-600 leading-relaxed">{aiTask}</p>
              ) : (
                <p className="text-xs text-slate-400 italic">暂无描述 AI 任务</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 数字化工作协同时间线 */
function WorkflowTimeline({ node }: { node: OrgNode }) {
  const steps = node.workflowSteps ?? [];
  const hasSteps = steps.length > 0;

  const fallbackSteps = (() => {
    if (hasSteps) return [];
    const humanList = node.humanTasks || [];
    const aiList = node.aiTasks || [];
    const collabList = node.collaborativeTasks || [];
    const maxLen = Math.max(humanList.length, collabList.length, aiList.length);
    if (maxLen === 0) {
      return [{
        title: '日常业务执行',
        humanTask: '战略决策、创新突破或关键客户关系维护',
        aiTask: '数据分析与自动汇总、流程执行',
        description: '',
      }];
    }
    const result: Array<{ title: string; humanTask: string; aiTask: string; description: string; aiRoleName?: string }> = [];
    for (let i = 0; i < maxLen; i++) {
      const humanParts: string[] = [];
      if (humanList[i]) humanParts.push(humanList[i]);
      if (collabList[i]) humanParts.push(collabList[i]);
      const aiParts: string[] = [];
      if (aiList[i]) aiParts.push(aiList[i]);
      if (collabList[i]) aiParts.push(collabList[i]);
      result.push({
        title: humanList[i] || aiList[i] || collabList[i] || `步骤 ${i + 1}`,
        humanTask: humanParts.join('；') || '',
        aiTask: aiParts.join('；') || '',
        description: '',
      });
    }
    return result;
  })();

  const displaySteps = hasSteps ? steps : fallbackSteps;

  return (
    <div>
      {/* 标题区 + OPT徽章 */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 border border-blue-400 flex items-center justify-center shadow-sm">
          <i className="ri-organization-chart text-white text-sm" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800">工作协作流程</h3>
            <span className="px-2 py-0.5 rounded-md bg-gradient-to-r from-blue-500 to-sky-500 text-[10px] text-white font-semibold shadow-sm">
              OPT 人机协作岗位平台
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            人类员工与 AI 数字员工分工协作，共 {displaySteps.length} 个步骤 · 形成完整业务闭环
          </p>
        </div>
      </div>

      {/* 流程时间线 */}
      <div className="pl-1">
        {displaySteps.map((step, idx) => (
          <WorkflowStepCard
            key={idx}
            stepNumber={idx + 1}
            title={step.title}
            description={step.description}
            humanTask={step.humanTask}
            aiTask={step.aiTask}
            aiRoleName={step.aiRoleName}
            isLast={idx === displaySteps.length - 1}
          />
        ))}
      </div>

      {/* 底部闭环结语 */}
      <div className="mt-2 bg-gradient-to-r from-blue-500 to-sky-500 rounded-xl border border-blue-400 p-4 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-12 h-12 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
            <i className="ri-loop-right-line text-white text-lg" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold">协作闭环结语</div>
            <div className="text-[11px] text-blue-100 mt-0.5">
              共 {displaySteps.length} 个 OPT 协同步骤 · 人工主导战略思考，AI 驱动执行落地，闭环推动业务增长
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface NodeModalProps {
  node: OrgNode | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function NodeModal({ node, isOpen, onClose }: NodeModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen || !node) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[5vh] pb-[5vh] px-4"
      onClick={onClose}
    >
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300" />

      {/* 弹窗 */}
      <div
        className="relative z-10 w-full max-w-[720px] max-h-[85vh] bg-white rounded-2xl border border-slate-200 shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-y-auto scrollbar-thin transition-all duration-300"
        style={{ animation: 'modal-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部渐变装饰 */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 via-sky-400 to-blue-500 rounded-t-2xl" />

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors z-20"
        >
          <i className="ri-close-line text-lg" />
        </button>

        <div className="p-6 md:p-8">
          {/* 1. 岗位头部信息 + OPT 说明 */}
          <PositionHeader node={node} />

          {/* 2. 数字化工作协同流程 */}
          <div className="mt-6">
            <WorkflowTimeline node={node} />
          </div>
        </div>
      </div>
    </div>
  );
}
