import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseLabHtml, LAB_FILE_RE, titleFromSlug } from './parse';
import { FIXTURES } from '../testing';

const read = (dir: string, f: string) => fs.readFileSync(path.join(FIXTURES, dir, f), 'utf8');

const EXPECTED = [
  { file: '2026-10-23-ad-user-onboarding.html', n: 1, title: 'AD User Onboarding', steps: 9, time: { low: 45, high: 60 } },
  { file: '2026-10-24-gpo-drive-mapping.html', n: 2, title: 'GPO Drive Mapping', steps: 12, time: { low: 30, high: 45 } },
  { file: '2026-10-25-entra-license-assignment.html', n: 3, title: 'Entra License Assignment', steps: 12, time: { low: 30, high: 45 } },
  { file: '2026-10-26-intune-device-enrollment.html', n: 4, title: 'Intune Device Enrollment', steps: 15, time: { low: 30, high: 45 } },
  { file: '2026-10-27-powershell-inactive-users-report.html', n: 5, title: 'PowerShell Inactive Users Report', steps: 13, time: { low: 30, high: 45 } },
  { file: '2026-10-28-linux-file-permissions.html', n: 6, title: 'Linux File Permissions', steps: 14, time: { low: 30, high: 45 } },
  { file: '2026-10-29-windows-wont-wake-from-sleep.html', n: 7, title: "PC Won't Wake From Sleep", steps: 42, time: { low: 45, high: 45 } },
];

describe('parseLabHtml', () => {
  it.each(EXPECTED)('parses $file', ({ file, n, title, steps, time }) => {
    const lab = parseLabHtml(read('labs', file), file);
    expect(lab.parseStatus).toBe('ok');
    expect(lab.labNumber).toBe(n);
    expect(lab.title).toBe(title);
    expect(lab.steps).toHaveLength(steps);
    expect(lab.questions).toHaveLength(3);
    expect(lab.timeEstimateMin).toEqual(time);
  });

  it('takes slug and date from the filename and builds step keys', () => {
    const lab = parseLabHtml(read('labs', EXPECTED[0].file), EXPECTED[0].file);
    expect(lab.slug).toBe('ad-user-onboarding');
    expect(lab.date).toBe('2026-10-23');
    expect(lab.steps[0].key).toBe('ad-user-onboarding#0');
    expect(lab.steps[8].index).toBe(8);
    expect(new Set(lab.steps.map((s) => s.textHash)).size).toBe(9);
  });

  it('maps heading variants to canonical section kinds', () => {
    const kinds = (i: number) => parseLabHtml(read('labs', EXPECTED[i].file), EXPECTED[i].file).sections.map((s) => s.kind);
    expect(kinds(0)).toEqual(expect.arrayContaining(['scenario', 'time', 'prerequisites', 'steps', 'verify', 'cleanup', 'interview', 'stretch']));
    expect(kinds(1)).toEqual(expect.arrayContaining(['scenario', 'prerequisites', 'steps', 'verify', 'cleanup', 'interview']));
    const k7 = kinds(6);
    expect(k7).toEqual(expect.arrayContaining(['ticketTemplate', 'other']));
    expect(k7.filter((k) => k === 'steps')).toHaveLength(3);
  });

  it('records the section each step sits in', () => {
    const lab = parseLabHtml(read('labs', EXPECTED[6].file), EXPECTED[6].file);
    expect(lab.steps[0].section).toBe('Phase 1: Isolate (~10 min)');
    expect(lab.steps[41].section).toBe('Cleanup / rollback');
  });

  it('extracts scenario, prerequisites, tags and answers', () => {
    const lab = parseLabHtml(read('labs', EXPECTED[1].file), EXPECTED[1].file);
    expect(lab.scenarioText).toContain('User reports a problem');
    expect(lab.prerequisites).toEqual(['A Windows 11 VM', 'Admin account']);
    expect(lab.tags).toEqual(['Directory']);
    expect(lab.questions[0].question).toMatch(/^Question 1/);
    expect(lab.questions[0].answerHtml).toContain('Answer 1');
    expect(lab.questions[0].answerHtml).not.toContain('<summary');
  });

  it('marks a half-written file partial and keeps its title', () => {
    const f = '2026-10-30-malformed-lab.html';
    const lab = parseLabHtml(read('malformed', f), f);
    expect(lab.parseStatus).toBe('partial');
    expect(lab.title).toBe('Half Written');
    expect(lab.steps).toHaveLength(0);
  });

  it('marks an empty file failed and falls back to the slug title', () => {
    const f = '2026-10-31-empty-lab.html';
    const lab = parseLabHtml(read('malformed', f), f);
    expect(lab.parseStatus).toBe('failed');
    expect(lab.title).toBe('Empty Lab');
  });

  it('rejects bad filenames', () => {
    expect(LAB_FILE_RE.test('not-a-lab.html')).toBe(false);
    expect(LAB_FILE_RE.test('2026-10-23-../x.html')).toBe(false);
    expect(LAB_FILE_RE.test('2026-10-23-ok-slug.html')).toBe(true);
    expect(() => parseLabHtml('<h1>x</h1>', 'not-a-lab.html')).toThrow();
  });

  it('title-cases slugs', () => {
    expect(titleFromSlug('windows-wont-wake')).toBe('Windows Wont Wake');
  });
});
