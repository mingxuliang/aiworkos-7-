import type { ChatMessage as ChatMessageType } from '@/mocks/knowledgeBase';

interface Props {
  message: ChatMessageType;
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

const formatContent = (content: string) =>
  content.split('\n').map((line, i, arr) => {
    const parts = line.split(/\*\*(.*?)\*\*/g);
    return (
      <span key={i}>
        {parts.map((part, j) =>
          j % 2 === 1 ? (
            <strong key={j} style={{ fontWeight: 600, color: SYS.textMain }}>{part}</strong>
          ) : (
            part
          )
        )}
        {i < arr.length - 1 && <br />}
      </span>
    );
  });

const ChatMessageItem = ({ message }: Props) => {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, fontFamily: SYS.fontFamily }}>
        <div style={{ maxWidth: '70%' }}>
          <div
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              color: '#fff',
              borderRadius: '12px 2px 12px 12px',
              padding: '10px 14px',
              fontSize: 13,
              lineHeight: 1.6,
              boxShadow: '0 2px 10px rgba(59,130,246,0.2)',
            }}
          >
            {message.content}
          </div>
          <p style={{ fontSize: 10, color: SYS.textMuted, textAlign: 'right', marginTop: 3, marginBottom: 0, paddingRight: 2 }}>
            {message.timestamp}
          </p>
        </div>
        <div
          style={{
            width: 32, height: 32, flexShrink: 0, borderRadius: SYS.radiusSM,
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(59,130,246,0.2)', marginTop: 2,
          }}
        >
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: SYS.fontFamily }}>刘</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 10, fontFamily: SYS.fontFamily }}>
      <div
        style={{
          width: 32, height: 32, flexShrink: 0, borderRadius: SYS.radiusSM,
          background: 'linear-gradient(135deg, #60a5fa, #2563eb)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(59,130,246,0.15)', marginTop: 2,
        }}
      >
        <i className="ri-robot-2-line" style={{ fontSize: 14, color: '#fff' }} />
      </div>

      <div style={{ maxWidth: '78%' }}>
        <div
          style={{
            background: SYS.bgCard,
            border: `1px solid ${SYS.borderBase}`,
            borderRadius: '2px 12px 12px 12px',
            padding: '10px 14px',
            fontSize: 13,
            color: SYS.textSub,
            lineHeight: 1.7,
          }}
        >
          {formatContent(message.content)}
        </div>

        {/* Source citations */}
        {message.sources && message.sources.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {message.sources.map((src, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: SYS.primaryBg, border: '1px solid #bfdbfe',
                  borderRadius: SYS.radiusSM, padding: '6px 10px', cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#dbeafe'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = SYS.primaryBg; }}
              >
                <i className="ri-file-text-line" style={{ fontSize: 12, color: SYS.primary, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: '#1d4ed8', margin: 0, lineHeight: 1.3 }}>{src.title}</p>
                  <p style={{ fontSize: 9, color: '#93c5fd', margin: 0 }}>{src.kbName} · {src.page}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Timestamp + action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, paddingLeft: 2 }}>
          <p style={{ fontSize: 10, color: SYS.textMuted, margin: 0 }}>{message.timestamp}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {[
              { icon: 'ri-thumb-up-line', hoverColor: SYS.primary },
              { icon: 'ri-thumb-down-line', hoverColor: '#ef4444' },
              { icon: 'ri-file-copy-line', hoverColor: SYS.primary },
            ].map(({ icon, hoverColor }) => (
              <button
                key={icon}
                type="button"
                style={{
                  width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer',
                  borderRadius: 4, padding: 0, transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = hoverColor; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#cbd5e1'; }}
              >
                <i className={icon} style={{ fontSize: 11 }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessageItem;
