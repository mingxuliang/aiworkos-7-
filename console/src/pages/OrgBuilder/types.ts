import type { OrgNode } from '@/pages/OrgChart/components/orgData';
import type { Department, CreateDepartmentBody, UpdateDepartmentBody, SubJob } from '@/api/types/department';

// ─── 前端表单节点 ─────────────────────────────────────────────────────────────

export interface WorkflowStep {
  title: string;
  humanTask: string;
  aiTask: string;
  description?: string;
  /** 对应后端 agent_id */
  aiRoleName?: string;
}

export interface FormNode {
  /** 前端临时 id（新节点为 "new-xxx"；已保存节点为后端 id 的字符串） */
  id: string;
  /** 后端真实 id，新节点为 undefined */
  backendId?: number;
  /** 后端 parent_id，根节点为 null */
  backendParentId?: number | null;
  name: string;
  title: string;
  aiLevel: 'high' | 'medium' | 'low';
  headcount: number;
  children: FormNode[];
  workflowSteps?: WorkflowStep[];
  positionDescription?: string;
}

// ─── 辅助工具 ─────────────────────────────────────────────────────────────────

export function createEmptyNode(id: string, parentBackendId?: number | null): FormNode {
  return {
    id,
    backendParentId: parentBackendId ?? null,
    name: '',
    title: '',
    aiLevel: 'medium',
    headcount: 1,
    children: [],
    workflowSteps: [],
    positionDescription: '',
  };
}

// ─── ai_empowerment_level ↔ aiLevel 转换 ─────────────────────────────────────

export function levelToAiLevel(level: 1 | 2 | 3): 'high' | 'medium' | 'low' {
  if (level === 3) return 'high';
  if (level === 2) return 'medium';
  return 'low';
}

export function aiLevelToLevel(l: 'high' | 'medium' | 'low'): 1 | 2 | 3 {
  if (l === 'high') return 3;
  if (l === 'medium') return 2;
  return 1;
}

// ─── 后端 Department → FormNode ──────────────────────────────────────────────

export function backendToFormNode(dept: Department): FormNode {
  return {
    id: String(dept.id),
    backendId: dept.id,
    backendParentId: dept.parent_id,
    name: dept.department_name,
    title: dept.position_title ?? '',
    aiLevel: levelToAiLevel(dept.ai_empowerment_level),
    headcount: dept.efficiency_improvement_percent ?? 1,
    positionDescription: dept.job_desc ?? '',
    workflowSteps: (dept.sub_jobs ?? []).map(s => ({
      title: s.job_title,
      humanTask: s.manual_task,
      aiTask: s.agent_task,
      description: s.job_desc,
      aiRoleName: s.agent_id,
    })),
    children: (dept.children ?? []).map(backendToFormNode),
  };
}

// ─── FormNode → 后端请求体（新增） ────────────────────────────────────────────

export function formNodeToCreate(node: FormNode): CreateDepartmentBody {
  const steps: SubJob[] = (node.workflowSteps ?? [])
    .filter(s => s.title.trim())
    .map(s => ({
      job_title: s.title.trim(),
      job_desc: s.description?.trim() ?? '',
      agent_id: s.aiRoleName?.trim() ?? '',
      manual_task: s.humanTask.trim(),
      agent_task: s.aiTask.trim(),
    }));

  return {
    parent_id: node.backendParentId ?? null,
    department_name: node.name.trim() || '未命名',
    position_title: node.title.trim(),
    ai_empowerment_level: aiLevelToLevel(node.aiLevel),
    efficiency_improvement_percent: node.headcount,
    job_desc: node.positionDescription?.trim() || undefined,
    sub_jobs: steps,
  };
}

// ─── FormNode → 后端请求体（修改） ────────────────────────────────────────────

