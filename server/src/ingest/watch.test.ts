import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { openDb } from '../db/open';
import { LabEvents } from '../events';
import { createIngestService } from './service';
import { watchLabs } from './watch';
import { copyFixtures } from '../testing';
import type { LabEventPayload } from '@lab-ledger/shared';

const waitFor = async (pred: () => boolean, ms: number) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return pred();
};

const NEW_LAB =
  '<html><head><title>Lab 08: Watch Me</title></head><body><h1>Watch Me</h1><label><input type="checkbox"> a</label></body></html>';

let closer: (() => Promise<void>) | null = null;
afterEach(async () => {
  await closer?.();
  closer = null;
});

describe('watchLabs', () => {
  it('emits add, change and remove events within 5 seconds', async () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    const events = new LabEvents();
    const ingest = createIngestService({ db, labsDir: dir, events });
    ingest.rescan();
    const seen: LabEventPayload[] = [];
    events.subscribe((e) => seen.push(e));

    const w = watchLabs({
      labsDir: dir,
      stabilityMs: 200,
      debounceMs: 100,
      onChange: () => ingest.rescan(),
    });
    closer = w.close;
    await w.ready;

    const file = path.join(dir, '2026-10-30-watch-me.html');
    fs.writeFileSync(file, NEW_LAB);
    expect(await waitFor(() => seen.some((e) => e.type === 'lab:added' && e.slug === 'watch-me'), 5000)).toBe(
      true,
    );

    fs.appendFileSync(file, '\n<!-- changed -->');
    expect(
      await waitFor(() => seen.some((e) => e.type === 'lab:updated' && e.slug === 'watch-me'), 5000),
    ).toBe(true);

    fs.rmSync(file);
    expect(
      await waitFor(() => seen.some((e) => e.type === 'lab:removed' && e.slug === 'watch-me'), 5000),
    ).toBe(true);
  });

  it('reacts to lab-log.txt changes', async () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    const events = new LabEvents();
    const ingest = createIngestService({ db, labsDir: dir, events });
    ingest.rescan();
    const seen: LabEventPayload[] = [];
    events.subscribe((e) => seen.push(e));
    const w = watchLabs({
      labsDir: dir,
      stabilityMs: 200,
      debounceMs: 100,
      onChange: () => ingest.rescan(),
    });
    closer = w.close;
    await w.ready;
    fs.appendFileSync(path.join(dir, 'lab-log.txt'), '2026-10-30 | Lab 08 | DNS basics | dns-basics\n');
    expect(await waitFor(() => seen.some((e) => e.slug === 'dns-basics'), 5000)).toBe(true);
  });
});
