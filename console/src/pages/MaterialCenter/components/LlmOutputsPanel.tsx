import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { message, Spin } from 'antd';
import { useNavigate } from 'react-router-dom';
import { llmOutputsApi, type LlmOutputItem } from '@/api/modules/llmOutputs';
import { chatApi } from '@/api/modules/chat';
import { buildAuthHeaders } from '@/api/authHeaders';
import { getApiUrl } from '@/api/config';
import { usePendingChatFilesStore } from '@/stores/pendingChatFilesStore';
import type { MaterialFile } from '@/mocks/materialCenter';
import FilePreviewModal from './FilePreviewModal';
import { formatFileSize, mimeToFileType } from '../materialAdapter';

const SYS = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  bgCard: '#ffffff',
  bgPage: '#f0f4fa',
  borderBase: '#e2e8f0',
  borderLight: '#f1f5f9',
  primary: '#6366f1',
  primaryBg: '#eef2ff',
  textMain: '#0f172a',
  textSub: '#64748b',
  textMuted: '#94a3b8',
  radius: 10,
  radiusSM: 8,
};

// ── MIME helpers ─────────────────────────────────────────────────────────────

function mimeToLabel(mime: string): string {
  if (mime.startsWith('image/')) return '图片';
  if (mime.startsWith('video/')) return '视频';
  if (mime.startsWith('audio/')) return '音频';
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('word') || mime.includes('docx')) return 'Word';
  if (mime.includes('excel') || mime.includes('xlsx') || mime.includes('spreadsheet')) return 'Excel';
  if (mime.includes('ppt') || mime.includes('presentation')) return 'PPT';
  if (mime.includes('text/')) return '文本';
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('gz')) return '压缩包';
  const ext = mime.split('/')[1]?.toUpperCase() ?? 'FILE';
  return ext.length > 8 ? 'FILE' : ext;
}

function mimeToIcon(mime: string): { icon: string; iconColor: string; bg: string } {
  if (mime.startsWith('image/')) return { icon: 'ri-image-2-line', iconColor: '#22c55e', bg: '#f0fdf4' };
  if (mime.startsWith('video/')) return { icon: 'ri-video-line', iconColor: '#8b5cf6', bg: '#f5f3ff' };
  if (mime.startsWith('audio/')) return { icon: 'ri-music-2-line', iconColor: '#ec4899', bg: '#fdf2f8' };
  if (mime.includes('pdf')) return { icon: 'ri-file-pdf-2-line', iconColor: '#ef4444', bg: '#fef2f2' };
  if (mime.includes('word') || mime.includes('docx')) return { icon: 'ri-file-word-line', iconColor: '#3b82f6', bg: '#eff6ff' };
  if (mime.includes('excel') || mime.includes('xlsx') || mime.includes('spreadsheet')) return { icon: 'ri-file-excel-2-line', iconColor: '#10b981', bg: '#ecfdf5' };
  if (mime.includes('ppt') || mime.includes('presentation')) return { icon: 'ri-slideshow-2-line', iconColor: '#f97316', bg: '#fff7ed' };
  if (mime.includes('text/')) return { icon: 'ri-file-text-line', iconColor: '#64748b', bg: '#f8fafc' };
  return { icon: 'ri-file-line', iconColor: '#6366f1', bg: '#eef2ff' };
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

/** Shorten a session ID like "console:81:abc-def-..." → "abc-def-..." (last segment). */
function shortSession(sid: string): string {
  const parts = sid.split(':');
  const last = parts[parts.length - 1] ?? sid;
  return last.length > 16 ? `${last.slice(0, 8)}…${last.slice(-4)}` : last;
}

function outputToMaterialFile(item: LlmOutputItem): MaterialFile {
  const createdAt = formatDate(item.created_at);
  return {
    id: String(item.id),
    name: item.original_filename,
    type: mimeToFileType(item.mime_type, item.original_filename),
    size: formatFileSize(item.file_size),
    source: 'platform',
    category: 'platform-outputs',
    downloadUrl: `/api/llm-outputs/${item.id}/download`,
    courseName: item.agent_id ? `Agent：${item.agent_id}` : undefined,
    createdAt,
    updatedAt: createdAt,
    tags: ['平台产出'],
  };
}

// ── Inline Select ─────────────────────────────────────────────────────────────

interface FilterSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  icon: string;
  minWidth?: number;
}

