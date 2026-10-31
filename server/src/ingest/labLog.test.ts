import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseLabLog } from './labLog';
import { FIXTURES } from '../testing';

describe('parseLabLog', () => {
  it('parses all 7 fixture lines', () => {
    const map = parseLabLog(fs.readFileSync(path.join(FIXTURES, 'labs', 'lab-log.txt'), 'utf8'));
    expect(map.size).toBe(7);
    expect(map.get('ad-user-onboarding')).toEqual({
      date: '2026-10-23',
      labNumber: 1,
      topicLabel: 'AD users/groups',
      slug: 'ad-user-onboarding',
    });
    expect(map.get('windows-wont-wake-from-sleep')?.labNumber).toBe(7);
  });
  it('tolerates extra whitespace, blank lines, comments and pipes inside the label', () => {
    const map = parseLabLog(
      '\n# note\n2026-10-30  |  Lab  08 |  DNS | DHCP, scopes  |  dns-scopes  \n',
    );
    expect(map.get('dns-scopes')).toEqual({
      date: '2026-10-30',
      labNumber: 8,
      topicLabel: 'DNS | DHCP, scopes',
      slug: 'dns-scopes',
    });
  });
  it('skips malformed lines', () => {
    expect(parseLabLog('garbage\n2026-10-30 | Lab x | y | z').size).toBe(0);
  });
});
