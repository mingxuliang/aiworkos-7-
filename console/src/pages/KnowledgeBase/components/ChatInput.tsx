import { useState, useRef, type KeyboardEvent } from 'react';

interface Props {
  onSend: (text: string) => void;
  loading: boolean;
  disabled: boolean;
}

const SYS = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  bgCard: '#ffffff',
  borderBase: '#e2e8f0',
  primary: '#3b82f6',
  textSub: '#64748b',
  textMuted: '#94a3b8',
  radiusSM: 8,
};

const ChatInput = ({ onSend, loading, disabled }: Props) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = value.trim() && !loading && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div
      style={{
        padding: '12px 20px 14px',
        background: SYS.bgCard,
        borderTop: `1px solid ${SYS.borderBase}`,
        fontFamily: SYS.fontFamily,
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'flex-end', gap: 8,
          background: '#f8fafc',
          border: `1px solid ${SYS.borderBase}`,
          borderRadius: 12,
          padding: '10px 12px',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onFocusCapture={(e) => {
          const el = e.currentTarget;
          el.style.borderColor = '#93c5fd';
          el.style.background = SYS.bgCard;
        }}
        onBlurCapture={(e) => {
          const el = e.currentTarget;
          el.style.borderColor = SYS.borderBase;
          el.style.background = '#f8fafc';
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          rows={1}
          placeholder="输入你的问题，从知识库中获取答案… (Enter 发送，Shift+Enter 换行)"
          disabled={loading || disabled}
          style={{
            flex: 1, resize: 'none', background: 'transparent',
            border: 'none', outline: 'none',
            fontSize: 13, color: SYS.textSub, fontFamily: SYS.fontFamily,
            lineHeight: 1.6, minHeight: 22, maxHeight: 160,
            overflowY: 'auto',
            appearance: 'none',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingBottom: 2 }}>
          <button
            type="button"
            title="上传文件"
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: SYS.radiusSM, border: 'none', background: 'transparent',
              color: SYS.textMuted, cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = SYS.primary; e.currentTarget.style.background = '#eff6ff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = SYS.textMuted; e.currentTarget.style.background = 'transparent'; }}
          >
            <i className="ri-attachment-2" style={{ fontSize: 14 }} />
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: SYS.radiusSM, border: 'none', cursor: canSend ? 'pointer' : 'not-allowed',
              background: canSend ? SYS.primary : '#e2e8f0',
              color: canSend ? '#fff' : SYS.textMuted,
              transition: 'all 0.15s',
              boxShadow: canSend ? '0 2px 8px rgba(59,130,246,0.25)' : 'none',
            }}
            onMouseEnter={(e) => { if (canSend) e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            {loading
              ? <i className="ri-loader-4-line" style={{ fontSize: 14, animation: 'spin 1s linear infinite' }} />
              : <i className="ri-send-plane-fill" style={{ fontSize: 14 }} />
            }
          </button>
        </div>
      </div>
      <p style={{ fontSize: 10, color: SYS.textMuted, textAlign: 'center', marginTop: 6, marginBottom: 0 }}>
        AI 回答基于已选知识库内容生成，仅供参考
      </p>
    </div>
  );
};

export default ChatInput;
