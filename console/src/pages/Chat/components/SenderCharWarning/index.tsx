import { useEffect, useRef, useState } from "react";

const WARN_RATIO = 0.9; // show warning at 90% of limit

interface Props {
  maxLength: number;
}

/**
 * Inline character-count warning rendered inside the chat sender (via beforeUI).
 * Mirrors the same parentElement / input-event wiring used by SenderTypingWaveform.
 *
 * Hidden below 90% of maxLength; turns yellow at ≥ 90%; red at the limit.
 */
export default function SenderCharWarning({ maxLength }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const wrapper = rootRef.current?.parentElement;
    if (!wrapper) return;

    const update = () => {
      const ta = wrapper.querySelector<HTMLTextAreaElement>("textarea");
      setCount(ta?.value?.length ?? 0);
    };

    wrapper.addEventListener("input", update, true);
    update();

    return () => {
      wrapper.removeEventListener("input", update, true);
    };
  }, []);

  const warnThreshold = Math.floor(maxLength * WARN_RATIO);
  const isAtLimit = count >= maxLength;
  const isWarning = count >= warnThreshold;

  if (!isWarning) return <div ref={rootRef} style={{ display: "none" }} />;

  const remaining = maxLength - count;

  return (
    <div
      ref={rootRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px 2px",
        fontSize: 12,
        lineHeight: "18px",
        borderRadius: 6,
        marginBottom: 4,
        background: isAtLimit
          ? "rgba(239,68,68,0.08)"
          : "rgba(245,158,11,0.08)",
        border: `1px solid ${isAtLimit ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)"}`,
        color: isAtLimit ? "#ef4444" : "#d97706",
        userSelect: "none",
      }}
    >
      <span style={{ fontWeight: 600 }}>
        {count.toLocaleString()} / {maxLength.toLocaleString()}
      </span>
      {isAtLimit ? (
        <span>已达字数上限，请删减后再发送</span>
      ) : (
        <span>还可输入 {remaining.toLocaleString()} 字</span>
      )}
    </div>
  );
}
