import { useEffect, useState } from "react";
import { getNewsCoverCandidates } from "@/api/modules/newsRss";

type NewsCoverImageProps = {
  url: string;
  alt: string;
  style?: React.CSSProperties;
  className?: string;
  onLoaded?: () => void;
  /** 直连与代理均失败时展示 */
  fallback?: React.ReactNode;
};

/** 新闻封面：先直连（no-referrer），失败再走 weserv 代理 */
export default function NewsCoverImage({
  url,
  alt,
  style,
  className,
  onLoaded,
  fallback = null,
}: NewsCoverImageProps) {
  const candidates = getNewsCoverCandidates(url);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [url]);

  if (!candidates.length || idx >= candidates.length) return <>{fallback}</>;

  return (
    <img
      src={candidates[idx]}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      className={className}
      style={style}
      onLoad={onLoaded}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
