const flowSteps = [
  {
    name: '需求洞察',
    dept: '产品 + 市场',
    ai: 'high',
    time: '3 天',
    icon: 'ri-lightbulb-line',
    desc: 'AI 辅助用户画像分析',
  },
  {
    name: '产品设计',
    dept: '设计 + 产品',
    ai: 'high',
    time: '5 天',
    icon: 'ri-palette-line',
    desc: 'AI 生成原型 + 交互',
  },
  {
    name: '研发实现',
    dept: '研发中心',
    ai: 'high',
    time: '14 天',
    icon: 'ri-code-box-line',
    desc: 'Copilot 辅助编码',
  },
  {
    name: '测试验证',
    dept: '测试 + QA',
    ai: 'medium',
    time: '5 天',
    icon: 'ri-bug-line',
    desc: '自动化测试覆盖 92%',
  },
  {
    name: '市场投放',
    dept: '增长 + 品牌',
    ai: 'high',
    time: '3 天',
    icon: 'ri-rocket-line',
    desc: '智能投放 + AIGC',
  },
  {
    name: '用户运营',
    dept: '运营 + 客服',
    ai: 'medium',
    time: '持续',
    icon: 'ri-user-heart-line',
    desc: 'AI 客服 7×24 在线',
  },
  {
    name: '数据分析',
    dept: '数据 + AI',
    ai: 'high',
    time: '7 天',
    icon: 'ri-bar-chart-line',
    desc: '实时数据反馈闭环',
  },
];

const aiConfig = {
  high: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', glow: 'shadow-[0_0_12px_rgba(59,130,246,0.15)]' },
  medium: { bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200', glow: '' },
};

export default function CollaborationFlow() {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute -top-10 right-20 w-40 h-40 bg-blue-50/40 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-center justify-between mb-5 relative z-10">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold text-slate-800">企业价值链流转</h4>
          <span className="text-[10px] text-blue-600 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-100 font-medium">
            <i className="ri-loop-left-line mr-0.5" />
            全链路闭环
          </span>
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex items-start gap-0 overflow-x-auto pb-3 scrollbar-thin">
          {flowSteps.map((step, i) => {
            const ai = aiConfig[step.ai as 'high' | 'medium'];
            const isLast = i === flowSteps.length - 1;
            return (
              <div key={step.name} className="flex items-start shrink-0">
                <div className="w-[120px] text-center relative">
                  {/* 脉冲光环 */}
                  {step.ai === 'high' && (
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-10 h-10 rounded-xl bg-blue-400/10 animate-ping pointer-events-none" />
                  )}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 ${ai.bg} ${ai.text} ${step.ai === 'high' ? ai.glow : ''} relative z-10 border ${ai.border}`}
                  >
                    <i className={`${step.icon} text-lg`} />
                  </div>
                  <div className="text-xs font-semibold text-slate-700">{step.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{step.dept}</div>
                  <div className="text-[10px] text-slate-400">{step.time}</div>
                  <div className="text-[9px] text-slate-400 mt-1 leading-tight">{step.desc}</div>
                </div>
                {!isLast && (
                  <div className="flex flex-col items-center pt-4 mx-1 relative">
                    {/* 流动箭头 */}
                    <div className="relative">
                      <i className="ri-arrow-right-line text-slate-300 text-sm relative z-10" />
                      {/* 流动虚线 */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-[2px] overflow-hidden">
                        <div
                          className="w-full h-full animate-flow-dash"
                          style={{
                            background: 'repeating-linear-gradient(90deg, #cbd5e1, #cbd5e1 4px, transparent 4px, transparent 8px)',
                            backgroundSize: '16px 100%',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {isLast && (
                  <div className="flex items-center shrink-0 ml-2 pt-4">
                    <div className="flex flex-col items-center">
                      <div className="relative">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-blue-400/10 animate-ping pointer-events-none" />
                        <i className="ri-arrow-go-back-line text-blue-500 text-lg relative z-10" />
                      </div>
                      <span className="text-[9px] text-blue-500 mt-0.5 font-medium">反馈闭环</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}