import { useState, useRef, useEffect, useCallback } from 'react';
import { orgData as defaultOrgData, collectConnections, type OrgNode } from './orgData';
import NodeCard from './NodeCard';
import NodeModal from './NodeModal';

interface OrgChartProps {
  data?: OrgNode;
}

/** CSS Tree 递归节点 */
function TreeNode({
  node,
  activeId,
  onHover,
  onLeave,
  onClick,
  setNodeRef,
}: {
  node: OrgNode;
  activeId?: string;
  onHover: (n: OrgNode) => void;
  onLeave: () => void;
  onClick: (n: OrgNode) => void;
  setNodeRef: (id: string) => (el: HTMLDivElement | null) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;

  return (
    <li>
      <NodeCard
        node={node}
        isActive={activeId === node.id}
        onHover={onHover}
        onLeave={onLeave}
        onClick={onClick}
        innerRef={setNodeRef(node.id)}
      />
      {hasChildren && (
        <ul>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              activeId={activeId}
              onHover={onHover}
              onLeave={onLeave}
              onClick={onClick}
              setNodeRef={setNodeRef}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** SVG 流动粒子连线 */
function SVGParticles({ paths, svgSize }: {
  paths: Array<{ id: string; d: string; level: 'high' | 'medium' | 'low' }>;
  svgSize: { w: number; h: number };
}) {
  const getParticleConfig = (level: 'high' | 'medium' | 'low') => {
    if (level === 'high')
      return { count: 3, dur: '1.8s', color: '#3B82F6', r: 3, speed: 1 };
    if (level === 'medium')
      return { count: 2, dur: '2.8s', color: '#38BDF8', r: 2.5, speed: 2 };
    return { count: 1, dur: '4s', color: '#94A3B8', r: 2, speed: 3 };
  };

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none z-0"
      width={svgSize.w}
      height={svgSize.h}
      viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
    >
      <defs>
        <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-sky" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {paths.map((path) => {
        const config = getParticleConfig(path.level);
        return (
          <g key={path.id}>
            <path
              d={path.d}
              fill="none"
              stroke={config.color}
              strokeWidth={path.level === 'high' ? 1.5 : 1}
              strokeOpacity={0.2}
              strokeDasharray={path.level === 'high' ? '6 4' : '4 4'}
              className={path.level === 'high' ? 'animate-flow-dash' : ''}
            />
            {Array.from({ length: config.count }).map((_, pi) => {
              const delay = (
                pi *
                (parseFloat(config.dur.replace('s', '')) / config.count)
              ).toFixed(1);
              return (
                <circle
                  key={pi}
                  r={config.r}
                  fill={config.color}
                  filter={
                    path.level === 'high'
                      ? 'url(#glow-blue)'
                      : path.level === 'medium'
                        ? 'url(#glow-sky)'
                        : undefined
                  }
                  opacity={0.85}
                >
                  <animateMotion
                    dur={config.dur}
                    repeatCount="indefinite"
                    begin={`${delay}s`}
                    path={path.d}
                  />
                </circle>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

export default function OrgChart({ data = defaultOrgData }: OrgChartProps) {
  const [, setHoveredNode] = useState<OrgNode | null>(null);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [modalNode, setModalNode] = useState<OrgNode | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });
  const [paths, setPaths] = useState<
    Array<{
      id: string;
      d: string;
      level: 'high' | 'medium' | 'low';
    }>
  >([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const allConnections = collectConnections(data);

  const setNodeRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) nodeRefs.current.set(id, el);
    },
    []
  );

  const updatePaths = useCallback(() => {
    if (!containerRef.current || !treeRef.current) return;

    const treeEl = treeRef.current;
    const w = treeEl.scrollWidth;
    const h = treeEl.scrollHeight;
    setSvgSize({ w, h });

    const treeRect = treeEl.getBoundingClientRect();

    const newPaths = allConnections
      .map((conn, idx) => {
        const fromEl = nodeRefs.current.get(conn.from);
        const toEl = nodeRefs.current.get(conn.to);
        if (!fromEl || !toEl) return null;

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();

        const x1 = fromRect.left + fromRect.width / 2 - treeRect.left;
        const y1 = fromRect.bottom - treeRect.top;
        const x2 = toRect.left + toRect.width / 2 - treeRect.left;
        const y2 = toRect.top - treeRect.top;

        const midY = (y1 + y2) / 2;
        const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

        return {
          id: `conn-${idx}`,
          d,
          level: conn.level,
        };
      })
      .filter(Boolean) as Array<{
        id: string;
        d: string;
        level: 'high' | 'medium' | 'low';
      }>;

    setPaths(newPaths);
  }, [allConnections]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      updatePaths();
    });
    if (containerRef.current) {
      ro.observe(containerRef.current);
    }
    const timer = setTimeout(updatePaths, 200);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, [updatePaths]);

  useEffect(() => {
    const interval = setInterval(updatePaths, 3000);
    return () => clearInterval(interval);
  }, [updatePaths]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  const handleToggleFullscreen = () => {
    if (!sectionRef.current) return;
    if (!document.fullscreenElement) {
      sectionRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(updatePaths, 100);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [updatePaths]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTimeout(() => setModalNode(null), 300);
  };

  const handleCardClick = (n: OrgNode) => {
    setModalNode(n);
    setIsModalOpen(true);
  };

  return (
    <section
      ref={sectionRef}
      className={`relative overflow-hidden transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-[9999] bg-white p-8 flex flex-col overflow-auto' : ''
      }`}
    >
      {/* 背景装饰光晕 */}
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-50/60 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-sky-50/50 rounded-full blur-3xl pointer-events-none" />

      {/* 图例 + 全屏按钮 */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" /> AI 深度
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> AI 辅助
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> 数字化
          </span>
        </div>
        <button
          type="button"
          onClick={handleToggleFullscreen}
          className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center transition-colors shrink-0"
          title={isFullscreen ? '退出全屏' : '全屏展示'}
        >
          <i className={`${isFullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'} text-slate-500 text-xs`} />
        </button>
      </div>

      <div ref={containerRef} className={`relative ${isFullscreen ? 'flex-1 min-h-0 overflow-auto' : ''}`}>
        {/* SVG 流动层 */}
        <SVGParticles paths={paths} svgSize={svgSize} />

        {/* CSS Tree */}
        <div ref={treeRef} className="relative z-10">
          <style>{`
            .org-tree { text-align: center; }
            .org-tree ul {
              display: flex;
              justify-content: center;
              align-items: flex-start;
              gap: 6px;
              padding-top: 36px;
              position: relative;
              text-align: center;
              margin: 0;
            }
            .org-tree li {
              list-style-type: none;
              text-align: center;
              padding: 0 5px;
              margin: 0;
            }
            .org-tree li:only-child { padding-top: 0; }
          `}</style>

          <div className="org-tree pb-4">
            <ul>
              <TreeNode
                node={data}
                activeId={activeId}
                onHover={(n) => {
                  setHoveredNode(n);
                  setActiveId(n.id);
                }}
                onLeave={() => {
                  setHoveredNode(null);
                  setActiveId(undefined);
                }}
                onClick={handleCardClick}
                setNodeRef={setNodeRef}
              />
            </ul>
          </div>
        </div>
      </div>

      {/* 点击弹窗 */}
      <NodeModal
        node={modalNode}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </section>
  );
}