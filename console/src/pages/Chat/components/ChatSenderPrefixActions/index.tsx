import type { ReactNode } from "react";
import styles from "./index.module.less";

interface ChatSenderPrefixActionsProps {
  whisper?: ReactNode;
  environmentSelector: ReactNode;
  runModeSelector?: ReactNode;
}

export default function ChatSenderPrefixActions({
  whisper,
  environmentSelector,
  runModeSelector,
}: ChatSenderPrefixActionsProps) {
  return (
    <div className={styles.prefixRow}>
      {runModeSelector}
      {whisper}
      {environmentSelector}
    </div>
  );
}
