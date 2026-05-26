import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import OrgChart from '@/pages/OrgChart/components/OrgChart';
import type { OrgNode } from '@/pages/OrgChart/components/orgData';
import {
  type FormNode,
  createEmptyNode,
  convertToOrgNode,
  backendToFormNode,
  formNodeToCreate,
  formNodeToUpdate,
} from './types';
import NodeEditor from './components/NodeEditor';
import { departmentApi } from '@/api/modules/department';

// ─── 默认示例数据（后端无数据时使用） ─────────────────────────────────────────
const defaultFormData: FormNode = {
  id: 'root',
  name: '首席执行官',
  title: 'CEO',
  aiLevel: 'high',
  headcount: 1,
  positionDescription: '负责企业整体战略方向与资源协调，基于 OPT 人机协作模式推动全组织数字化转型。',
  workflowSteps: [
    {
      title: '战略决策',
      humanTask: '制定企业中长期战略方向，审批重大投资决策',
      aiTask: '实时聚合市场数据与内部经营指标，生成战略模拟与风险评估报告',
      description: '每日 9:00 前输出战略简报',
      aiRoleName: '战略分析助手',
    },
    {
      title: '资源协调',
      humanTask: '跨部门资源调配与优先级仲裁',
      aiTask: '自动分析各部门产能、项目进度，推荐最优资源配置方案',
      description: '每周二例会 OPT 驱动',
      aiRoleName: '资源调度助手',
    },
  ],
  children: [],
};

// ─── 深度优先遍历 ─────────────────────────────────────────────────────────────
function walkDfs(node: FormNode, cb: (n: FormNode) => void) {
  cb(node);
  node.children.forEach(c => walkDfs(c, cb));
}