function FilterSelect({ value, onChange, options, placeholder, icon, minWidth = 140 }: FilterSelectProps) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <i className={icon} style={{ position: 'absolute', left: 8, fontSize: 12, color: SYS.textMuted, pointerEvents: 'none', zIndex: 1 }} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: 'none', paddingLeft: 26, paddingRight: 24, paddingTop: 5, paddingBottom: 5,
          fontSize: 12, border: `1px solid ${value ? SYS.primary : SYS.borderBase}`,
          borderRadius: SYS.radiusSM, background: value ? SYS.primaryBg : '#f8fafc',
          color: value ? SYS.primary : SYS.textSub, fontFamily: SYS.fontFamily,
          cursor: 'pointer', minWidth, outline: 'none', fontWeight: value ? 600 : 400,
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <i className="ri-arrow-down-s-line" style={{ position: 'absolute', right: 6, fontSize: 13, color: SYS.textMuted, pointerEvents: 'none' }} />
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface OutputCardProps {
  item: LlmOutputItem;
  viewMode: 'grid' | 'list';
  selected: boolean;
  onSelect: (id: number) => void;
  onPreview: (item: LlmOutputItem) => void;
  onDownload: (item: LlmOutputItem) => void;
  onAddToTask: (item: LlmOutputItem) => void;
}

