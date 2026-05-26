const STORAGE_KEY = "qwenpaw.agentTeamPresentation.v1";

export type AgentTeamPresentation = {
  iconKey: string;
  tags: string[];
};

const defaults: AgentTeamPresentation = {
  iconKey: "robot",
  tags: [],
};

function readAll(): Record<string, AgentTeamPresentation> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<
      string,
      Partial<AgentTeamPresentation>
    >;
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [
        k,
        {
          iconKey:
            typeof v?.iconKey === "string" ? v.iconKey : defaults.iconKey,
          tags: Array.isArray(v?.tags)
            ? v.tags.filter((x) => typeof x === "string")
            : [],
        },
      ]),
    );
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, AgentTeamPresentation>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadAgentPresentation(
  agentId: string,
): AgentTeamPresentation {
  const row = readAll()[agentId];
  return row ? { ...row } : { ...defaults };
}

export function saveAgentPresentation(
  agentId: string,
  data: Partial<AgentTeamPresentation>,
) {
  const all = readAll();
  const prev = all[agentId] ?? { ...defaults };
  all[agentId] = {
    iconKey: data.iconKey ?? prev.iconKey,
    tags: data.tags ?? prev.tags,
  };
  writeAll(all);
}

export function removeAgentPresentation(agentId: string) {
  const all = readAll();
  delete all[agentId];
  writeAll(all);
}
