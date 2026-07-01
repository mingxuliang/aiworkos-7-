import { knowledgeBases } from '@/mocks/knowledgeBase';

interface Props {
  selectedKbIds: string[];
  onToggle: (id: string) => void;
}

const SYS = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  bgCard: '#ffffff',
  borderBase: '#e2e8f0',
  primary: '#3b82f6',
  primaryBg: '#eff6ff',
  textMain: '#0f172a',
  textSub: '#64748b',
  textMuted: '#94a3b8',
  radius: 10,
  radiusSM: 8,
};

// Map Tailwind gradient class strings to actual CSS gradient values
const gradientMap: Record<string, string> = {
  'from-blue-500 to-blue-700':    'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  'from-sky-500 to-blue-600':     'linear-gradient(135deg, #0ea5e9, #2563eb)',
  'from-indigo-500 to-blue-600':  'linear-gradient(135deg, #6366f1, #2563eb)',
  'from-cyan-500 to-sky-600':     'linear-gradient(135deg, #06b6d4, #0284c7)',
  'from-emerald-500 to-green-600':'linear-gradient(135deg, #10b981, #16a34a)',
  'from-violet-500 to-purple-600':'linear-gradient(135deg, #8b5cf6, #9333ea)',
  'from-orange-500 to-amber-600': 'linear-gradient(135deg, #f97316, #d97706)',
};

const KnowledgeBaseSidebar = ({ selectedKbIds, onToggle }: Props) => {
  const allSelected = selectedKbIds.length === knowledgeBases.length;
  const totalDocs = knowledgeBases.reduce((a, b) => a + b.docCount, 0);
  const selectedDocs = knowledgeBases.filter((k) => selectedKbIds.includes(k.id)).reduce((a, b) => a + b.docCount, 0);

  const kbItem = (isSelected: boolean) => ({
    width: '100%' as const,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: '9px 10px',
    borderRadius: SYS.radius,
    border: `1px solid ${isSelected ? '#bfdbfe' : 'transparent'}`,
    background: isSelected ? SYS.primaryBg : 'transparent',
    cursor: 'pointer' as const,
    fontFamily: SYS.fontFamily,
    transition: 'all 0.15s',
    textAlign: 'left' as const,
  });

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: SYS.bgCard,
        borderRight: `1px solid ${SYS.borderBase}`,
        fontFamily: SYS.fontFamily,
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${SYS.borderBase}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: SYS.textMain, margin: 0 }}>知识库</h2>
          <button
            type="button"
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: 11, color: SYS.primary, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: SYS.fontFamily, fontWeight: 500, padding: '2px 4px',
              borderRadius: 4, transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = SYS.primaryBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <i className="ri-add-line" style={{ fontSize: 13 }} />新建
          </button>
        </div>
        <p style={{ fontSize: 11, color: SYS.textMuted, margin: 0 }}>勾选知识库范围进行问答</p>
      </div>

      {/* KB List */}
      <div className="migrated-scroll" style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* All */}
        <button
          type="button"
          style={kbItem(allSelected)}
          onMouseEnter={(e) => { if (!allSelected) e.currentTarget.style.background = '#f8fafc'; }}
          onMouseLeave={(e) => { if (!allSelected) e.currentTarget.style.background = 'transparent'; }}
        >
          <span
            style={{
              width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: SYS.radiusSM, background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            }}
          >
            <i className="ri-database-2-line" style={{ fontSize: 14, color: '#fff' }} />
          </span>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: SYS.textMain, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>全部知识库</p>
            <p style={{ fontSize: 10, color: SYS.textMuted, margin: 0 }}>{totalDocs} 份文档</p>
          </div>
          <div
            style={{
              width: 16, height: 16, flexShrink: 0, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${allSelected ? SYS.primary : '#cbd5e1'}`,
              background: allSelected ? SYS.primary : 'transparent',
              transition: 'all 0.15s',
            }}
          >
            {allSelected && <i className="ri-check-line" style={{ fontSize: 10, color: '#fff' }} />}
          </div>
        </button>

        {/* Divider label */}
        <div style={{ padding: '6px 4px 2px' }}>
          <p style={{ fontSize: 10, color: SYS.textMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>各知识库</p>
        </div>

        {/* Individual KBs */}
        {knowledgeBases.map((kb) => {
          const isSelected = selectedKbIds.includes(kb.id);
          return (
            <button
              key={kb.id}
              type="button"
              onClick={() => onToggle(kb.id)}
              style={kbItem(isSelected)}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
            >
              <span
                style={{
                  width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: SYS.radiusSM, background: gradientMap[kb.color] ?? 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                }}
              >
                <i className={kb.icon} style={{ fontSize: 14, color: '#fff' }} />
              </span>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: SYS.textMain, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kb.name}</p>
                <p style={{ fontSize: 10, color: SYS.textMuted, margin: 0 }}>{kb.docCount} 份文档</p>
              </div>
              <div
                style={{
                  width: 16, height: 16, flexShrink: 0, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${isSelected ? SYS.primary : '#cbd5e1'}`,
                  background: isSelected ? SYS.primary : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                {isSelected && <i className="ri-check-line" style={{ fontSize: 10, color: '#fff' }} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom stats */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${SYS.borderBase}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: SYS.textSub }}>
          <i className="ri-file-list-2-line" style={{ color: SYS.primary }} />
          <span>已选 <strong style={{ color: SYS.primary }}>{selectedKbIds.length}</strong> 个知识库</span>
          <span style={{ color: SYS.textMuted }}>·</span>
          <span>共 {selectedDocs} 份文档</span>
        </div>
      </div>
    </aside>
  );
};

export default KnowledgeBaseSidebar;
