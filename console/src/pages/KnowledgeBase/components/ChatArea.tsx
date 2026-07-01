import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/mocks/knowledgeBase';
import ChatMessageItem from './ChatMessage';
import { suggestedQuestions } from '@/mocks/knowledgeBase';

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  onSuggest: (q: string) => void;
}

const SYS = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  bgCard: '#ffffff',
  borderBase: '#e2e8f0',
  primary: '#3b82f6',
  primaryBg: '#eff6ff',
  textSub: '#64748b',
  textMuted: '#94a3b8',
  radius: 10,
  radiusSM: 8,
};

const TypingIndicator = () => (
  <div style={{ display: 'flex', gap: 12 }}>
    <div
      style={{
        width: 32, height: 32, flexShrink: 0, borderRadius: 10,
        background: 'linear-gradient(135deg, #60a5fa, #2563eb)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(59,130,246,0.2)',
      }}
    >
      <i className="ri-robot-2-line" style={{ fontSize: 14, color: '#fff' }} />
    </div>
    <div
      style={{
        background: SYS.bgCard, border: `1px solid ${SYS.borderBase}`,
        borderRadius: '0 12px 12px 12px',
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 5,
      }}
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          style={{
            width: 6, height: 6, background: '#93c5fd', borderRadius: '50%',
            animation: 'bounce 1.2s ease-in-out infinite',
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </div>
  </div>
);

const ChatArea = ({ messages, loading, onSuggest }: Props) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const showSuggestions = messages.length <= 1;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <div
      className="migrated-scroll"
      style={{
        flex: 1, padding: '20px 24px',
        display: 'flex', flexDirection: 'column', gap: 20,
        fontFamily: SYS.fontFamily,
      }}
    >
      {messages.map((msg) => (
        <ChatMessageItem key={msg.id} message={msg} />
      ))}

      {loading && <TypingIndicator />}

      {showSuggestions && !loading && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 12, color: SYS.textMuted, fontWeight: 500, margin: '0 0 10px' }}>你可以试着问：</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onSuggest(q)}
                style={{
                  textAlign: 'left', background: SYS.bgCard,
                  border: `1px solid ${SYS.borderBase}`,
                  borderRadius: SYS.radiusSM, padding: '10px 13px',
                  fontSize: 12, color: SYS.textSub, cursor: 'pointer',
                  fontFamily: SYS.fontFamily, lineHeight: 1.5,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#93c5fd';
                  e.currentTarget.style.background = SYS.primaryBg;
                  e.currentTarget.style.color = SYS.primary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = SYS.borderBase;
                  e.currentTarget.style.background = SYS.bgCard;
                  e.currentTarget.style.color = SYS.textSub;
                }}
              >
                <i className="ri-question-line" style={{ color: '#93c5fd', marginRight: 6 }} />
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};

export default ChatArea;
