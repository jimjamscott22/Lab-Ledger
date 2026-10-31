import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const FIXTURES = path.resolve(import.meta.dirname, '../../tests/fixtures');

export function copyFixtures(opts: { malformed?: boolean } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labs-'));
  fs.cpSync(path.join(FIXTURES, 'labs'), dir, { recursive: true });
  if (opts.malformed) fs.cpSync(path.join(FIXTURES, 'malformed'), dir, { recursive: true });
  return dir;
}
