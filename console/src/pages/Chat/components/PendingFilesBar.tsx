/**
 * File chips rendered inside the chat input box (via sender.beforeUI).
 * Visually matches the Ant Design Attachments chip style used by the library.
 */
import { useState } from 'react';
import type { PendingChatFile } from '@/stores/pendingChatFilesStore';

const FF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";

interface ChipConfig { icon: string; color: string; bg: string; border: string }

function mimeChip(mime: string): ChipConfig {
  if (mime.startsWith('image/'))
    return { icon: 'ri-image-2-line', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' };
  if (mime.startsWith('video/'))
    return { icon: 'ri-video-line', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' };
  if (mime.startsWith('audio/'))
    return { icon: 'ri-music-2-line', color: '#db2777', bg: '#fdf2f8', border: '#fbcfe8' };
  if (mime.includes('pdf'))
    return { icon: 'ri-file-pdf-2-line', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
  if (mime.includes('word') || mime.includes('docx'))
    return { icon: 'ri-file-word-line', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' };
  if (mime.includes('excel') || mime.includes('xlsx') || mime.includes('spreadsheet'))
    return { icon: 'ri-file-excel-2-line', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
  if (mime.includes('ppt') || mime.includes('presentation'))
    return { icon: 'ri-slideshow-2-line', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' };
  if (mime.includes('html') || mime.includes('xml'))
    return { icon: 'ri-global-line', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' };
  if (mime.startsWith('text/') || mime.includes('markdown'))
    return { icon: 'ri-file-text-line', color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe' };
  return { icon: 'ri-file-line', color: '#6366f1', bg: '#eef2ff', border: '#c7d2fe' };
}

interface ChipProps {
  file: PendingChatFile;
  onRemove: (id: string) => void;
}

function FileChip({ file, onRemove }: ChipProps) {
  const [hovered, setHovered] = useState(false);
  const cfg = mimeChip(file.mimeType);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 6px 3px 4px',
        borderRadius: 6,
        border: `1px solid ${hovered ? cfg.color + '55' : cfg.border}`,
        background: hovered ? cfg.bg : '#ffffff',
        cursor: 'default',
        fontFamily: FF,
        maxWidth: 220,
        transition: 'border-color 0.15s, background 0.15s',
        flexShrink: 0,
      }}
    >
      {/* File type icon */}
      <div style={{
        width: 20, height: 20, borderRadius: 4,
        background: cfg.bg, border: `1px solid ${cfg.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <i className={cfg.icon} style={{ fontSize: 11, color: cfg.color }} />
      </div>

      {/* Filename */}
      <span style={{
        fontSize: 12, color: '#374151', fontWeight: 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        maxWidth: 150, lineHeight: '20px',
      }}>
        {file.filename}
      </span>

      {/* Remove button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(file.id); }}
        title="移除"
        style={{
          width: 16, height: 16, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hovered ? '#f3f4f6' : 'none',
          border: 'none', cursor: 'pointer', borderRadius: 999,
          color: '#9ca3af', padding: 0,
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fee2e2'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = hovered ? '#f3f4f6' : 'none'; }}
      >
        <i className="ri-close-line" style={{ fontSize: 12 }} />
      </button>
    </div>
  );
}

interface Props {
  files: PendingChatFile[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export default function PendingFilesBar({ files, onRemove, onClear }: Props) {
  if (files.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        padding: '8px 12px 6px',
        fontFamily: FF,
        borderBottom: '1px solid #f3f4f6',
      }}
    >
      {files.map((f) => (
        <FileChip key={f.id} file={f} onRemove={onRemove} />
      ))}

      {files.length > 1 && (
        <button
          type="button"
          onClick={onClear}
          title="清除全部待发文件"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '3px 7px', borderRadius: 6,
            border: '1px solid #fecaca', background: '#fef2f2',
            color: '#dc2626', fontSize: 11, fontWeight: 500,
            cursor: 'pointer', fontFamily: FF, flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#fef2f2'; }}
        >
          <i className="ri-close-circle-line" style={{ fontSize: 12 }} />
          全部清除
        </button>
      )}
    </div>
  );
}
