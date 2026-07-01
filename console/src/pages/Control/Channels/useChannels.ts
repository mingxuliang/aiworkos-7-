import { useState, useEffect, useCallback, useMemo } from "react";
import api from "../../../api";
import { useAgentStore } from "../../../stores/agentStore";

export function useChannels() {
  const { selectedAgent } = useAgentStore();
  const [channels, setChannels] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [channelTypes, setChannelTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const [data, types] = await Promise.all([
        api.listChannels(),
        api.listChannelTypes(),
      ]);
      if (data)
        setChannels(data as unknown as Record<string, Record<string, unknown>>);
      if (types) setChannelTypes(types);
    } catch (error) {
      console.error("❌ Failed to load channels:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels, selectedAgent]);

  // Built-in channels come first (in a fixed order), then custom channels
  const builtinOrder = useMemo(
    () => [
      "dingtalk",
      "feishu",
      "imessage",
      "discord",
      "telegram",
      "qq",
      "matrix",
      "sip",
      "xiaoyi",
    ],
    [],
  );

  // Channels to hide from the UI
  const HIDDEN_CHANNELS = new Set(["console"]);

  const orderedKeys = useMemo(
    () => [
      ...builtinOrder.filter((k) => channelTypes.includes(k) && !HIDDEN_CHANNELS.has(k)),
      ...channelTypes.filter((k) => !builtinOrder.includes(k) && !HIDDEN_CHANNELS.has(k)),
    ],
    [builtinOrder, channelTypes],
  );

  // Read isBuiltin from API response
  const isBuiltin = useCallback(
    (key: string) => Boolean(channels[key]?.isBuiltin),
    [channels],
  );

  // Optimistic local update — avoids full-page refresh flash
  const updateChannel = useCallback(
    (key: string, config: Record<string, unknown>) => {
      setChannels((prev) => ({ ...prev, [key]: config }));
    },
    [],
  );

  return {
    channels,
    channelTypes,
    orderedKeys,
    isBuiltin,
    loading,
    fetchChannels,
    updateChannel,
  };
}
