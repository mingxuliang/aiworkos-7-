import { useState, useRef } from 'react';
import type { BusinessCategory } from '@/mocks/materialCenter';

interface Props {
  onClose: () => void;
  onUpload: (files: File[], category: string, tags: string, bizCategoryId?: string) => void | Promise<void>;
  businessCategories?: BusinessCategory[];
}

const SYS = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  bgCard: '#ffffff',
  borderBase: '#e2e8f0',
  primary: '#3b82f6',
  primaryBg: '#eff6ff',
  primaryHover: '#dbeafe',
  textMain: '#0f172a',
  textSub: '#64748b',
  textMuted: '#94a3b8',
  radius: 10,
  radiusLG: 12,
  radiusSM: 8,
};

const uploadCategories = [
  { id: 'upload-doc',   label: '文档资料', icon: 'ri-file-text-line' },
  { id: 'upload-video', label: '视频素材', icon: 'ri-video-line' },
  { id: 'upload-image', label: '图片素材', icon: 'ri-image-2-line' },
  { id: 'upload-audio', label: '音频素材', icon: 'ri-music-2-line' },
];

const UploadModal = ({ onClose, onUpload, businessCategories = [] }: Props) => {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [category, setCategory] = useState('upload-doc');
  const [bizCategoryId, setBizCategoryId] = useState('');
  const [tags, setTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    setSelectedFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setSelectedFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
  };

  const handleUpload = async () => {
    if (!selectedFiles.length) return;
    setUploading(true);
    try {
      await onUpload(selectedFiles, category, tags, bizCategoryId || undefined);
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '上传失败';
      alert(msg);
    } finally {
      setUploading(false);
    }
  };

  const fmt = (bytes: number) =>
    bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15,23,42,0.45)',
        backdropFilter: 'blur(6px)',
        fontFamily: SYS.fontFamily,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: SYS.bgCard,
          borderRadius: SYS.radiusLG,
          width: 560,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(15,23,42,0.18)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: `1px solid ${SYS.borderBase}` }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: SYS.textMain, margin: 0 }}>上传素材</h3>
            <p style={{ fontSize: 11, color: SYS.textMuted, marginTop: 3, marginBottom: 0 }}>支持 PPT、Word、PDF、MP4、MP3、图片等格式</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: SYS.radiusSM, border: 'none', background: 'transparent', color: SYS.textMuted, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = SYS.textSub; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = SYS.textMuted; }}
          >
            <i className="ri-close-line" style={{ fontSize: 18 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? SYS.primary : SYS.borderBase}`,
              borderRadius: SYS.radius,
              padding: '32px 24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              cursor: 'pointer',
              background: dragOver ? SYS.primaryBg : '#f8fafc',
              transition: 'all 0.18s',
            }}
            onMouseEnter={(e) => { if (!dragOver) { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.background = SYS.primaryBg; } }}
            onMouseLeave={(e) => { if (!dragOver) { e.currentTarget.style.borderColor = SYS.borderBase; e.currentTarget.style.background = '#f8fafc'; } }}
          >
            <div style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: SYS.primaryBg, borderRadius: SYS.radius }}>
              <i className="ri-upload-cloud-2-line" style={{ fontSize: 22, color: SYS.primary }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: SYS.textSub, margin: 0 }}>拖拽文件到此处，或点击选择文件</p>
              <p style={{ fontSize: 11, color: SYS.textMuted, marginTop: 4, marginBottom: 0 }}>单个文件最大 500MB，可同时上传多个</p>
            </div>
            <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileInput} />
          </div>

          {/* Selected files */}
          {selectedFiles.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: SYS.textSub, margin: '0 0 8px' }}>已选 {selectedFiles.length} 个文件</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                {selectedFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', borderRadius: SYS.radiusSM, padding: '6px 10px', border: `1px solid ${SYS.borderBase}` }}>
                    <i className="ri-file-line" style={{ color: SYS.textMuted, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: SYS.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ fontSize: 10, color: SYS.textMuted, flexShrink: 0 }}>{fmt(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: SYS.textMuted, cursor: 'pointer', borderRadius: 4, padding: 0, flexShrink: 0 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = SYS.textMuted; }}
                    >
                      <i className="ri-close-line" style={{ fontSize: 13 }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload category */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: SYS.textSub, margin: '0 0 8px' }}>上传分类</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {uploadCategories.map((cat) => {
                const isActive = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                      borderRadius: SYS.radiusSM, border: `1px solid ${isActive ? '#bfdbfe' : SYS.borderBase}`,
                      background: isActive ? SYS.primaryBg : SYS.bgCard,
                      color: isActive ? SYS.primary : SYS.textSub,
                      fontFamily: SYS.fontFamily, fontSize: 12, fontWeight: isActive ? 600 : 400,
                      cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.borderColor = '#bfdbfe'; e.currentTarget.style.background = SYS.primaryBg; } }}
                    onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.borderColor = SYS.borderBase; e.currentTarget.style.background = SYS.bgCard; } }}
                  >
                    <i className={isActive ? 'ri-radio-button-fill' : 'ri-radio-button-line'} style={{ fontSize: 15, color: isActive ? SYS.primary : '#cbd5e1', flexShrink: 0 }} />
                    <i className={cat.icon} style={{ fontSize: 14, color: isActive ? SYS.primary : SYS.textMuted, flexShrink: 0 }} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Business category */}
          {businessCategories.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: SYS.textSub, margin: '0 0 8px' }}>业务分类（可选）</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[{ id: '', label: '不归类', icon: '' }, ...businessCategories].map((biz) => {
                  const isActive = bizCategoryId === biz.id;
                  return (
                    <button
                      key={biz.id}
                      type="button"
                      onClick={() => setBizCategoryId(biz.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 12px', borderRadius: SYS.radiusSM,
                        border: `1px solid ${isActive ? '#bfdbfe' : SYS.borderBase}`,
                        background: isActive ? SYS.primaryBg : SYS.bgCard,
                        color: isActive ? SYS.primary : SYS.textSub,
                        fontFamily: SYS.fontFamily, fontSize: 12, fontWeight: isActive ? 600 : 400,
                        cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}
                    >
                      {biz.icon && <i className={biz.icon} style={{ fontSize: 12 }} />}
                      {biz.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tags */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: SYS.textSub, margin: '0 0 6px' }}>标签（可选）</p>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="用逗号分隔多个标签，如：培训,绩效,模板"
              style={{
                width: '100%', border: `1px solid ${SYS.borderBase}`, borderRadius: SYS.radiusSM,
                padding: '8px 12px', fontSize: 12, color: SYS.textSub, fontFamily: SYS.fontFamily,
                background: '#f8fafc', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
              }}
              onFocus={(e) => { e.target.style.borderColor = '#93c5fd'; e.target.style.background = SYS.bgCard; }}
              onBlur={(e) => { e.target.style.borderColor = SYS.borderBase; e.target.style.background = '#f8fafc'; }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '14px 24px', borderTop: `1px solid ${SYS.borderBase}`, background: '#fafcff' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '7px 16px', fontSize: 13, color: SYS.textSub, background: '#f1f5f9', border: 'none', borderRadius: SYS.radiusSM, cursor: 'pointer', fontFamily: SYS.fontFamily, transition: 'background 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = SYS.borderBase; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFiles.length || uploading || done}
            style={{
              padding: '7px 20px', fontSize: 13, fontWeight: 600, borderRadius: SYS.radiusSM, border: 'none',
              cursor: !selectedFiles.length || uploading || done ? 'not-allowed' : 'pointer',
              fontFamily: SYS.fontFamily, display: 'flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s', whiteSpace: 'nowrap',
              background: done ? '#22c55e' : !selectedFiles.length ? '#e2e8f0' : SYS.primary,
              color: !selectedFiles.length ? SYS.textMuted : '#fff',
              opacity: uploading ? 0.85 : 1,
            }}
          >
            {done ? (
              <><i className="ri-check-line" />上传成功</>
            ) : uploading ? (
              <><i className="ri-loader-4-line" style={{ animation: 'spin 1s linear infinite' }} />上传中...</>
            ) : (
              <><i className="ri-upload-line" />开始上传</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
