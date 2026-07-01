import { useEffect, useRef, useState } from 'react';
import { Spin } from 'antd';
import { renderAsync } from 'docx-preview';
import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from '@aiden0z/pptx-renderer';
import { filesApi } from '@/api/modules/files';
import { buildAuthHeaders } from '@/api/authHeaders';
import { getApiToken, getApiUrl } from '@/api/config';
import type { MaterialFile, FileType } from '@/mocks/materialCenter';

interface Props {
  file: MaterialFile;
  onClose: () => void;
  onDownload?: (file: MaterialFile) => void | Promise<void>;
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
  radiusLG: 12,
  radiusSM: 8,
};

const typeConfig: Record<FileType, { icon: string; iconColor: string; bg: string; label: string }> = {
  ppt:   { icon: 'ri-slideshow-2-line',  iconColor: '#f97316', bg: '#fff7ed', label: 'PPT' },
  word:  { icon: 'ri-file-word-line',    iconColor: '#3b82f6', bg: '#eff6ff', label: 'Word' },
  pdf:   { icon: 'ri-file-pdf-2-line',   iconColor: '#ef4444', bg: '#fef2f2', label: 'PDF' },
  video: { icon: 'ri-video-line',        iconColor: '#8b5cf6', bg: '#f5f3ff', label: '视频' },
  image: { icon: 'ri-image-2-line',      iconColor: '#22c55e', bg: '#f0fdf4', label: '图片' },
  audio: { icon: 'ri-music-2-line',      iconColor: '#ec4899', bg: '#fdf2f8', label: '音频' },
  excel: { icon: 'ri-file-excel-2-line', iconColor: '#10b981', bg: '#ecfdf5', label: 'Excel' },
};

const PREVIEWABLE: FileType[] = ['ppt', 'word', 'pdf', 'image', 'video', 'audio'];

/** 预览弹窗尺寸 */
const MODAL = {
  width: 'min(1120px, 94vw)',
  maxHeight: '94vh',
  /** 内容区高度（扣除顶栏 + 底栏） */
  bodyHeight: 'calc(94vh - 148px)',
  bodyMinHeight: 520,
};

function isDocxFile(name: string): boolean {
  return name.toLowerCase().endsWith('.docx');
}

function isPptxFile(name: string): boolean {
  return name.toLowerCase().endsWith('.pptx');
}

function getDownloadUrl(file: MaterialFile): string {
  const apiPath = file.downloadUrl ?? `/api/files/${file.id}/download`;
  const url = apiPath.startsWith('http') ? apiPath : getApiUrl(apiPath.replace(/^\/api/, ''));
  const token = getApiToken();
  if (!token) return url;

  try {
    const u = new URL(url, window.location.origin);
    if (!u.searchParams.has('token')) {
      u.searchParams.set('token', token);
    }
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  }
}

