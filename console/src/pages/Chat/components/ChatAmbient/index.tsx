import Grainient from "../websiteVisual/Grainient";
import styles from "./index.module.less";

export default function ChatAmbient({ isDark }: { isDark: boolean }) {
  return (
    <div className={styles.root} aria-hidden>
      <Grainient
        className={styles.canvas}
        color1={isDark ? "#581c87" : "#fce7f3"}
        color2={isDark ? "#3730a3" : "#4f46e5"}
        color3={isDark ? "#1e3a8a" : "#ddd6fe"}
        timeSpeed={isDark ? 0.24 : 0.2}
        noiseScale={1.35}
        zoom={1.05}
        grainAnimated
        grainAmount={isDark ? 0.06 : 0.09}
        contrast={isDark ? 1.55 : 1.45}
        saturation={1.1}
      />
      <div className={styles.veil} />
    </div>
  );
}
