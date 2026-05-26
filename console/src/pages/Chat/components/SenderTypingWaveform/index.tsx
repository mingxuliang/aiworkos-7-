import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./index.module.less";

/**
 * Decorative bar waveform (from ai助手 TypingWaveform). Activated when textarea
 * focused / non-empty / speech recording (svg title "Speech Recording").
 *
 * Animation runs via module LESS keyframes (`senderWaveFlow`) so hashed names align;
 * bars use scaleY (not %) so motion actually plays in flex layouts.
 */
export default function SenderTypingWaveform() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  const bars = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        delay: i * 0.035,
      })),
    [],
  );

  useEffect(() => {
    const root = rootRef.current;
    const wrapper = root?.parentElement;
    if (!wrapper) return;

    const probe = () => {
      const ta = wrapper.querySelector<HTMLTextAreaElement>("textarea");
      const focused = ta != null && document.activeElement === ta;
      const hasText = !!ta?.value?.trim();
      const recording = Array.from(wrapper.querySelectorAll("svg title")).some(
        (el) => el.textContent?.trim() === "Speech Recording",
      );
      setActive(focused || hasText || recording);
    };

    const mo = new MutationObserver(probe);
    mo.observe(wrapper, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    wrapper.addEventListener("focusin", probe);
    wrapper.addEventListener("focusout", probe);
    wrapper.addEventListener("input", probe, true);
    probe();

    return () => {
      mo.disconnect();
      wrapper.removeEventListener("focusin", probe);
      wrapper.removeEventListener("focusout", probe);
      wrapper.removeEventListener("input", probe, true);
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.waveformWrap} aria-hidden>
      {bars.map((bar) => (
        <div
          key={bar.id}
          className={`${styles.bar} ${
            active ? styles.barActive : styles.barInactive
          }`}
          style={
            {
              "--wave-delay": `${bar.delay}s`,
              background: active
                ? "linear-gradient(180deg, #3b82f6, #06b6d4)"
                : "linear-gradient(180deg, rgba(59,130,246,0.15), rgba(6,182,212,0.15))",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