export default function OrgBuilder() {
  const [formData, setFormData] = useState<FormNode>(defaultFormData);
  const [previewData, setPreviewData] = useState<OrgNode | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const idMapRef = useRef<Map<string, number>>(new Map());

  // ── 初始加载：尝试从后端拉树；失败则使用示例数据 ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    departmentApi.getTree()
      .then(res => {
        if (!cancelled && res?.root) {
          setFormData(backendToFormNode(res.root));
        }
      })
      .catch(() => {
        // 静默：后端无数据/未实现时沿用默认示例
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ── 保存：点击「保存」按钮 → 调接口提交当前表单 ───────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // 拿最新树用于判断哪些节点已存在（POST 新建 vs PUT 更新）
      const freshTree = await departmentApi.getTree().catch(() => null);
      const existingIds = new Set<number>();
      if (freshTree?.root) {
        walkDfs(backendToFormNode(freshTree.root), n => {
          if (n.backendId) existingIds.add(n.backendId);
        });
      }

      // 深拷贝当前表单，DFS 保证父节点先于子节点写入
      const updated = JSON.parse(JSON.stringify(formData)) as FormNode;

      async function syncNode(node: FormNode, parentBackendId: number | null) {
        let thisBackendId = node.backendId;

        if (thisBackendId && existingIds.has(thisBackendId)) {
          await departmentApi.update(formNodeToUpdate(node));
        } else {
          const body = formNodeToCreate({ ...node, backendParentId: parentBackendId });
          const created = await departmentApi.create(body);
          thisBackendId = created.id;
          node.backendId = thisBackendId;
          node.backendParentId = parentBackendId;
          idMapRef.current.set(node.id, thisBackendId);
        }

        for (const child of node.children) {
          await syncNode(child, thisBackendId ?? null);
        }
      }

      await syncNode(updated, null);
      setFormData(updated);
      message.success('保存成功');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`保存失败：${msg.slice(0, 80)}`);
      console.error('[OrgBuilder save error]', err);
    } finally {
      setSaving(false);
    }
  }, [formData]);

  // ── 删除节点（带 backendId 的节点同步调 DELETE） ──────────────────────────
  const handleDelete = useCallback(async (_id: string, backendId?: number) => {
    if (!backendId) return;
    try {
      await departmentApi.remove(backendId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`后端删除失败：${msg.slice(0, 60)}`);
    }
  }, []);

  const handleGenerate = () => {
    const orgNode = convertToOrgNode(formData);
    setPreviewData(orgNode);
    setShowPreview(true);
    setTimeout(() => {
      document.getElementById('preview-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleReset = () => {
    setFormData(createEmptyNode('root'));
    setShowPreview(false);
    setPreviewData(null);
  };

  const handleChange = useCallback((node: FormNode) => {
    setFormData(node);
  }, []);

  return (
    <div
      className="org-builder-page min-h-screen bg-gradient-to-b from-slate-50/60 via-white to-white text-slate-800"
      style={{ fontFamily: 'inherit', colorScheme: 'light' }}
    >
      <div className="max-w-[1280px] mx-auto px-4 md:px-6 py-6">

        {/* 页面标题 */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm shrink-0">
            <i className="ri-organization-chart text-white text-base" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 leading-tight">组织架构构建器</h1>
            <p className="text-xs text-slate-400 mt-0.5">填写部门信息，自动生成 OPT 人机协同架构图</p>
          </div>
        </div>

        {/* 说明栏 */}
        <div className="mb-5 bg-gradient-to-r from-blue-50 to-sky-50/60 rounded-xl border border-blue-100 p-4 flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
            <i className="ri-information-line text-blue-600 text-sm" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-slate-700 mb-1">如何使用</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              按层级填写各部门的名称、AI 赋能深度与人员规模，并为每个节点添加 OPT 协同流程步骤。
              点击「保存」即可将当前编辑结果提交到后端；点击「生成架构图」可预览效果。
            </p>
          </div>
        </div>

        {/* 编辑区 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-blue-400 via-sky-400 to-blue-500" />
          <div className="px-4 md:px-6 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <i className="ri-edit-box-line text-blue-500 text-sm" />
              <span className="text-sm font-semibold text-slate-700">数据填写</span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">— 点击节点右侧「编辑」按钮展开</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-700 transition-colors flex items-center gap-1"
              >
                <i className="ri-delete-bin-line" /> 清空
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-1.5"
              >
                <i className="ri-magic-line" /> 生成架构图
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 border border-emerald-500 shadow-sm hover:shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving
                  ? <><i className="ri-loader-4-line animate-spin" /> 保存中…</>
                  : <><i className="ri-save-line" /> 保存</>
                }
              </button>
            </div>
          </div>

          <div className="px-4 md:px-6 py-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                <i className="ri-loader-4-line animate-spin text-2xl text-blue-400" />
                <p className="text-sm">正在加载…</p>
              </div>
            ) : (
              <NodeEditor
                node={formData}
                depth={0}
                isRoot
                onChange={handleChange}
                onDelete={() => {
                  if (formData.backendId) handleDelete(formData.id, formData.backendId);
                  handleReset();
                }}
                onDeleteBackend={(backendId) => handleDelete(String(backendId), backendId)}
              />
            )}
          </div>
        </div>

        {/* 预览区 */}
        {showPreview && previewData && (
          <div id="preview-section" className="mt-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                  <i className="ri-eye-line text-blue-600 text-sm" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">架构预览</h2>
                  <p className="text-[11px] text-slate-400">根据填写数据自动渲染 OPT 人机协同组织架构图</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all flex items-center gap-1"
              >
                <i className="ri-close-line" /> 关闭预览
              </button>
            </div>
            <OrgChart data={previewData} />
          </div>
        )}

        {/* 等待提示 */}
        {!showPreview && !loading && (
          <div className="mt-6 text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-3">
              <i className="ri-organization-chart text-slate-300 text-2xl" />
            </div>
            <p className="text-sm font-medium text-slate-500 mb-1">等待生成</p>
            <p className="text-xs text-slate-400">填写数据后点击「生成架构图」按钮预览效果</p>
          </div>
        )}
      </div>
    </div>
  );
}