function OutputCard({ item, viewMode, selected, onSelect, onPreview, onDownload, onAddToTask }: OutputCardProps) {
  const cfg = mimeToIcon(item.mime_type);
  const label = mimeToLabel(item.mime_type);

  if (viewMode === 'list') {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 16,
          borderRadius: SYS.radius,
          border: `1px solid ${selected ? '#c7d2fe' : SYS.borderBase}`,
          background: selected ? SYS.primaryBg : SYS.bgCard,
          padding: '10px 16px', cursor: 'default',
          fontFamily: SYS.fontFamily, transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderColor = '#c7d2fe'; }}
        onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = SYS.borderBase; }}
      >
        <button
          type="button" onClick={() => onSelect(item.id)}
          style={{
            width: 16, height: 16, flexShrink: 0, borderRadius: 4,
            border: `2px solid ${selected ? SYS.primary : '#cbd5e1'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: selected ? SYS.primary : 'transparent',
            cursor: 'pointer', padding: 0, transition: 'all 0.15s',
          }}
        >
          {selected && <i className="ri-check-line" style={{ fontSize: 10, color: '#fff' }} />}
        </button>

        <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: SYS.radiusSM, display: 'flex', alignItems: 'center', justifyContent: 'center', background: cfg.bg }}>
          <i className={cfg.icon} style={{ fontSize: 22, color: cfg.iconColor }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: SYS.textMain, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.original_filename}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600, background: cfg.bg, color: cfg.iconColor }}>{label}</span>
            {item.agent_id && (
              <span style={{ fontSize: 11, color: SYS.textMuted }}>
                <i className="ri-robot-line" style={{ marginRight: 2 }} />{item.agent_id}
              </span>
            )}
            {item.session_id && (
              <span style={{ fontSize: 11, color: '#cbd5e1' }}>
                <i className="ri-chat-3-line" style={{ marginRight: 2 }} />{shortSession(item.session_id)}
              </span>
            )}
          </div>
        </div>

        <span style={{ fontSize: 11, color: SYS.textSub, width: 72, textAlign: 'right', flexShrink: 0 }}>{formatFileSize(item.file_size)}</span>
        <span style={{ fontSize: 11, color: SYS.textMuted, width: 128, textAlign: 'right', flexShrink: 0 }}>{formatDate(item.created_at)}</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {[
            { icon: 'ri-eye-line', title: '预览', onClick: () => onPreview(item), hoverColor: SYS.primary, hoverBg: SYS.primaryBg },
            { icon: 'ri-chat-upload-line', title: '添加到任务', onClick: () => onAddToTask(item), hoverColor: '#8b5cf6', hoverBg: '#f5f3ff' },
            { icon: 'ri-download-line', title: '下载', onClick: () => onDownload(item), hoverColor: SYS.primary, hoverBg: SYS.primaryBg },
          ].map(({ icon, title, onClick, hoverColor, hoverBg }) => (
            <button
              key={icon} type="button" onClick={onClick} title={title}
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

  // Grid mode
  return (
    <div
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        borderRadius: SYS.radius, overflow: 'hidden',
        border: `1px solid ${selected ? '#c7d2fe' : SYS.borderBase}`,
        background: selected ? SYS.primaryBg : SYS.bgCard,
        fontFamily: SYS.fontFamily, transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.borderColor = '#a5b4fc';
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.10)';
        const ov = e.currentTarget.querySelector<HTMLElement>('.lo-card-overlay');
        if (ov) { ov.style.opacity = '1'; ov.style.pointerEvents = 'auto'; }
        const cb = e.currentTarget.querySelector<HTMLElement>('.lo-card-cb');
        if (cb && !selected) cb.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.borderColor = SYS.borderBase;
        e.currentTarget.style.boxShadow = 'none';
        const ov = e.currentTarget.querySelector<HTMLElement>('.lo-card-overlay');
        if (ov) { ov.style.opacity = '0'; ov.style.pointerEvents = 'none'; }
        const cb = e.currentTarget.querySelector<HTMLElement>('.lo-card-cb');
        if (cb && !selected) cb.style.opacity = '0';
      }}
    >
      {/* Icon area */}
      <div style={{ width: '100%', height: 110, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: cfg.bg, position: 'relative' }}>
        <i className={cfg.icon} style={{ fontSize: 40, color: cfg.iconColor }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: cfg.iconColor }}>{label}</span>
        <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 9999, background: SYS.primary, color: '#fff', letterSpacing: '0.02em' }}>
          平台产出
        </span>
        <button
          type="button" onClick={(e) => { e.stopPropagation(); onSelect(item.id); }}
          className="lo-card-cb"
          style={{ position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 4, border: `2px solid ${selected ? SYS.primary : 'rgba(255,255,255,0.8)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: selected ? SYS.primary : 'rgba(0,0,0,0.18)', cursor: 'pointer', padding: 0, opacity: selected ? 1 : 0, transition: 'opacity 0.15s, background 0.15s' }}
        >
          {selected && <i className="ri-check-line" style={{ fontSize: 10, color: '#fff' }} />}
        </button>
      </div>

      {/* Info */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 12px 44px' }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: SYS.textMain, lineHeight: 1.4, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.original_filename}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 500, background: cfg.bg, color: cfg.iconColor }}>{label}</span>
          <span style={{ fontSize: 10, color: SYS.textMuted }}>{formatFileSize(item.file_size)}</span>
        </div>
        {item.agent_id && (
          <p style={{ fontSize: 10, color: SYS.textMuted, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <i className="ri-robot-line" style={{ marginRight: 2 }} />{item.agent_id}
          </p>
        )}
        {item.session_id && (
          <p style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <i className="ri-chat-3-line" style={{ marginRight: 2 }} />{shortSession(item.session_id)}
          </p>
        )}
        <p style={{ fontSize: 10, color: '#cbd5e1', marginTop: 4 }}>{formatDate(item.created_at).split(' ')[0]}</p>
      </div>

      {/* Hover overlay */}
      <div className="lo-card-overlay" style={{ position: 'absolute', inset: 'auto 0 0 0', display: 'flex', gap: 6, background: 'linear-gradient(to top, #fff 60%, rgba(255,255,255,0.9) 80%, transparent)', padding: '18px 10px 10px', opacity: 0, pointerEvents: 'none', transition: 'opacity 0.18s' }}>
        <button type="button" onClick={() => onPreview(item)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: SYS.radiusSM, background: SYS.primaryBg, color: SYS.primary, border: 'none', padding: '6px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: SYS.fontFamily, whiteSpace: 'nowrap' }}>
          <i className="ri-eye-line" style={{ fontSize: 12 }} />预览
        </button>
        <button type="button" onClick={() => onDownload(item)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: SYS.radiusSM, background: '#f8fafc', color: SYS.textSub, border: 'none', padding: '6px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: SYS.fontFamily, whiteSpace: 'nowrap' }}>
          <i className="ri-download-line" style={{ fontSize: 12 }} />下载
        </button>
        <button type="button" onClick={() => onAddToTask(item)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: SYS.radiusSM, background: '#f5f3ff', color: '#8b5cf6', border: 'none', padding: '6px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: SYS.fontFamily, whiteSpace: 'nowrap' }}>
          <i className="ri-chat-upload-line" style={{ fontSize: 12 }} />添加到任务
        </button>
      </div>
    </div>
  );
}

// ── MIME type filter ─────────────────────────────────────────────────────────

function mimeMatchesType(mime: string, type: string, filename = ''): boolean {
  const normalizedMime = mime.toLowerCase();
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (type) {
    case 'image': return normalizedMime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
    case 'video': return normalizedMime.startsWith('video/') || ['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext);
    case 'audio': return normalizedMime.startsWith('audio/') || ['mp3', 'wav', 'aac', 'flac', 'm4a'].includes(ext);
    case 'doc':
      return normalizedMime.includes('pdf') || normalizedMime.includes('word') || normalizedMime.includes('docx') ||
        normalizedMime.includes('excel') || normalizedMime.includes('xlsx') || normalizedMime.includes('spreadsheet') ||
        normalizedMime.includes('ppt') || normalizedMime.includes('presentation') || normalizedMime.startsWith('text/') ||
        ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'html', 'csv', 'json'].includes(ext);
    case 'text': return normalizedMime.startsWith('text/') || ['txt', 'md', 'html', 'csv', 'json'].includes(ext);
    case 'other':
      return !mimeMatchesType(mime, 'image', filename) &&
        !mimeMatchesType(mime, 'video', filename) &&
        !mimeMatchesType(mime, 'audio', filename) &&
        !mimeMatchesType(mime, 'doc', filename);
    default: return true;
  }
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface Props {
  viewMode: 'grid' | 'list';
  fileTypeFilter?: string;
  addSelectedRequest?: number;
  onSelectionCountChange?: (count: number) => void;
}

export default function LlmOutputsPanel({
  viewMode,
  fileTypeFilter,
  addSelectedRequest = 0,
  onSelectionCountChange,
}: Props) {
  const navigate = useNavigate();
  const addPendingFile = usePendingChatFilesStore((s) => s.addFile);
  const lastAddSelectedRequestRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LlmOutputItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(200);
  const [searchText, setSearchText] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortKey, setSortKey] = useState<'created_at' | 'name' | 'size'>('created_at');
  const [previewItem, setPreviewItem] = useState<LlmOutputItem | null>(null);

  // Filter state
  const [filterAgent, setFilterAgent] = useState('');
  const [filterSession, setFilterSession] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await llmOutputsApi.list({ page: 1, page_size: pageSize });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载产出物失败');
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => { void load(); }, [load]);

  // Reset agent/session filters when the category changes
  useEffect(() => {
    setFilterAgent('');
    setFilterSession('');
    setSelectedIds([]);
  }, [fileTypeFilter]);

  // Derive unique agent options from all items
  const agentOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    for (const it of items) {
      if (it.agent_id && !seen.has(it.agent_id)) {
        seen.add(it.agent_id);
        opts.push({ value: it.agent_id, label: it.agent_id });
      }
    }
    return opts;
  }, [items]);

  // Derive session options — filtered to selected agent if any
  const sessionOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    const source = filterAgent ? items.filter((it) => it.agent_id === filterAgent) : items;
    for (const it of source) {
      if (it.session_id && !seen.has(it.session_id)) {
        seen.add(it.session_id);
        opts.push({ value: it.session_id, label: shortSession(it.session_id) });
      }
    }
    return opts;
  }, [items, filterAgent]);

  // When agent changes, clear session filter if no longer valid
  const handleAgentChange = (v: string) => {
    setFilterAgent(v);
    setFilterSession('');
    setSelectedIds([]);
  };
  const handleSessionChange = (v: string) => {
    setFilterSession(v);
    setSelectedIds([]);
  };
  const clearFilters = () => {
    setFilterAgent('');
    setFilterSession('');
    setSearchText('');
    setSelectedIds([]);
  };

  const hasFilter = !!(filterAgent || filterSession || searchText);

  const filtered = useMemo(() => {
    let list = [...items];
    if (fileTypeFilter) list = list.filter((i) => mimeMatchesType(i.mime_type, fileTypeFilter, i.original_filename));
    if (filterAgent) list = list.filter((i) => i.agent_id === filterAgent);
    if (filterSession) list = list.filter((i) => i.session_id === filterSession);
    const q = searchText.trim().toLowerCase();
    if (q) list = list.filter((i) => i.original_filename.toLowerCase().includes(q));
    if (sortKey === 'name') list.sort((a, b) => a.original_filename.localeCompare(b.original_filename));
    else if (sortKey === 'size') list.sort((a, b) => b.file_size - a.file_size);
    else list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return list;
  }, [items, fileTypeFilter, filterAgent, filterSession, searchText, sortKey]);

  const allSelected = filtered.length > 0 && selectedIds.length === filtered.length;

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  useEffect(() => {
    onSelectionCountChange?.(selectedIds.length);
  }, [onSelectionCountChange, selectedIds.length]);

  const handleDownload = async (item: LlmOutputItem) => {
    try { await llmOutputsApi.downloadBlob(item); }
    catch (e) { message.error(e instanceof Error ? e.message : '下载失败'); }
  };

  const handlePreviewDownload = async () => {
    if (!previewItem) return;
    await handleDownload(previewItem);
  };

  const prepareLlmOutputForChat = useCallback(async (item: LlmOutputItem) => {
    // Download via authenticated API, then re-upload through the chat upload endpoint
    // so the agent receives the same local file path format as normal chat attachments.
    const downloadRes = await fetch(
      getApiUrl(`/llm-outputs/${item.id}/download`),
      { headers: buildAuthHeaders() },
    );
    if (!downloadRes.ok) throw new Error(`下载失败 (${downloadRes.status})`);
    const blob = await downloadRes.blob();
    const file = new File([blob], item.original_filename, { type: item.mime_type });

    const uploadRes = await chatApi.uploadFile(file);
    const chatUrl = chatApi.filePreviewUrl(uploadRes.url);

    addPendingFile({
      id: `llm-${item.id}`,
      filename: item.original_filename,
      url: chatUrl,
      mimeType: item.mime_type,
      size: item.file_size,
    });
  }, [addPendingFile]);

  const handleAddToTask = async (item: LlmOutputItem) => {
    const key = `add-to-task-${item.id}`;
    try {
      message.loading({ content: `正在准备 "${item.original_filename}"...`, key, duration: 0 });
      await prepareLlmOutputForChat(item);
      message.destroy(key);
      navigate('/chat');
    } catch (e) {
      message.error({ content: e instanceof Error ? e.message : '添加到任务失败', key });
    }
  };

  const handleAddSelectedToDialog = useCallback(async () => {
    const selectedItems = filtered.filter((item) => selectedIds.includes(item.id));
    if (selectedItems.length === 0) {
      message.info('请先勾选要添加到对话中的文件');
      return;
    }

    const key = 'add-selected-llm-outputs';
    try {
      message.loading({ content: `正在添加 ${selectedItems.length} 个文件到对话中...`, key, duration: 0 });
      await Promise.all(selectedItems.map((item) => prepareLlmOutputForChat(item)));
      setSelectedIds([]);
      message.success({ content: `已添加 ${selectedItems.length} 个文件到对话中`, key, duration: 2 });
      navigate('/chat');
    } catch (e) {
      message.error({ content: e instanceof Error ? e.message : '批量添加到对话失败', key });
    }
  }, [filtered, navigate, prepareLlmOutputForChat, selectedIds]);

  useEffect(() => {
    if (addSelectedRequest === 0 || lastAddSelectedRequestRef.current === addSelectedRequest) return;
    lastAddSelectedRequestRef.current = addSelectedRequest;
    void handleAddSelectedToDialog();
  }, [addSelectedRequest, handleAddSelectedToDialog]);

  const handleBatchDelete = async () => {
    if (!selectedIds.length) return;
    try {
      await llmOutputsApi.batchDelete(selectedIds);
      setItems((prev) => prev.filter((i) => !selectedIds.includes(i.id)));
      setTotal((t) => t - selectedIds.length);
      setSelectedIds([]);
      message.success(`已删除 ${selectedIds.length} 个文件`);
    } catch (e) { message.error(e instanceof Error ? e.message : '批量删除失败'); }
  };

  const totalBytes = useMemo(() => items.reduce((s, i) => s + i.file_size, 0), [items]);
  const filteredBytes = useMemo(() => filtered.reduce((s, i) => s + i.file_size, 0), [filtered]);

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: SYS.fontFamily }}>

      {/* ── Filter bar ── */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
        padding: '8px 20px', background: '#f8fafc', borderBottom: `1px solid ${SYS.borderBase}`,
      }}>
        {/* Agent filter */}
        {agentOptions.length > 0 && (
          <FilterSelect
            value={filterAgent}
            onChange={handleAgentChange}
            options={agentOptions}
            placeholder="全部 Agent"
            icon="ri-robot-line"
            minWidth={130}
          />
        )}

        {/* Session filter */}
        {sessionOptions.length > 0 && (
          <FilterSelect
            value={filterSession}
            onChange={handleSessionChange}
            options={sessionOptions}
            placeholder="全部会话"
            icon="ri-chat-3-line"
            minWidth={150}
          />
        )}

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 160px', maxWidth: 220, background: '#fff', border: `1px solid ${SYS.borderBase}`, borderRadius: SYS.radiusSM, padding: '5px 10px' }}>
          <i className="ri-search-line" style={{ fontSize: 13, color: SYS.textMuted, flexShrink: 0 }} />
          <input
            type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索文件名..."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: SYS.textSub, fontFamily: SYS.fontFamily }}
          />
          {searchText && (
            <button type="button" onClick={() => setSearchText('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: SYS.textMuted, padding: 0 }}>
              <i className="ri-close-line" style={{ fontSize: 13 }} />
            </button>
          )}
        </div>

        {/* Clear filters */}
        {hasFilter && (
          <button type="button" onClick={clearFilters}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 12, background: '#fff', color: '#ef4444', border: `1px solid #fca5a5`, borderRadius: SYS.radiusSM, cursor: 'pointer', fontFamily: SYS.fontFamily }}
          >
            <i className="ri-filter-off-line" style={{ fontSize: 12 }} />清除筛选
          </button>
        )}

        {/* Filter result hint */}
        {hasFilter && (
          <span style={{ fontSize: 11, color: SYS.textMuted, marginLeft: 2 }}>
            共找到 <span style={{ color: SYS.primary, fontWeight: 600 }}>{filtered.length}</span> 个文件
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 11, color: SYS.textMuted, marginRight: 4 }}>排序：</span>
          {([['created_at', '最近生成'], ['name', '文件名'], ['size', '大小']] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setSortKey(key)}
              style={{ padding: '3px 8px', borderRadius: SYS.radiusSM, fontSize: 12, border: 'none', cursor: 'pointer', background: sortKey === key ? SYS.primaryBg : 'transparent', color: sortKey === key ? SYS.primary : SYS.textSub, fontWeight: sortKey === key ? 600 : 400, fontFamily: SYS.fontFamily }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Action bar ── */}
      {(selectedIds.length > 0) && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 20px', background: SYS.primaryBg, borderBottom: `1px solid #c7d2fe` }}>
          <span style={{ fontSize: 12, color: SYS.primary, fontWeight: 500 }}>已选 {selectedIds.length} 个</span>
          <button type="button" onClick={() => void handleBatchDelete()}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', fontSize: 12, background: '#fef2f2', color: '#ef4444', border: `1px solid #fca5a5`, borderRadius: SYS.radiusSM, cursor: 'pointer' }}
          >
            <i className="ri-delete-bin-line" />批量删除
          </button>
          <button type="button" onClick={() => setSelectedIds([])}
            style={{ padding: '3px 10px', fontSize: 12, background: 'transparent', color: SYS.textSub, border: 'none', cursor: 'pointer' }}
          >
            取消选择
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={() => void load()} title="刷新"
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: SYS.radiusSM, border: `1px solid ${SYS.borderBase}`, background: SYS.bgCard, color: SYS.textMuted, cursor: 'pointer' }}
          >
            <i className="ri-refresh-line" style={{ fontSize: 13 }} />
          </button>
        </div>
      )}

      {/* ── List header (list mode) ── */}
      {viewMode === 'list' && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px', background: '#f8fafc', borderBottom: `1px solid ${SYS.borderLight}` }}>
          <button
            type="button"
            onClick={() => allSelected ? setSelectedIds([]) : setSelectedIds(filtered.map((i) => i.id))}
            style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${allSelected ? SYS.primary : '#cbd5e1'}`, background: allSelected ? SYS.primary : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {allSelected && <i className="ri-check-line" style={{ fontSize: 10, color: '#fff' }} />}
          </button>
          <div style={{ width: 40 }} />
          <span style={{ flex: 1, fontSize: 11, color: SYS.textMuted, fontWeight: 500 }}>文件名</span>
          <span style={{ fontSize: 11, color: SYS.textMuted, width: 72, textAlign: 'right' }}>大小</span>
          <span style={{ fontSize: 11, color: SYS.textMuted, width: 128, textAlign: 'right' }}>生成时间</span>
          <div style={{ width: 68 }} />
        </div>
      )}

      {/* ── Content ── */}
      <div className="migrated-scroll" style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <Spin tip="加载中..." />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 256, gap: 12, color: SYS.textMuted }}>
            <i className={hasFilter ? 'ri-filter-off-line' : 'ri-robot-line'} style={{ fontSize: 48 }} />
            <p style={{ fontSize: 13, margin: 0 }}>{hasFilter ? '没有符合筛选条件的文件' : '暂无平台产出物'}</p>
            {!hasFilter && <p style={{ fontSize: 11, color: '#cbd5e1', margin: 0 }}>Agent 发送文件给您后，会自动出现在这里</p>}
            {hasFilter && (
              <button type="button" onClick={clearFilters}
                style={{ padding: '5px 14px', fontSize: 12, background: SYS.primaryBg, color: SYS.primary, border: `1px solid #c7d2fe`, borderRadius: SYS.radiusSM, cursor: 'pointer' }}
              >
                清除筛选
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {filtered.map((item) => (
              <OutputCard key={item.id} item={item} viewMode="grid"
                selected={selectedIds.includes(item.id)}
                onSelect={toggleSelect} onPreview={setPreviewItem} onDownload={handleDownload} onAddToTask={handleAddToTask}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtered.map((item) => (
              <OutputCard key={item.id} item={item} viewMode="list"
                selected={selectedIds.includes(item.id)}
                onSelect={toggleSelect} onPreview={setPreviewItem} onDownload={handleDownload} onAddToTask={handleAddToTask}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px', background: SYS.bgCard, borderTop: `1px solid ${SYS.borderBase}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: SYS.textMuted }}>
            {hasFilter
              ? <>已过滤 <span style={{ color: SYS.primary, fontWeight: 600 }}>{filtered.length}</span> / 共 {total} 个</>
              : <>共 {total} 个产出物</>
            }
          </span>
          {!loading && !hasFilter && (
            <button type="button" onClick={() => void load()}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, background: 'none', border: 'none', color: SYS.textMuted, cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = SYS.primary; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = SYS.textMuted; }}
            >
              <i className="ri-refresh-line" style={{ fontSize: 11 }} />刷新
            </button>
          )}
        </div>
        <span style={{ fontSize: 11, color: SYS.textMuted }}>
          {hasFilter ? `过滤结果 ${formatFileSize(filteredBytes)}` : `总大小 ${formatFileSize(totalBytes)}`}
        </span>
      </div>

      {previewItem && (
        <FilePreviewModal
          file={outputToMaterialFile(previewItem)}
          onClose={() => setPreviewItem(null)}
          onDownload={handlePreviewDownload}
        />
      )}
    </div>
  );
}
