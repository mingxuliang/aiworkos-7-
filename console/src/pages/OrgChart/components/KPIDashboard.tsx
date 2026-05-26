import type { KpiStats } from './orgData';

interface KPIDashboardProps {
  stats?: KpiStats;
  loading?: boolean;
}

export default function KPIDashboard({ stats, loading }: KPIDashboardProps) {
  const kpis = [
    {
      title: '组织规模',
      main: loading ? '—' : `${stats?.totalNodes ?? '—'}个节点`,
      icon: 'ri-team-line',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      accentBg: 'bg-blue-600',
    },
    {
      title: 'AI 深度赋能',
      main: loading ? '—' : `${stats?.highAiCount ?? '—'}个岗位`,
      icon: 'ri-brain-line',
      iconBg: 'bg-sky-100',
      iconColor: 'text-sky-600',
      accentBg: 'bg-sky-500',
    },
    {
      title: '平均效率提升',
      main: loading ? '—' : stats?.avgEfficiency ? `${stats.avgEfficiency}%` : 'N/A',
      icon: 'ri-dashboard-line',
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
      accentBg: 'bg-indigo-500',
    },
    {
      title: '部门总数',
      main: loading ? '—' : `${stats?.departmentCount ?? '—'}`,
      icon: 'ri-exchange-line',
      iconBg: 'bg-teal-100',
      iconColor: 'text-teal-600',
      accentBg: 'bg-teal-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.title}
          className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow group"
        >
          <div className={`h-1 w-full ${kpi.accentBg}`} />
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">
                {kpi.title}
              </span>
              <div
                className={`w-8 h-8 rounded-lg ${kpi.iconBg} flex items-center justify-center group-hover:scale-110 transition-transform`}
              >
                <i className={`${kpi.icon} ${kpi.iconColor} text-sm`} />
              </div>
            </div>
            <div
              className={`text-2xl font-bold leading-none mb-1 ${loading ? 'text-slate-300 animate-pulse' : 'text-slate-800'}`}
            >
              {kpi.main}
            </div>
            {/* 占位：保持去掉副标题/趋势行后的卡片高度不变 */}
            <div
              className="text-[11px] mb-3 min-h-[16px] invisible"
              aria-hidden="true"
            >
              &nbsp;
            </div>
            <div
              className="pt-2.5 border-t border-slate-100 min-h-[22px] invisible"
              aria-hidden="true"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
