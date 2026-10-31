import type { Journal, LabDetail, LabState, LabStatus, LabSummary, Stats } from '@lab-ledger/shared';

async function request<T>(path: string, init: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: init.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.form,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const api = {
  labs: () => request<LabSummary[]>('/labs'),
  lab: (slug: string) => request<LabDetail>(`/labs/${slug}`),
  stats: () => request<Stats>('/stats'),
  rescan: () => request<{ added: string[]; updated: string[]; removed: string[]; warnings: string[] }>('/labs/rescan', { method: 'POST' }),
  setStatus: (slug: string, status: LabStatus) => request<LabState>(`/labs/${slug}/status`, { method: 'PUT', json: { status } }),
  toggleStep: (slug: string, index: number, checked: boolean) =>
    request<{ checked: number[]; status: LabStatus; allChecked: boolean }>(`/labs/${slug}/steps`, { method: 'PUT', json: { index, checked } }),
  saveJournal: (slug: string, j: Omit<Journal, 'updatedAt'>) => request<Journal>(`/labs/${slug}/journal`, { method: 'PUT', json: j }),
  saveJournalOnLeave: (slug: string, j: Omit<Journal, 'updatedAt'>): void => {
    try {
      void fetch(`/api/labs/${slug}/journal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(j),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // keepalive bodies are capped (~64 KB); an oversized note falls back to the debounced save
    }
  },
  uploadAttachment: (slug: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ id: string; url: string }>(`/labs/${slug}/attachments`, { method: 'POST', form });
  },
  restore: (payload: unknown) => request<{ ok: boolean }>('/restore', { method: 'POST', json: payload }),
};
