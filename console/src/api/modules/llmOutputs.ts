/**
 * LLM 产出物 API — Base: /api/llm-outputs
 * 对应后端 src/aiwork/app/routers/llm_output.py
 */

import { getApiUrl, getApiToken } from '../config';
import { buildAuthHeaders } from '../authHeaders';
import { request } from '../request';

export interface LlmOutputItem {
  id: number;
  session_id: string | null;
  agent_id: string | null;
  original_filename: string;
  file_size: number;
  mime_type: string;
  download_url: string;
  created_at: string;
}

export interface LlmOutputListResponse {
  items: LlmOutputItem[];
  total: number;
  page: number;
  page_size: number;
}

export const llmOutputsApi = {
  list: (params?: { session_id?: string; page?: number; page_size?: number }) =>
    request<LlmOutputListResponse>(
      `/llm-outputs${buildListQuery(params)}`,
    ),

  /** Returns the authenticated download URL (with JWT token appended). */
  downloadUrl: (item: LlmOutputItem): string => {
    const url = item.download_url.startsWith('http')
      ? item.download_url
      : getApiUrl(item.download_url.replace(/^\/api/, ''));
    const token = getApiToken();
    return token ? `${url}?token=${encodeURIComponent(token)}` : url;
  },

  /** Stream-download a single record as a browser download. */
  downloadBlob: async (item: LlmOutputItem): Promise<void> => {
    const url = getApiUrl(`/llm-outputs/${item.id}/download`);
    const res = await fetch(url, { headers: buildAuthHeaders() });
    if (!res.ok) throw new Error(`下载失败 (${res.status})`);
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = item.original_filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  },

  delete: (id: number) =>
    fetch(getApiUrl(`/llm-outputs/${id}`), {
      method: 'DELETE',
      headers: buildAuthHeaders(),
    }).then((r) => {
      if (!r.ok && r.status !== 204) throw new Error(`删除失败 (${r.status})`);
    }),

  batchDelete: (ids: number[]) =>
    request<{ deleted: number }>('/llm-outputs/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
};

function buildListQuery(
  params?: { session_id?: string; page?: number; page_size?: number },
): string {
  if (!params) return '';
  const qs = new URLSearchParams();
  if (params.session_id) qs.set('session_id', params.session_id);
  if (params.page) qs.set('page', String(params.page));
  if (params.page_size) qs.set('page_size', String(params.page_size));
  const s = qs.toString();
  return s ? `?${s}` : '';
}
