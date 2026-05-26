import { useState } from 'react';
import type { FormNode, WorkflowStep } from '../types';

interface NodeEditorProps {
  node: FormNode;
  depth: number;
  isRoot?: boolean;
  onChange: (node: FormNode) => void;
  onDelete?: () => void;
  /** 删除某个有后端 id 的节点时回调（用于调用 DELETE API） */
  onDeleteBackend?: (backendId: number) => void;
}

const aiLevelOptions = [
  { value: 'high'   as const, label: 'AI 深度', color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-200',   dot: 'bg-blue-500' },
  { value: 'medium' as const, label: 'AI 辅助', color: 'text-sky-600',   bg: 'bg-sky-50 border-sky-200',     dot: 'bg-sky-400' },
  { value: 'low'    as const, label: '数字化',  color: 'text-slate-600', bg: 'bg-slate-100 border-slate-300', dot: 'bg-slate-400' },
];

const levelBadge = (level: string) => {
  switch (level) {
    case 'high':   return { text: 'AI 深度', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'medium': return { text: 'AI 辅助', cls: 'bg-sky-50 text-sky-700 border-sky-200' };
    default:       return { text: '数字化',  cls: 'bg-slate-100 text-slate-600 border-slate-300' };
  }
};

// 通用样式类（解决 preflight:false 导致的黑色默认样式）
const inputCls = 'w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all';
const textareaCls = 'w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all resize-none';

// 强制覆盖全局样式（colorScheme:'light' 阻止 dark-mode 把表单控件渲染成深色）
const inputStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  color: '#334155',
  fontFamily: 'inherit',
  colorScheme: 'light',
};
const textareaStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  color: '#334155',
  fontFamily: 'inherit',
  colorScheme: 'light',
};

// 节区标题
function SectionTitle({ icon, label, sub }: { icon: string; label: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-1 h-4 rounded-full bg-blue-400 shrink-0" />
      <span className="text-[11px] font-bold text-slate-600 tracking-wide">{label}</span>
      {sub && <span className="text-[10px] text-slate-400 font-normal">{sub}</span>}
      {icon && <i className={`${icon} text-blue-400 text-xs ml-0.5`} />}
    </div>
  );
}

