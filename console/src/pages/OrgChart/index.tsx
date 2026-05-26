import { useState, useEffect } from 'react';
import KPIDashboard from './components/KPIDashboard';
import OrgChart from './components/OrgChart';
import NewsHub from '@/pages/Workbench/components/news/NewsHub';
import { backendToOrgNode, calcKpiStats, orgData as staticFallback, type KpiStats } from './components/orgData';
import type { OrgNode } from './components/orgData';
import { departmentApi } from '@/api/modules/department';

export default function OrgChartPage() {
  const [orgNode, setOrgNode] = useState<OrgNode>(staticFallback);
  const [kpiStats, setKpiStats] = useState<KpiStats | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('—');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const safetyTimer = setTimeout(() => { if (!cancelled) setLoading(false); }, 12_000);

    departmentApi.getTree()
      .then(res => {
        if (cancelled || !res?.root) return;
        const mapped = backendToOrgNode(res.root);
        const stats = calcKpiStats(res.root);
        setOrgNode(mapped);
        setKpiStats(stats);
        setLastUpdated(new Date().toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
        }));
      })
      .catch(() => {
        // 后端无数据时沿用静态示例数据
      })
      .finally(() => {
        clearTimeout(safetyTimer);
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-full bg-slate-50 text-slate-800 font-sans">
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-6 space-y-6">

        {/* ── 标题栏 ── */}
        <header className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-200">
              <i className="ri-organization-chart text-white text-lg" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                企业组织架构与数字化全景
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                AI 原生应用赋能下的组织效能、岗位流转与数字化成熟度分析
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {loading && (
              <div className="flex items-center gap-1.5 text-xs text-blue-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                <i className="ri-loader-4-line animate-spin" />
                <span>正在拉取最新数据…</span>
              </div>
            )}
            <div className="text-right bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
              <div className="text-[10px] text-slate-400 font-medium">数据更新时间</div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">{lastUpdated}</div>
            </div>
          </div>
        </header>

        {/* ── KPI 区块 ── */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5 bg-slate-50/60">
            <span className="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center">
              <i className="ri-dashboard-line text-blue-600 text-sm" />
            </span>
            <span className="text-sm font-semibold text-slate-700">核心指标看板</span>
          </div>
          <div className="p-5">
            <KPIDashboard stats={kpiStats} loading={loading} />
          </div>
        </section>

        {/* ── 组织架构图区块 ── */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2.5 bg-slate-50/60">
            <span className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center">
              <i className="ri-share-forward-2-line text-indigo-600 text-sm" />
            </span>
            <span className="text-sm font-semibold text-slate-700">组织架构 · AI 赋能全景</span>
          </div>
          <div className="p-5">
            <OrgChart data={orgNode} />
          </div>
        </section>

      </div>

      <NewsHub />
    </div>
  );
}
