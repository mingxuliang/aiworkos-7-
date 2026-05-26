import { type OrgNode, type WorkflowStep, aiConfig } from './orgData';

/** 卡片内微型人机协同步骤 */
function MiniWorkflowStep({
  number,
  title,
  humanLabel,
  aiLabel,
  aiRoleName,
  isLast,
}: {
  number: number;
  title: string;
  humanLabel: string;
  aiLabel: string;
  aiRoleName?: string;
  isLast?: boolean;
}) {
  const hLabel = humanLabel.length > 8 ? humanLabel.slice(0, 8) + '..' : humanLabel;
  const aLabel = aiLabel.length > 8 ? aiLabel.slice(0, 8) + '..' : aiLabel;

  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-full rounded-lg border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/50 p-1.5 step-card-hover overflow-hidden">
        {/* 顶部行：序号 + 标题 + AI角色 */}
        <div className="flex items-center gap-1 mb-1">
          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center text-[7px] font-bold shrink-0 shadow-sm">
            {number}
          </div>
          <div className="text-[8px] font-bold text-slate-700 truncate leading-none flex-1 min-w-0">
            {title}
          </div>
          {aiRoleName && (
            <span className="shrink-0 text-[6px] px-1 py-px rounded bg-blue-50 text-blue-500 border border-blue-100 truncate max-w-[50px]">
              {aiRoleName.length > 6 ? aiRoleName.slice(0, 6) + '..' : aiRoleName}
            </span>
          )}
        </div>

        {/* 人工 + AI 双标签 */}
        <div className="flex items-center gap-1 ml-5">
          <span className="flex-1 truncate text-[6px] px-1 py-px rounded bg-slate-100 text-slate-500 border border-slate-100 flex items-center gap-0.5 leading-none">
            <i className="ri-user-line text-slate-400 text-[6px]" />
            {hLabel}
          </span>
          <div className="shrink-0 w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 border border-white shadow-sm flex items-center justify-center">
            <i className="ri-shake-hands-line text-white text-[6px]" />
          </div>
          <span className="flex-1 truncate text-[6px] px-1 py-px rounded bg-blue-50 text-blue-500 border border-blue-100 flex items-center gap-0.5 leading-none">
            <i className="ri-robot-line text-blue-400 text-[6px]" />
            {aLabel}
          </span>
        </div>
      </div>

      {!isLast && (
        <div className="flex items-center justify-center w-full py-0.5">
          <div className="flex flex-col items-center">
            <div
              className="w-[2px] h-2 rounded-full overflow-hidden relative"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(to bottom, transparent, transparent 2px, #cbd5e1 2px, #3b82f6 3px, transparent 3px, transparent 4px)',
                backgroundSize: '2px 8px',
                animation: 'flow-down 0.9s linear infinite',
              }}
            >
              <span
                className="absolute left-1/2 -translate-x-1/2 w-[2px] h-[2px] rounded-full bg-blue-500"
                style={{ animation: 'particle-drop 1.4s ease-in-out infinite' }}
              />
            </div>
            <div style={{ animation: 'arrow-bounce 1.2s ease-in-out infinite' }}>
              <i className="ri-arrow-down-s-line text-blue-500 text-[9px]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface NodeCardProps {
  node: OrgNode;
  isActive?: boolean;
  onHover?: (n: OrgNode) => void;
  onLeave?: () => void;
  onClick?: (n: OrgNode) => void;
  innerRef?: React.Ref<HTMLDivElement>;
}

export default function NodeCard({ node, isActive, onHover, onLeave, onClick, innerRef }: NodeCardProps) {
  const ai = aiConfig[node.aiLevel];
  const hasChildren = node.children && node.children.length > 0;
  const isCeo = node.id === 'ceo';
  const isVp = hasChildren && !isCeo;

  const cardWidth = isCeo ? 'w-[195px]' : isVp ? 'w-[175px]' : 'w-[150px]';

  const neonClass =
    node.aiLevel === 'high'
      ? 'card-neon-blue'
      : node.aiLevel === 'medium'
        ? 'card-neon-sky'
        : 'card-neon-slate';

  const workflowSteps: WorkflowStep[] = node.workflowSteps || [];
  // 卡片内最多展示 2 步，防止卡片过长
  const displaySteps = workflowSteps.slice(0, 2);

  return (
    <div className={`inline-block ${cardWidth}`}>
      <div
        ref={innerRef}
        className={`card-3d card-glow-border card-shine card-breathe ${neonClass} rounded-xl bg-white border border-slate-200/80 cursor-pointer relative overflow-hidden ${
          isActive
            ? 'ring-[1.5px] ring-blue-400/70 shadow-[0_0_40px_rgba(59,130,246,0.18)] scale-[1.03]'
            : `${ai.shadow}`
        } ${node.aiLevel === 'high' ? ai.glow : node.aiLevel === 'medium' ? ai.glow : ''}`}
        onMouseEnter={() => onHover?.(node)}
        onMouseLeave={onLeave}
        onClick={() => onClick?.(node)}
        style={{
          boxShadow: isActive
            ? '0 2px 4px rgba(0,0,0,0.04), 0 8px 24px rgba(37,99,235,0.12), 0 0 60px rgba(59,130,246,0.08)'
            : undefined,
        }}
      >
        <div className="px-2 pt-2 pb-1.5">
          {/* ===== 头部 ===== */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="min-w-0">
              <div
                className={`font-bold text-slate-800 leading-tight truncate ${
                  isCeo ? 'text-[13px]' : 'text-[11px]'
                }`}
              >
                {node.name}
              </div>
              {node.title && (
                <div className="text-[8px] text-slate-400 font-medium truncate">
                  {node.title}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-1">
              <span
                className={`inline-flex items-center gap-0.5 px-1 py-px rounded text-[7px] border font-medium ${ai.badge}`}
              >
                <span
                  className={`w-[3px] h-[3px] rounded-full ${ai.dot} ${
                    node.aiLevel === 'high' ? 'animate-pulse' : ''
                  }`}
                />
                {ai.label}
              </span>
              <span className="text-[7px] text-slate-400 bg-slate-50 px-1 py-px rounded border border-slate-100">
                {hasChildren ? `${node.children!.length}部` : `${node.headcount}人`}
              </span>
            </div>
          </div>

          {/* ===== 中部区域：OPT 人机协同流程（展示前2个步骤）===== */}
          <div className="mt-1.5">
            {/* OPT 标签行 */}
            <div className="flex items-center gap-1 mb-1">
              <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[7px] bg-gradient-to-r from-blue-50 to-sky-50 text-blue-600 border border-blue-100 font-bold">
                <i className="ri-shake-hands-line text-blue-500 text-[7px]" />
                OPT 协同流程
              </span>
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-[7px] text-slate-400">
                {workflowSteps.length}步闭环
              </span>
            </div>

            {/* 步骤列表 — 所有节点都有 workflowSteps */}
            <div className="space-y-0">
              {displaySteps.map((step, idx) => (
                <MiniWorkflowStep
                  key={idx}
                  number={idx + 1}
                  title={step.title}
                  humanLabel={step.humanTask}
                  aiLabel={step.aiTask}
                  aiRoleName={step.aiRoleName}
                  isLast={idx === displaySteps.length - 1}
                />
              ))}
            </div>
          </div>

          {/* ===== 底部固定 OPT 协同闭环底部条 ===== */}
          <div className="mt-1.5 pt-1.5 border-t border-slate-100">
            <div className="rounded-lg bg-gradient-to-r from-blue-500 to-sky-500 p-2 text-white relative overflow-hidden">
              {/* 装饰光斑 */}
              <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white/10 rounded-full" />
              <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-white/5 rounded-full" />

              <div className="relative flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
                  <i className="ri-loop-right-line text-white text-[9px]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[8px] font-bold leading-none flex items-center gap-1">
                    人机协同闭环
                    <span className="text-[6px] px-1 py-px rounded bg-white/20 border border-white/20 font-normal">
                      OPT
                    </span>
                  </div>
                  <div className="text-[6px] text-blue-100 mt-0.5 truncate leading-none">
                    人工主导协作 · AI 赋能执行 · 闭环智能增长
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