async function fetchPreviewBlob(file: MaterialFile): Promise<Blob> {
  if (!file.downloadUrl) {
    const fileId = Number(file.id);
    if (!Number.isFinite(fileId)) throw new Error('无效的文件 ID');
    return filesApi.fetchFileBlob(fileId);
  }

  const res = await fetch(getDownloadUrl(file), { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(`预览加载失败 (${res.status})`);
  return res.blob();
}

const FilePreviewModal = ({ file, onClose, onDownload }: Props) => {
  const tc = typeConfig[file.type];
  const docxRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [wordReady, setWordReady] = useState(false);

  const canPreviewFromApi =
    !file.thumbnail &&
    file.type !== 'ppt' &&
    PREVIEWABLE.includes(file.type) &&
    (file.type !== 'word' || isDocxFile(file.name));

  useEffect(() => {
    if (file.thumbnail || !canPreviewFromApi) return undefined;

    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      setWordReady(false);
      setBlobUrl(null);

      try {
        const blob = await fetchPreviewBlob(file);
        if (cancelled) return;

        if (file.type === 'word') {
          // 等待 DOM 挂载预览容器
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const body = docxRef.current;
          const style = styleRef.current;
          if (!body || !style) throw new Error('预览容器未就绪');
          body.innerHTML = '';
          style.innerHTML = '';
          await renderAsync(blob, body, style, {
            inWrapper: true,
            ignoreWidth: false,
            breakPages: true,
            className: 'docx-preview-material',
          });
          if (!cancelled) setWordReady(true);
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setBlobUrl(objectUrl);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '预览加载失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Word 需先挂载容器再拉取渲染
    if (file.type === 'word') {
      requestAnimationFrame(() => { void load(); });
    } else {
      void load();
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (docxRef.current) docxRef.current.innerHTML = '';
      if (styleRef.current) styleRef.current.innerHTML = '';
    };
  }, [file.id, file.name, file.type, file.thumbnail, canPreviewFromApi]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const renderPreviewBody = () => {
    if (file.thumbnail) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <img
            src={file.thumbnail}
            alt={file.name}
            style={{ maxWidth: '100%', maxHeight: MODAL.bodyHeight, objectFit: 'contain', borderRadius: SYS.radius, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
          />
        </div>
      );
    }

    if (file.type === 'word' && !isDocxFile(file.name)) {
      return (
        <UnsupportedPreview
          tc={tc}
          message="仅支持 .docx 格式在线预览，.doc 请下载后查看"
          onDownload={() => void onDownload?.(file)}
        />
      );
    }

    if (file.type === 'ppt') {
      if (!isPptxFile(file.name)) {
        return (
          <UnsupportedPreview
            tc={tc}
            message="仅支持 .pptx 格式在线预览，.ppt 请下载后查看"
            onDownload={() => void onDownload?.(file)}
          />
        );
      }
      if (loading) {
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: MODAL.bodyHeight, minHeight: MODAL.bodyMinHeight }}>
            <Spin tip="加载 PPT 预览..." />
          </div>
        );
      }
      if (error) {
        return (
          <UnsupportedPreview tc={tc} message={error} onDownload={() => void onDownload?.(file)} />
        );
      }
      return (
        <PptPreview
          file={file}
          tc={tc}
          onDownload={() => void onDownload?.(file)}
        />
      );
    }

    if (!PREVIEWABLE.includes(file.type)) {
      return (
        <UnsupportedPreview
          tc={tc}
          message="暂不支持在线预览，请下载后查看"
          onDownload={() => void onDownload?.(file)}
        />
      );
    }

    if (file.type === 'word' && canPreviewFromApi) {
      return (
        <div style={{ position: 'relative', minHeight: MODAL.bodyMinHeight, height: MODAL.bodyHeight, background: '#fff' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, background: 'rgba(255,255,255,0.8)' }}>
              <Spin tip="加载预览..." />
            </div>
          )}
          {error && !loading ? (
            <UnsupportedPreview tc={tc} message={error} onDownload={() => void onDownload?.(file)} />
          ) : (
            <div
              className="migrated-scroll"
              style={{ padding: '20px 28px', visibility: wordReady ? 'visible' : 'hidden', minHeight: MODAL.bodyMinHeight, height: '100%', overflow: 'auto' }}
            >
              <div ref={styleRef} />
              <div ref={docxRef} />
            </div>
          )}
        </div>
      );
    }

    if (loading) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: MODAL.bodyHeight, minHeight: MODAL.bodyMinHeight }}>
          <Spin tip="加载预览..." />
        </div>
      );
    }

    if (error) {
      return (
        <UnsupportedPreview tc={tc} message={error} onDownload={() => void onDownload?.(file)} />
      );
    }

    if (blobUrl) {
      if (file.type === 'pdf') {
        return (
          <iframe
            src={blobUrl}
            title={file.name}
            style={{ width: '100%', height: MODAL.bodyHeight, minHeight: MODAL.bodyMinHeight, border: 'none', background: '#fff' }}
          />
        );
      }
      if (file.type === 'image') {
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <img
              src={blobUrl}
              alt={file.name}
              style={{ maxWidth: '100%', maxHeight: MODAL.bodyHeight, objectFit: 'contain', borderRadius: SYS.radius }}
            />
          </div>
        );
      }
      if (file.type === 'video') {
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#000' }}>
            <video src={blobUrl} controls style={{ maxWidth: '100%', maxHeight: MODAL.bodyHeight }} />
          </div>
        );
      }
      if (file.type === 'audio') {
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, padding: 24 }}>
            <audio src={blobUrl} controls style={{ width: '100%' }} />
          </div>
        );
      }
    }

    return (
      <UnsupportedPreview
        tc={tc}
        message="暂不支持在线预览，请下载后查看"
        onDownload={() => void onDownload?.(file)}
      />
    );
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15,23,42,0.5)',
        backdropFilter: 'blur(6px)',
        fontFamily: SYS.fontFamily,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: SYS.bgCard, borderRadius: SYS.radiusLG,
          width: MODAL.width, maxHeight: MODAL.maxHeight, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(15,23,42,0.20)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${SYS.borderBase}` }}>
          <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: SYS.radiusSM, background: tc.bg, flexShrink: 0 }}>
            <i className={tc.icon} style={{ fontSize: 18, color: tc.iconColor }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: SYS.textMain, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.name}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 500, background: tc.bg, color: tc.iconColor }}>{tc.label}</span>
              <span style={{ fontSize: 11, color: SYS.textMuted }}>{file.size}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => void onDownload?.(file)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: SYS.primaryBg, color: SYS.primary, border: 'none', borderRadius: SYS.radiusSM, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: SYS.fontFamily, whiteSpace: 'nowrap' }}
            >
              <i className="ri-download-line" style={{ fontSize: 14 }} />下载
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: SYS.radiusSM, border: 'none', background: 'transparent', color: SYS.textMuted, cursor: 'pointer' }}
            >
              <i className="ri-close-line" style={{ fontSize: 18 }} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#f8fafc' }}>
          {renderPreviewBody()}
        </div>

        <div style={{ padding: '14px 20px', borderTop: `1px solid ${SYS.borderBase}`, background: SYS.bgCard }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {[
              { label: '来源', value: file.source === 'platform' ? `平台生成 · ${file.courseName ?? ''}` : '手动上传' },
              { label: '创建时间', value: file.createdAt },
            ].map(({ label, value }) => (
              <div key={label}>
                <p style={{ fontSize: 10, color: SYS.textMuted, margin: '0 0 3px' }}>{label}</p>
                <p style={{ fontSize: 12, fontWeight: 500, color: SYS.textSub, margin: 0 }}>{value}</p>
              </div>
            ))}
            <div>
              <p style={{ fontSize: 10, color: SYS.textMuted, margin: '0 0 4px' }}>标签</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {file.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{ padding: '2px 6px', background: SYS.primaryBg, color: SYS.primary, borderRadius: 4, fontSize: 10, fontWeight: 500 }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function UnsupportedPreview({
  tc,
  message,
  onDownload,
}: {
  tc: { icon: string; iconColor: string; bg: string };
  message: string;
  onDownload: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: MODAL.bodyHeight, minHeight: MODAL.bodyMinHeight, gap: 14, background: tc.bg }}>
      <i className={tc.icon} style={{ fontSize: 56, color: tc.iconColor }} />
      <p style={{ fontSize: 13, color: SYS.textSub, margin: 0, textAlign: 'center', padding: '0 24px' }}>{message}</p>
      <button
        type="button"
        onClick={onDownload}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', background: SYS.primary, color: '#fff', border: 'none', borderRadius: SYS.radiusSM, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: SYS.fontFamily }}
      >
        <i className="ri-download-line" />下载文件
      </button>
    </div>
  );
}

function PptPreview({
  file,
  tc,
  onDownload,
}: {
  file: MaterialFile;
  tc: { icon: string; iconColor: string; bg: string };
  onDownload: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PptxViewer | null>(null);
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const abortController = new AbortController();
    let cancelled = false;
    container.innerHTML = '';
    setRendering(true);
    setRenderError(null);

    const load = async () => {
      try {
        const blob = await fetchPreviewBlob(file);
        if (cancelled) return;
        const buffer = await blob.arrayBuffer();
        if (cancelled) return;

        const viewer = await PptxViewer.open(buffer, container, {
          zipLimits: RECOMMENDED_ZIP_LIMITS,
          fitMode: 'contain',
          lazyMedia: true,
          lazySlides: true,
          scrollContainer: container,
          renderMode: 'list',
          listOptions: {
            windowed: true,
            initialSlides: 4,
            batchSize: 4,
            showSlideLabels: true,
          },
          signal: abortController.signal,
          onRenderComplete: () => {
            if (!cancelled) setRendering(false);
          },
          onSlideError: (_index, error) => {
            // Keep rendering the rest of the deck; surface a concise hint.
            console.warn('PPTX slide render failed', error);
          },
        });

        if (cancelled) {
          viewer.destroy();
          return;
        }
        viewerRef.current = viewer;
        setRendering(false);
      } catch (e) {
        if (cancelled || abortController.signal.aborted) return;
        setRenderError(e instanceof Error ? e.message : 'PPTX 预览渲染失败');
        setRendering(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      abortController.abort();
      viewerRef.current?.destroy();
      viewerRef.current = null;
      container.innerHTML = '';
    };
  }, [file]);

  if (renderError) {
    return (
      <UnsupportedPreview
        tc={tc}
        message={renderError}
        onDownload={onDownload}
      />
    );
  }

  return (
    <div style={{ position: 'relative', height: MODAL.bodyHeight, minHeight: MODAL.bodyMinHeight, background: '#f8fafc' }}>
      {rendering && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(248,250,252,0.82)' }}>
          <Spin tip="加载 PPTX 预览..." />
        </div>
      )}
      <div
        ref={containerRef}
        className="migrated-scroll"
        style={{
          height: '100%',
          overflow: 'auto',
          padding: 24,
          background: '#f8fafc',
        }}
      />
      <div
        style={{
          position: 'sticky',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 18,
          padding: '8px 10px',
          borderRadius: SYS.radiusSM,
          background: 'rgba(255,255,255,0.94)',
          border: `1px solid ${SYS.borderBase}`,
          boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: SYS.textSub }}>
          <i className={tc.icon} style={{ fontSize: 14, color: tc.iconColor }} />
          当前使用本地 PPTX 渲染器预览，复杂动画效果请下载后查看
        </span>
        <button
          type="button"
          onClick={onDownload}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: tc.bg, color: tc.iconColor, border: 'none', borderRadius: SYS.radiusSM, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SYS.fontFamily, whiteSpace: 'nowrap' }}
        >
          <i className="ri-download-line" />下载
        </button>
      </div>
    </div>
  );
}

export default FilePreviewModal;
