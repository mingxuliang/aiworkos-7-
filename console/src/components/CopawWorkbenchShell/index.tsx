import type { ReactNode } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import styles from "./index.module.less";
import "./copawBenchCards.less";

type CopawWorkbenchShellProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Page wrapper: background + grid + subtle orbs (agent团队项目 workbench look).
 * Does not replace app shell — only the main content column.
 */
export function CopawWorkbenchShell({
  children,
  className,
}: CopawWorkbenchShellProps) {
  const { isDark } = useTheme();

  return (
    <div
      className={[
        styles.shell,
        "copaw-bench-visual-scope",
        isDark ? "dark-bench" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.orb1} aria-hidden />
      <div className={styles.orb2} aria-hidden />
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
