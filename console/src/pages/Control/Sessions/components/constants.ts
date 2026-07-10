import type { ChatSpec } from "../../../../api/types";

export interface Session extends ChatSpec {
  name?: string;
}

export const formatTime = (timestamp: string | number | null): string => {
  if (timestamp === null || timestamp === undefined) return "N/A";
  const date = new Date(timestamp);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};