export function formNodeToUpdate(node: FormNode): UpdateDepartmentBody {
  if (!node.backendId) throw new Error('formNodeToUpdate: node has no backendId');
  const steps: SubJob[] = (node.workflowSteps ?? [])
    .filter(s => s.title.trim())
    .map(s => ({
      job_title: s.title.trim(),
      job_desc: s.description?.trim() ?? '',
      agent_id: s.aiRoleName?.trim() ?? '',
      manual_task: s.humanTask.trim(),
      agent_task: s.aiTask.trim(),
    }));

  return {
    id: node.backendId,
    department_name: node.name.trim() || '未命名',
    position_title: node.title.trim(),
    ai_empowerment_level: aiLevelToLevel(node.aiLevel),
    efficiency_improvement_percent: node.headcount,
    job_desc: node.positionDescription?.trim() || undefined,
    sub_jobs: steps,
  };
}

// ─── FormNode → OrgNode（用于预览） ───────────────────────────────────────────

export function convertToOrgNode(form: FormNode): OrgNode {
  const aiLevel = form.aiLevel;
  const digitalScore = aiLevel === 'high' ? 5 : aiLevel === 'medium' ? 4 : 3;
  const aiCoverage = aiLevel === 'high' ? 95 : aiLevel === 'medium' ? 60 : 30;

  const userSteps = (form.workflowSteps ?? [])
    .filter(s => s.title.trim() || s.humanTask.trim() || s.aiTask.trim())
    .map(s => ({
      title: s.title.trim() || '协同步骤',
      humanTask: s.humanTask.trim(),
      aiTask: s.aiTask.trim(),
      description: s.description?.trim(),
      aiRoleName: s.aiRoleName?.trim(),
    }));

  const displaySteps = userSteps.length > 0 ? userSteps : [{
    title: '协同执行',
    humanTask: '战略决策、创新突破与关键业务把控',
    aiTask: '数据分析与自动化执行支持',
    description: '',
    aiRoleName: 'AI 助手',
  }];

  return {
    id: form.id,
    name: form.name || '未命名',
    title: form.title,
    aiLevel,
    digitalScore,
    headcount: form.headcount,
    aiCoverage,
    aiTools: ['AI助手'],
    dataFlow: form.headcount * 120,
    aiEfficiencyBoost: aiLevel === 'high' ? 65 : aiLevel === 'medium' ? 45 : 30,
    aiReplacementRate: aiLevel === 'high' ? 40 : aiLevel === 'medium' ? 28 : 18,
    timeSaved: aiLevel === 'high' ? '日均节省 3.5h' : aiLevel === 'medium' ? '日均节省 2.0h' : '日均节省 1.2h',
    aiValue: `${form.name || '该岗位'}效率提升，AI 深度${aiLevel === 'high' ? '赋能' : aiLevel === 'medium' ? '辅助' : '探索'}`,
    positionDescription: form.positionDescription?.trim() || undefined,
    digitalMaturity: [
      { name: '流程自动化', score: digitalScore, max: 5 },
      { name: '数据驱动决策', score: digitalScore, max: 5 },
      { name: 'AI 工具渗透', score: digitalScore, max: 5 },
      { name: '协作数字化', score: digitalScore, max: 5 },
      { name: '知识管理', score: digitalScore - 0.5, max: 5 },
    ],
    humanTasks: ['人工任务'],
    aiTasks: ['AI任务'],
    collaborativeTasks: ['协作任务'],
    humanWorkloadPct: 50,
    aiWorkloadPct: 30,
    aiValueMetrics: [
      { label: '协同效率', value: '高', icon: 'ri-rocket-line', color: aiLevel === 'high' ? 'blue' : 'sky' },
      { label: 'AI覆盖', value: `${aiCoverage}%`, icon: 'ri-pie-chart-line', color: aiLevel === 'high' ? 'blue' : 'sky' },
    ],
    children: form.children.length > 0 ? form.children.map(convertToOrgNode) : undefined,
    workflowSteps: displaySteps,
  };
}
