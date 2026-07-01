import type { MaterialFile, FileType } from '@/mocks/materialCenter';

interface Props {
  file: MaterialFile;
  viewMode: 'grid' | 'list';
  selected: boolean;
  onSelect: (id: string) => void;
  onPreview: (file: MaterialFile) => void;
  onDownload?: (file: MaterialFile) => void | Promise<void>;
  onAddToTask?: (file: MaterialFile) => void;
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

// type → icon / accent colours
const typeConfig: Record<FileType, { icon: string; iconColor: string; bg: string; label: string }> = {
  ppt:   { icon: 'ri-slideshow-2-line',   iconColor: '#f97316', bg: '#fff7ed', label: 'PPT' },
  word:  { icon: 'ri-file-word-line',     iconColor: '#3b82f6', bg: '#eff6ff', label: 'Word' },
  pdf:   { icon: 'ri-file-pdf-2-line',    iconColor: '#ef4444', bg: '#fef2f2', label: 'PDF' },
  video: { icon: 'ri-video-line',         iconColor: '#8b5cf6', bg: '#f5f3ff', label: '视频' },
  image: { icon: 'ri-image-2-line',       iconColor: '#22c55e', bg: '#f0fdf4', label: '图片' },
  audio: { icon: 'ri-music-2-line',       iconColor: '#ec4899', bg: '#fdf2f8', label: '音频' },
  excel: { icon: 'ri-file-excel-2-line',  iconColor: '#10b981', bg: '#ecfdf5', label: 'Excel' },
};

export const MaterialFileCard = ({ file, viewMode, selected, onSelect, onPreview, onDownload, onAddToTask }: Props) => {
  const tc = typeConfig[file.type];

  /* ───────── List mode ───────── */
  if (viewMode === 'list') {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 16,
          borderRadius: SYS.radius,
          border: `1px solid ${selected ? '#bfdbfe' : SYS.borderBase}`,
          background: selected ? '#eff6ff' : SYS.bgCard,
          padding: '10px 16px',
          cursor: 'pointer',
          fontFamily: SYS.fontFamily,
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => { if (!selected) { e.currentTarget.style.borderColor = '#bfdbfe'; } }}
        onMouseLeave={(e) => { if (!selected) { e.currentTarget.style.borderColor = SYS.borderBase; } }}
      >
        {/* Checkbox */}
        <button
          type="button"
          onClick={() => onSelect(file.id)}
          style={{
            width: 16, height: 16, flexShrink: 0, borderRadius: 4,
            border: `2px solid ${selected ? SYS.primary : '#cbd5e1'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: selected ? SYS.primary : 'transparent',
            cursor: 'pointer', padding: 0,
            transition: 'all 0.15s',
          }}
        >
          {selected && <i className="ri-check-line" style={{ fontSize: 10, color: '#fff' }} />}
        </button>

        {/* Icon / Thumb */}
        <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: SYS.radiusSM, overflow: 'hidden' }}>
          {file.thumbnail ? (
            <img src={file.thumbnail} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: tc.bg }}>
              <i className={tc.icon} style={{ fontSize: 20, color: tc.iconColor }} />
            </div>
          )}
        </div>

        {/* File info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: SYS.textMain, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 500, background: tc.bg, color: tc.iconColor }}>
              {tc.label}
            </span>
            <span style={{ fontSize: 11, color: SYS.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.courseName ? `来自：${file.courseName}` : '手动上传'}
            </span>
          </div>
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: SYS.textSub, width: 56, textAlign: 'right' }}>{file.size}</span>
          {file.duration && <span style={{ fontSize: 11, color: SYS.textMuted, width: 48, textAlign: 'right' }}>{file.duration}</span>}
          {file.pages && !file.duration && <span style={{ fontSize: 11, color: SYS.textMuted, width: 48, textAlign: 'right' }}>{file.pages}页</span>}
          {!file.duration && !file.pages && <span style={{ width: 48 }} />}
          <span style={{ fontSize: 11, color: SYS.textMuted, width: 112, textAlign: 'right' }}>{file.updatedAt}</span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {[
            { icon: 'ri-eye-line', title: '预览', onClick: () => onPreview(file), hoverColor: SYS.primary, hoverBg: '#eff6ff' },
            { icon: 'ri-download-line', title: '下载', onClick: () => void onDownload?.(file), hoverColor: SYS.primary, hoverBg: '#eff6ff' },
            { icon: 'ri-chat-upload-line', title: '添加到任务', onClick: () => onAddToTask?.(file), hoverColor: '#8b5cf6', hoverBg: '#f5f3ff' },
          ].map(({ icon, title, onClick, hoverColor, hoverBg }) => (
            <button
              key={icon}
              type="button"
              onClick={onClick}
              title={title}
              style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: SYS.textMuted, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = hoverColor; e.currentTarget.style.background = hoverBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = SYS.textMuted; e.currentTarget.style.background = 'transparent'; }}
            >
              <i className={icon} style={{ fontSize: 13 }} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ───────── Grid mode ───────── */
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 268,
        borderRadius: SYS.radius,
        overflow: 'hidden',
        border: `1px solid ${selected ? '#bfdbfe' : SYS.borderBase}`,
        background: selected ? '#eff6ff' : SYS.bgCard,
        cursor: 'pointer',
        fontFamily: SYS.fontFamily,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.borderColor = '#93c5fd';
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(59,130,246,0.10)';
        const overlay = e.currentTarget.querySelector<HTMLElement>('.mc-card-overlay');
        if (overlay) { overlay.style.opacity = '1'; overlay.style.pointerEvents = 'auto'; }
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.borderColor = SYS.borderBase;
        e.currentTarget.style.boxShadow = 'none';
        const overlay = e.currentTarget.querySelector<HTMLElement>('.mc-card-overlay');
        if (overlay) { overlay.style.opacity = '0'; overlay.style.pointerEvents = 'none'; }
      }}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative', width: '100%', height: 130, flexShrink: 0 }}>
        {file.thumbnail ? (
          <img src={file.thumbnail} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: tc.bg }}>
            <i className={tc.icon} style={{ fontSize: 36, color: tc.iconColor }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: tc.iconColor }}>{tc.label}</span>
          </div>
        )}

        {/* Source badge */}
        <span
          style={{
            position: 'absolute', top: 8, left: 8, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
            background: file.source === 'platform' ? SYS.primary : 'rgba(15,23,42,0.65)',
            color: '#fff', letterSpacing: '0.02em',
          }}
        >
          {file.source === 'platform' ? '平台生成' : '已上传'}
        </span>

        {/* Duration overlay */}
        {file.duration && (
          <span style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 10, background: 'rgba(0,0,0,0.55)', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>
            {file.duration}
          </span>
        )}

        {/* Checkbox */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect(file.id); }}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 18, height: 18, borderRadius: 4,
            border: `2px solid ${selected ? SYS.primary : 'rgba(255,255,255,0.8)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: selected ? SYS.primary : 'rgba(0,0,0,0.18)',
            cursor: 'pointer', padding: 0,
            opacity: selected ? 1 : 0,
            transition: 'opacity 0.15s, background 0.15s',
          }}
          className="mc-card-checkbox"
        >
          {selected && <i className="ri-check-line" style={{ fontSize: 10, color: '#fff' }} />}
        </button>
      </div>

      {/* Info */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 12px 44px' }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: SYS.textMain, lineHeight: 1.4, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {file.name}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 500, background: tc.bg, color: tc.iconColor }}>{tc.label}</span>
          <span style={{ fontSize: 10, color: SYS.textMuted }}>{file.size}</span>
        </div>
        {file.courseName && (
          <p style={{ fontSize: 10, color: SYS.textMuted, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.courseName}</p>
        )}
        <p style={{ fontSize: 10, color: '#cbd5e1', marginTop: 4 }}>{file.updatedAt.split(' ')[0]}</p>
      </div>

      {/* Hover action overlay — absolute so it never shifts layout */}
      <div
        className="mc-card-overlay"
        style={{
          position: 'absolute', inset: 'auto 0 0 0',
          display: 'flex', gap: 6,
          background: 'linear-gradient(to top, #fff 60%, rgba(255,255,255,0.9) 80%, transparent)',
          padding: '18px 10px 10px',
          opacity: 0, pointerEvents: 'none',
          transition: 'opacity 0.18s',
        }}
      >
        <button
          type="button"
          onClick={() => onPreview(file)}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: SYS.radiusSM, background: '#eff6ff', color: SYS.primary, border: 'none', padding: '6px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: SYS.fontFamily, whiteSpace: 'nowrap', transition: 'background 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#dbeafe'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#eff6ff'; }}
        >
          <i className="ri-eye-line" style={{ fontSize: 12 }} />预览
        </button>
        <button
          type="button"
          onClick={() => void onDownload?.(file)}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: SYS.radiusSM, background: '#f8fafc', color: SYS.textSub, border: 'none', padding: '6px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: SYS.fontFamily, whiteSpace: 'nowrap', transition: 'background 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
        >
          <i className="ri-download-line" style={{ fontSize: 12 }} />下载
        </button>
        <button
          type="button"
          onClick={() => onAddToTask?.(file)}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: SYS.radiusSM, background: '#f5f3ff', color: '#8b5cf6', border: 'none', padding: '6px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: SYS.fontFamily, whiteSpace: 'nowrap', transition: 'background 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#ede9fe'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#f5f3ff'; }}
        >
          <i className="ri-chat-upload-line" style={{ fontSize: 12 }} />添加到任务
        </button>
      </div>
    </div>
  );
};

export default MaterialFileCard;
