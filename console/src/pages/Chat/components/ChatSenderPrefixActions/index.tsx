import type { ReactNode } from "react";
import styles from "./index.module.less";

interface ChatSenderPrefixActionsProps {
  whisper?: ReactNode;
  environmentSelector: ReactNode;
}

export default function ChatSenderPrefixActions({
  whisper,
  environmentSelector,
}: ChatSenderPrefixActionsProps) {
  return (
    <div className={styles.prefixRow}>
      {whisper}
      {environmentSelector}
    </div>
  );
}
