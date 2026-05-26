// ─── 后端接口数据结构（与接口文档完全对应） ─────────────────────────────────

export interface SubJob {
  id?: number;
  department_id?: number;
  job_title: string;
  job_desc: string;
  agent_id: string;
  manual_task: string;
  agent_task: string;
}

export interface Department {
  id: number;
  parent_id: number | null;
  department_name: string;
  position_title: string;
  /** 1=低(数字化) 2=中(AI辅助) 3=高(AI深度) */
  ai_empowerment_level: 1 | 2 | 3;
  efficiency_improvement_percent: number;
  job_desc: string | null;
  sub_jobs: SubJob[];
  children?: Department[];
}

export interface DepartmentTree {
  root: Department;
}

export interface DepartmentListItem {
  id: number;
  department_name: string;
}

export interface DepartmentList {
  departments: DepartmentListItem[];
}

// ─── 新增/修改时的请求体 ──────────────────────────────────────────────────────

export interface CreateDepartmentBody {
  parent_id: number | null;
  department_name: string;
  position_title: string;
  ai_empowerment_level: 1 | 2 | 3;
  efficiency_improvement_percent: number;
  job_desc?: string;
  sub_jobs?: Omit<SubJob, 'id' | 'department_id'>[];
}

export interface UpdateDepartmentBody {
  id: number;
  department_name: string;
  position_title: string;
  ai_empowerment_level: 1 | 2 | 3;
  efficiency_improvement_percent: number;
  job_desc?: string;
  sub_jobs?: Omit<SubJob, 'id' | 'department_id'>[];
}
