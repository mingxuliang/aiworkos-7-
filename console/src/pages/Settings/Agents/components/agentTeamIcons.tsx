import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Bot,
  Code,
  Database,
  FileText,
  Globe,
  Headphones,
  Lightbulb,
  LineChart,
  Mountain,
  Settings,
  Share2,
} from "lucide-react";

export const DEFAULT_TEAM_ICON_KEY = "robot";

/** 顺序与参考 TeamModal 12 格图标矩阵一致（6×2） */
export const TEAM_ICON_OPTIONS: { key: string; Icon: LucideIcon }[] = [
  { key: "briefcase", Icon: Briefcase },
  { key: "lightbulb", Icon: Lightbulb },
  { key: "settings", Icon: Settings },
  { key: "linechart", Icon: LineChart },
  { key: "share", Icon: Share2 },
  { key: "headphones", Icon: Headphones },
  { key: "robot", Icon: Bot },
  { key: "globe", Icon: Globe },
  { key: "database", Icon: Database },
  { key: "code", Icon: Code },
  { key: "document", Icon: FileText },
  { key: "mountain", Icon: Mountain },
];

export function resolveTeamIcon(
  iconKey?: string | null,
): (typeof TEAM_ICON_OPTIONS)[number] {
  const found = TEAM_ICON_OPTIONS.find((o) => o.key === iconKey);
  return found ?? TEAM_ICON_OPTIONS.find((o) => o.key === DEFAULT_TEAM_ICON_KEY)!;
}
