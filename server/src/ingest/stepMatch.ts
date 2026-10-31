import type { Step } from '@lab-ledger/shared';

export interface ProgressRow {
  stepIndex: number;
  textHash: string;
  checked: boolean;
  checkedAt: string | null;
}

export function remapProgress(old: ProgressRow[], steps: Step[]): ProgressRow[] {
  const byHash = new Map<string, ProgressRow[]>();
  for (const r of [...old].sort((a, b) => a.stepIndex - b.stepIndex)) {
    const list = byHash.get(r.textHash) ?? [];
    list.push(r);
    byHash.set(r.textHash, list);
  }
  const used = new Set<ProgressRow>();
  const out = new Map<number, ProgressRow>();

  for (const s of steps) {
    const hit = byHash.get(s.textHash)?.find((r) => !used.has(r));
    if (hit) {
      used.add(hit);
      out.set(s.index, { ...hit, stepIndex: s.index });
    }
  }
  const oldByIndex = new Map(old.map((r) => [r.stepIndex, r]));
  for (const s of steps) {
    if (out.has(s.index)) continue;
    const r = oldByIndex.get(s.index);
    if (r && !used.has(r)) {
      used.add(r);
      out.set(s.index, { ...r, stepIndex: s.index, textHash: s.textHash });
    }
  }
  return [...out.values()].sort((a, b) => a.stepIndex - b.stepIndex);
}
