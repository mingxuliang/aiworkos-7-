import { request } from "../request";
import type { ChannelConfig, SingleChannelConfig } from "../types";

const configPath = (path: string, agentId?: string) =>
  agentId
    ? `/agents/${encodeURIComponent(agentId)}/config${path}`
    : `/config${path}`;

export const channelApi = {
  listChannelTypes: () => request<string[]>("/config/channels/types"),

  listChannels: () => request<ChannelConfig>("/config/channels"),

  updateChannels: (body: ChannelConfig) =>
    request<ChannelConfig>("/config/channels", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  getChannelConfig: (channelName: string) =>
    request<SingleChannelConfig>(
      `/config/channels/${encodeURIComponent(channelName)}`,
    ),

  updateChannelConfig: (
    channelName: string,
    body: SingleChannelConfig,
    agentId?: string,
  ) =>
    request<SingleChannelConfig>(
      configPath(`/channels/${encodeURIComponent(channelName)}`, agentId),
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    ),

  getChannelQrcode: (channel: string, agentId?: string) =>
    request<{ qrcode_img: string; poll_token: string }>(
      configPath(`/channels/${encodeURIComponent(channel)}/qrcode`, agentId),
    ),

  getChannelQrcodeStatus: (channel: string, token: string, agentId?: string) =>
    request<{
      status: string;
      credentials: Record<string, string>;
    }>(
      configPath(
        `/channels/${encodeURIComponent(
          channel,
        )}/qrcode/status?token=${encodeURIComponent(token)}`,
        agentId,
      ),
    ),
};
