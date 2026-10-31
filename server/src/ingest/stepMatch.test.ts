import { describe, it, expect } from 'vitest';
import { remapProgress, type ProgressRow } from './stepMatch';
import type { Step } from '@lab-ledger/shared';

const step = (index: number, textHash: string): Step => ({
  index,
  key: `s#${index}`,
  textHash,
  text: textHash,
  section: '',
});
const row = (stepIndex: number, textHash: string, checked = true): ProgressRow => ({
  stepIndex,
  textHash,
  checked,
  checkedAt: checked ? 't' : null,
});

describe('remapProgress', () => {
  it('keeps progress when nothing changed', () => {
    const out = remapProgress([row(0, 'a'), row(1, 'b')], [step(0, 'a'), step(1, 'b')]);
    expect(out.map((r) => [r.stepIndex, r.checked])).toEqual([
      [0, true],
      [1, true],
    ]);
  });
  it('follows a reordered step by hash', () => {
    const out = remapProgress([row(0, 'a', false), row(1, 'b', true)], [step(0, 'b'), step(1, 'a')]);
    expect(out.find((r) => r.stepIndex === 0)).toMatchObject({ textHash: 'b', checked: true });
    expect(out.find((r) => r.stepIndex === 1)).toMatchObject({ textHash: 'a', checked: false });
  });
  it('falls back to index when the text was edited', () => {
    const out = remapProgress([row(0, 'a'), row(1, 'b')], [step(0, 'a'), step(1, 'b-edited')]);
    expect(out.find((r) => r.stepIndex === 1)).toMatchObject({ textHash: 'b-edited', checked: true });
  });
  it('drops rows for removed steps and does not invent rows for new ones', () => {
    const out = remapProgress([row(0, 'a'), row(1, 'b'), row(2, 'c')], [step(0, 'a'), step(1, 'c')]);
    expect(out.map((r) => r.stepIndex)).toEqual([0, 1]);
    expect(out.find((r) => r.stepIndex === 1)?.textHash).toBe('c');
  });
  it('matches duplicate hashes in order', () => {
    const out = remapProgress([row(0, 'x', true), row(1, 'x', false)], [step(0, 'x'), step(1, 'x')]);
    expect(out.map((r) => r.checked)).toEqual([true, false]);
  });
});
