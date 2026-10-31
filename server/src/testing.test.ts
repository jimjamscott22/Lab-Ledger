import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { FIXTURES, copyFixtures } from './testing';

describe('fixtures', () => {
  it('has 7 labs and a log with 7 lines', () => {
    const html = fs.readdirSync(path.join(FIXTURES, 'labs')).filter((f) => f.endsWith('.html'));
    expect(html).toHaveLength(7);
    const log = fs.readFileSync(path.join(FIXTURES, 'labs', 'lab-log.txt'), 'utf8').trim().split('\n');
    expect(log).toHaveLength(7);
  });
  it('checkbox counts are 9/12/12/15/13/14/42', () => {
    const counts = fs.readdirSync(path.join(FIXTURES, 'labs')).filter((f) => f.endsWith('.html')).sort()
      .map((f) => (fs.readFileSync(path.join(FIXTURES, 'labs', f), 'utf8').match(/type="checkbox"/g) ?? []).length);
    expect(counts).toEqual([9, 12, 12, 15, 13, 14, 42]);
  });
  it('copyFixtures returns an independent temp dir', () => {
    const dir = copyFixtures({ malformed: true });
    expect(fs.readdirSync(dir)).toContain('lab-log.txt');
    expect(fs.readdirSync(dir)).toContain('2026-10-31-empty-lab.html');
  });
});