export default function NodeEditor({ node, depth, isRoot, onChange, onDelete, onDeleteBackend }: NodeEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [expanded, setExpanded] = useState(depth < 1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [draft, setDraft] = useState<FormNode>(node);

  const update      = (patch: Partial<FormNode>) => onChange({ ...node, ...patch });
  const updateDraft = (patch: Partial<FormNode>) => setDraft(d => ({ ...d, ...patch }));
  const handleEdit   = () => { setDraft({ ...node }); setIsEditing(true); setExpanded(true); };
  const handleSave   = () => { onChange({ ...draft }); setIsEditing(false); };
  const handleCancel = () => { setIsEditing(false); setDraft({ ...node }); };
  const handleDelete = () => { setShowDeleteConfirm(false); onDelete?.(); };

  const steps = draft.workflowSteps || [];

  const addWorkflowStep = () =>
    updateDraft({ workflowSteps: [...steps, { title: '', humanTask: '', aiTask: '', description: '', aiRoleName: '' }] });

  const removeWorkflowStep = (idx: number) =>
    updateDraft({ workflowSteps: steps.filter((_, i) => i !== idx) });

  const updateWorkflowStep = (idx: number, patch: Partial<WorkflowStep>) =>
    updateDraft({ workflowSteps: steps.map((s, i) => i === idx ? { ...s, ...patch } : s) });

  const addChild = () => update({
    children: [...node.children, {
      id: `${node.id}-child-${Date.now()}`,
      name: '', title: '', aiLevel: 'medium', headcount: 1,
      children: [], workflowSteps: [], positionDescription: '',
    }],
  });

  const updateChild = (idx: number, c: FormNode) => {
    const arr = [...node.children]; arr[idx] = c; update({ children: arr });
  };
  const removeChild = (idx: number) => {
    const child = node.children[idx];
    if (child?.backendId) onDeleteBackend?.(child.backendId);
    update({ children: node.children.filter((_, i) => i !== idx) });
  };

  const badge = levelBadge(isEditing ? draft.aiLevel : node.aiLevel);

  // 层级缩进与卡片头部颜色
  const indentClass = depth === 0 ? ''
    : depth === 1 ? 'ml-5 border-l-2 border-blue-100 pl-5'
    : 'ml-5 border-l-2 border-slate-100 pl-5';

  const headerBase = depth === 0
    ? 'bg-gradient-to-r from-blue-50/80 to-white border-blue-200 shadow-sm'
    : depth === 1
    ? 'bg-white border-slate-200 hover:border-blue-200 hover:bg-blue-50/20'
    : 'bg-white border-slate-100 hover:border-slate-200';

  const headerEdit = depth === 0
    ? 'bg-blue-100/40 border-blue-300'
    : 'bg-blue-50/50 border-blue-200';

  const levelDotCls = depth === 0
    ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm'
    : depth === 1
    ? 'bg-blue-100 text-blue-600'
    : 'bg-slate-100 text-slate-500';

  return (
    <div className={`${indentClass} mb-3`}>

      {/* ── 删除确认弹窗 ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                <i className="ri-error-warning-line text-red-500 text-lg" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">确认删除</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  删除「{node.name || '未命名节点'}」及其所有子部门，此操作不可撤销
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors">
                取消
              </button>
              <button type="button" onClick={handleDelete}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 border border-red-500 transition-colors">
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 卡片头部 ── */}
      <div
        className={`flex items-center justify-between cursor-pointer select-none group rounded-xl px-3 py-2.5 transition-all border ${
          isEditing ? headerEdit : headerBase
        }`}
        onClick={() => { if (!isEditing) setExpanded(e => !e); }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${levelDotCls}`}>
            {isRoot ? '总' : depth === 1 ? '一' : '二'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-semibold truncate ${node.name ? 'text-slate-800' : 'text-slate-400'}`}>
                {node.name || (isRoot ? '顶层节点' : depth === 1 ? '一级部门' : '二级部门')}
              </span>
              {node.title && <span className="text-[11px] text-slate-400 font-normal">{node.title}</span>}
            </div>
            {!node.name && !isEditing && (
              <span className="text-[10px] text-slate-400">{isRoot ? 'CEO / 总裁' : depth === 1 ? 'VP / 总监级' : '团队 / 小组'}</span>
            )}
          </div>
          {!isEditing && (
            <div className="hidden sm:flex items-center gap-1.5 ml-2 shrink-0">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${badge.cls}`}>{badge.text}</span>
              {node.headcount > 1 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-50 text-slate-500 border border-slate-200">{node.headcount} 人</span>
              )}
              {(node.workflowSteps?.length ?? 0) > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100">
                  {node.workflowSteps!.length} 步 OPT
                </span>
              )}
            </div>
          )}
          {isEditing && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium border border-blue-200 animate-pulse">编辑中</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isEditing ? (
            <>
              <button type="button" onClick={e => { e.stopPropagation(); handleSave(); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white bg-blue-500 hover:bg-blue-600 border border-blue-500 transition-all shadow-sm">
                <i className="ri-check-line" /> 保存
              </button>
              <button type="button" onClick={e => { e.stopPropagation(); handleCancel(); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
                <i className="ri-close-line" /> 取消
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={e => { e.stopPropagation(); handleEdit(); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all opacity-0 group-hover:opacity-100">
                <i className="ri-edit-line" /> 编辑
              </button>
              {!isRoot && onDelete && (
                <button type="button" onClick={e => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-red-400 bg-white border border-red-100 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all opacity-0 group-hover:opacity-100">
                  <i className="ri-delete-bin-line" />
                </button>
              )}
              <i className={`ri-arrow-down-s-line text-slate-400 transition-transform ml-1 ${expanded ? 'rotate-180' : ''}`} />
            </>
          )}
        </div>
      </div>

      {/* ── 只读展开面板 ── */}
      {!isEditing && expanded && (
        <div className="mt-1.5 rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {/* 岗位说明 */}
          {node.positionDescription && (
            <div className="bg-gradient-to-r from-blue-50/70 to-sky-50/30 border-b border-blue-100 px-4 py-3 flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0 mt-0.5">
                <i className="ri-hand-heart-line text-blue-600 text-xs" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-blue-700 mb-0.5 tracking-wide">OPT 人机协作岗位平台</div>
                <p className="text-xs text-slate-600 leading-relaxed">{node.positionDescription}</p>
              </div>
            </div>
          )}
          {/* 数据摘要行 */}
          <div className="bg-slate-50/80 border-b border-slate-100 px-4 py-2.5 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <i className="ri-team-line text-slate-400 text-xs" />
              <span className="font-semibold text-slate-700">{node.headcount}</span>
              <span className="text-slate-400">人</span>
            </div>
            <span className="w-px h-3 bg-slate-200" />
            <div className="flex items-center gap-1.5 text-xs">
              <i className="ri-robot-line text-blue-400 text-xs" />
              <span className={`text-[11px] px-1.5 py-0.5 rounded border font-medium ${badge.cls}`}>{badge.text}</span>
            </div>
            {node.children.length > 0 && (
              <>
                <span className="w-px h-3 bg-slate-200" />
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <i className="ri-folder-line text-slate-400 text-xs" />
                  <span>{node.children.length} 个子部门</span>
                </div>
              </>
            )}
          </div>

          {/* OPT 工作流步骤 */}
          {(node.workflowSteps?.length ?? 0) > 0 ? (
            <div className="px-4 py-3 bg-white">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                  <i className="ri-git-merge-line text-white text-[10px]" />
                </div>
                <span className="text-xs font-bold text-slate-700">OPT 协同流程</span>
                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100">
                  {node.workflowSteps!.length} 个步骤
                </span>
              </div>
              <div className="space-y-2">
                {node.workflowSteps!.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5 shadow-sm">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0 rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700">{step.title || `步骤 ${idx + 1}`}</span>
                        {step.aiRoleName && (
                          <span className="text-[9px] px-1.5 py-px rounded-md bg-blue-50 text-blue-500 border border-blue-100">{step.aiRoleName}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-slate-100">
                        <div className="px-3 py-2 bg-white">
                          <div className="text-[9px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                            <i className="ri-user-line text-slate-400" />人工执行
                          </div>
                          <p className="text-[11px] text-slate-600 leading-relaxed">{step.humanTask || '—'}</p>
                        </div>
                        <div className="px-3 py-2 bg-blue-50/30">
                          <div className="text-[9px] font-semibold text-blue-600 mb-1 flex items-center gap-1">
                            <i className="ri-robot-line text-blue-400" />AI 执行
                          </div>
                          <p className="text-[11px] text-slate-600 leading-relaxed">{step.aiTask || '—'}</p>
                        </div>
                      </div>
                      {step.description && (
                        <div className="px-3 py-1.5 bg-slate-50/60 border-t border-slate-100">
                          <p className="text-[10px] text-slate-400 italic">{step.description}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-4 py-4 text-center bg-white">
              <p className="text-[11px] text-slate-300">暂无 OPT 协同步骤，点击编辑后可添加</p>
            </div>
          )}
        </div>
      )}

      {/* ── 编辑表单 ── */}
      {isEditing && (
        <div className="mt-1.5 rounded-xl border border-blue-200 overflow-hidden shadow-sm">

          {/* ① 基础信息区 */}
          <div className="bg-white px-4 py-4 border-b border-slate-100">
            <SectionTitle icon="ri-profile-line" label="基础信息" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">部门 / 岗位名称</label>
                <input type="text" value={draft.name}
                  onChange={e => updateDraft({ name: e.target.value })}
                  placeholder={isRoot ? '如：张明' : '如：研发中心'}
                  className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">职位头衔</label>
                <input type="text" value={draft.title}
                  onChange={e => updateDraft({ title: e.target.value })}
                  placeholder={isRoot ? '如：首席执行官' : '如：技术总监'}
                  className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">AI 赋能深度</label>
                <div className="flex gap-1.5">
                  {aiLevelOptions.map(opt => (
                    <button key={opt.value} type="button" onClick={() => updateDraft({ aiLevel: opt.value })}
                      className={`flex-1 px-1.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                        draft.aiLevel === opt.value
                          ? `${opt.bg} ${opt.color} ring-2 ring-offset-1 ring-blue-200`
                          : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-500'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">人数</label>
                <input type="number" min={1} max={9999} value={draft.headcount}
                  onChange={e => updateDraft({ headcount: Math.max(1, parseInt(e.target.value) || 1) })}
                  className={inputCls} style={inputStyle} />
              </div>
            </div>
          </div>

          {/* ② 岗位说明区 */}
          <div className="bg-blue-50/30 px-4 py-4 border-b border-blue-100">
            <SectionTitle icon="" label="OPT 岗位说明" sub="（在卡片与详情弹窗中展示）" />
            <textarea
              value={draft.positionDescription || ''}
              onChange={e => updateDraft({ positionDescription: e.target.value })}
              placeholder="简述该岗位基于 OPT 人机协作平台的职责定位，如：张明岗位基于 OPT 人机协作平台构建，人工员工专注战略判断…"
              rows={3}
              maxLength={500}
              className={textareaCls} style={textareaStyle}
            />
            <div className="mt-1.5 flex justify-end">
              <span className="text-[10px] text-slate-300">{(draft.positionDescription || '').length}/500</span>
            </div>
          </div>

          {/* ③ OPT 协同流程步骤区 */}
          <div className="bg-white px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-blue-400 shrink-0" />
                <span className="text-[11px] font-bold text-slate-600 tracking-wide">OPT 协同流程步骤</span>
                <span className="text-[10px] text-slate-400 font-normal">（在组织架构图节点卡片中展示）</span>
              </div>
              <button type="button" onClick={addWorkflowStep}
                className="text-xs text-blue-600 hover:text-blue-700 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors flex items-center gap-1 font-medium">
                <i className="ri-add-line" /> 添加步骤
              </button>
            </div>

            {steps.length === 0 && (
              <div className="text-center py-6 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-2 shadow-sm">
                  <i className="ri-git-merge-line text-slate-300 text-lg" />
                </div>
                <p className="text-[11px] text-slate-400">暂无步骤，点击右上角「添加步骤」开始创建工作流程</p>
              </div>
            )}

            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={idx} className="rounded-xl border border-blue-100 bg-gradient-to-b from-white to-blue-50/20 overflow-hidden shadow-sm">
                  {/* 步骤标题行 */}
                  <div className="px-3 py-2.5 bg-gradient-to-r from-blue-50/80 to-sky-50/40 border-b border-blue-100 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm">
                      {idx + 1}
                    </div>
                    <input type="text" value={step.title}
                      onChange={e => updateWorkflowStep(idx, { title: e.target.value })}
                      placeholder="步骤标题，如：战略决策"
                      className="flex-1 min-w-0 px-2.5 py-1 text-xs font-semibold rounded-lg border border-blue-100 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all"
                      style={inputStyle} />
                    <input type="text" value={step.aiRoleName || ''}
                      onChange={e => updateWorkflowStep(idx, { aiRoleName: e.target.value })}
                      placeholder="AI 角色名，如：战略分析助手"
                      className="w-[150px] shrink-0 px-2.5 py-1 text-[11px] rounded-lg border border-blue-100 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all"
                      style={{ ...inputStyle, color: '#2563eb', colorScheme: 'light' }} />
                    <button type="button" onClick={() => removeWorkflowStep(idx)}
                      className="text-[11px] text-red-400 hover:text-red-500 px-2 py-1 rounded-lg bg-white border border-red-100 hover:bg-red-50 hover:border-red-200 transition-colors shrink-0">
                      <i className="ri-delete-bin-line" />
                    </button>
                  </div>

                  {/* 人工 + AI 双栏内容 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-blue-50 p-3 gap-0">
                    <div className="md:pr-3 pb-3 md:pb-0">
                      <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 mb-1.5">
                        <span className="w-4 h-4 rounded bg-slate-100 flex items-center justify-center">
                          <i className="ri-user-line text-slate-400 text-[9px]" />
                        </span>
                        人类员工操作
                      </label>
                      <textarea value={step.humanTask}
                        onChange={e => updateWorkflowStep(idx, { humanTask: e.target.value })}
                        placeholder="人工在此步骤中负责的具体工作…"
                        rows={3} maxLength={300}
                        className={textareaCls} style={textareaStyle} />
                    </div>
                    <div className="md:pl-3 pt-3 md:pt-0">
                      <label className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-600 mb-1.5">
                        <span className="w-4 h-4 rounded bg-blue-100 flex items-center justify-center">
                          <i className="ri-robot-line text-blue-500 text-[9px]" />
                        </span>
                        AI 数字员工操作
                      </label>
                      <textarea value={step.aiTask}
                        onChange={e => updateWorkflowStep(idx, { aiTask: e.target.value })}
                        placeholder="AI 在此步骤中负责的具体工作…"
                        rows={3} maxLength={300}
                        className={`${textareaCls} border-blue-100`} style={{ ...textareaStyle, backgroundColor: '#eff6ff', colorScheme: 'light' }} />
                    </div>
                  </div>

                  {/* 步骤说明 */}
                  <div className="px-3 pb-3 pt-0">
                    <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 mb-1.5">
                      <i className="ri-file-text-line text-slate-300" />步骤说明（可选）
                    </label>
                    <input type="text" value={step.description || ''}
                      onChange={e => updateWorkflowStep(idx, { description: e.target.value })}
                      placeholder="一句话说明此步骤的业务价值或触发时机…"
                      className={`${inputCls} text-[11px] border-slate-100`} style={inputStyle} />
                  </div>
                </div>
              ))}
            </div>

            {/* 底部操作 */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <i className="ri-information-line text-slate-300" />
                编辑完成后点击「保存修改」确认
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={handleCancel}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
                  取消
                </button>
                <button type="button" onClick={handleSave}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 border border-blue-500 transition-all shadow-sm flex items-center gap-1.5">
                  <i className="ri-check-line" /> 保存修改
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 子部门（递归渲染） ── */}
      {expanded && depth < 2 && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-semibold text-slate-400">
              {depth === 0 ? '一级部门' : '二级团队'}
            </span>
            <button type="button" onClick={addChild}
              className="text-xs text-blue-600 hover:text-blue-700 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors flex items-center gap-1 font-medium">
              <i className="ri-add-line" /> 添加{depth === 0 ? '一级' : '二级'}部门
            </button>
          </div>
          {node.children.length === 0 && (
            <div className="text-center py-6 bg-slate-50/40 rounded-xl border border-dashed border-slate-200">
              <i className="ri-folder-add-line text-slate-200 text-2xl mb-1.5 block" />
              <p className="text-[11px] text-slate-400">暂无子部门，点击右侧按钮添加</p>
            </div>
          )}
          {node.children.map((child, idx) => (
            <NodeEditor key={child.id} node={child} depth={depth + 1}
              onChange={c => updateChild(idx, c)}
              onDelete={() => removeChild(idx)}
              onDeleteBackend={onDeleteBackend} />
          ))}
        </div>
      )}
    </div>
  );
}
