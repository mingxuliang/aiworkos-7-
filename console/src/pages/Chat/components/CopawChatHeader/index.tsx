import React from "react";
import AgentSelector from "@/components/AgentSelector";
import ChatActionGroup from "../ChatActionGroup";
import ChatSessionInitializer from "../ChatSessionInitializer";
import ModelSelector from "../../ModelSelector";
import styles from "./index.module.less";

interface CopawChatHeaderProps {
  runtimeBridge: React.ReactNode;
  planEnabled?: boolean;
}

const CopawChatHeader: React.FC<CopawChatHeaderProps> = ({
  runtimeBridge,
  planEnabled = false,
}) => {
  return (
    <div className={styles.header}>
      <ChatSessionInitializer />
      {runtimeBridge}
      <div className={styles.spacer} />
      <div className={styles.headerTrailing}>
        <AgentSelector variant="chatToolbar" />
        <ModelSelector />
        <ChatActionGroup planEnabled={planEnabled} />
      </div>
    </div>
  );
};

export default CopawChatHeader;
