import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesRoot = path.join(repoRoot, 'tests/fixtures');
const labsDirs = [path.join(repoRoot, 'labs'), path.join(fixturesRoot, 'labs')];
const badDir = path.join(fixturesRoot, 'malformed');
fs.rmSync(fixturesRoot, { recursive: true, force: true });
for (const labsDir of labsDirs) {
  fs.rmSync(labsDir, { recursive: true, force: true });
  fs.mkdirSync(labsDir, { recursive: true });
}
fs.mkdirSync(badDir, { recursive: true });

const LABS = [
  { n: 1, date: '2026-10-23', slug: 'ad-user-onboarding', log: 'AD users/groups', title: 'AD User Onboarding', total: 9, variant: 'card', tag: 'Directory' },
  { n: 2, date: '2026-10-24', slug: 'gpo-drive-mapping', log: 'GPO basics', title: 'GPO Drive Mapping', total: 12, variant: 'plain', tag: 'Directory' },
  { n: 3, date: '2026-10-25', slug: 'entra-license-assignment', log: 'M365/Entra licensing', title: 'Entra License Assignment', total: 12, variant: 'plain', tag: 'Cloud', en: true },
  { n: 4, date: '2026-10-26', slug: 'intune-device-enrollment', log: 'Intune enrollment', title: 'Intune Device Enrollment', total: 15, variant: 'plain', tag: 'Endpoint' },
  { n: 5, date: '2026-10-27', slug: 'powershell-inactive-users-report', log: 'PowerShell reporting', title: 'PowerShell Inactive Users Report', total: 13, variant: 'plain', tag: 'Scripting' },
  { n: 6, date: '2026-10-28', slug: 'linux-file-permissions', log: 'Linux permissions', title: 'Linux File Permissions', total: 14, variant: 'plain', tag: 'Linux' },
  { n: 7, date: '2026-10-29', slug: 'windows-wont-wake-from-sleep', log: 'Windows troubleshooting, real-world', title: "PC Won't Wake From Sleep", total: 42, variant: 'phases', tag: 'Troubleshooting' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function build(l) {
  const num = String(l.n).padStart(2, '0');
  const titleTag = l.en ? `Lab ${num} – ${l.title}` : `Lab ${num}: ${l.title}`;
  const h1 = l.n % 2 ? `Lab ${num}: ${l.title}` : l.title;
  const phases = l.variant === 'phases';
  const verifyN = phases ? 4 : 2;
  const cleanupN = phases ? 2 : 1;
  const stepsN = l.total - verifyN - cleanupN;

  const stepBlock = (text, i) =>
    l.variant === 'card'
      ? `<div class="card step"><label><input type="checkbox"> ${esc(text)}</label><pre>Get-Help ${i}</pre></div>`
      : `<div style="margin:8px 0;padding:8px;border:1px solid #bbb"><label><input type="checkbox"><b>${esc(text)}</b></label><pre>echo ${i}</pre><p>Expected result noted here.</p></div>`;
  const steps = (prefix, n, offset = 0) =>
    Array.from({ length: n }, (_, i) => stepBlock(`${prefix} ${offset + i + 1} for ${l.slug}`, offset + i + 1)).join('\n');
  const checks = (prefix, n) =>
    Array.from({ length: n }, (_, i) => `<div><label><input type="checkbox"> ${esc(`${prefix} ${i + 1} for ${l.slug}`)}</label></div>`).join('\n');

  const parts = [];
  parts.push(`<h1>${esc(h1)}</h1>`);
  if (l.n === 1) {
    parts.push('<p><span class="tag">AD</span> <span class="tag">Users</span></p>');
    parts.push('<div class="card warn">Use the lab VM only.</div>');
  } else if (phases) {
    parts.push(`<p><span class="tag">${l.tag}</span></p>`);
  } else {
    parts.push(`<p><span class="tag">${l.tag}</span> <span class="tag">⏱ 30–45 min</span></p>`);
  }

  if (l.n === 1) {
    parts.push('<h2>Skill &amp; Scenario</h2><p>A new hire starts Monday and needs an account.</p>');
    parts.push('<h2>Time Estimate</h2><p>45–60 min</p>');
    parts.push('<h2>Prerequisites</h2><ul><li>Windows Server VM</li><li>Admin account</li></ul>');
  } else {
    parts.push('<h2>The ticket</h2><div class="card ticket"><p>User reports a problem and needs help today.</p></div>');
    parts.push('<h2>Prerequisites (all free)</h2><ul><li>A Windows 11 VM</li><li>Admin account</li></ul>');
  }

  if (phases) {
    parts.push('<h2>Phase 1: Isolate (~10 min)</h2>', steps('Isolate', 12, 0));
    parts.push('<h2>Phase 2: Test (~15 min)</h2>', steps('Test', 12, 12));
    parts.push('<h2>Phase 3: Fix (~20 min)</h2>', steps('Fix', 12, 24));
  } else {
    parts.push('<h2>Steps</h2>', steps('Do', stepsN));
  }

  parts.push(`<h2>${l.n === 1 ? 'Verify It Worked' : 'Verify it worked'}</h2>`, checks('Check', verifyN));
  parts.push(`<h2>${l.n === 1 ? 'Cleanup' : 'Cleanup / rollback'}</h2>`, checks('Remove', cleanupN));

  if (phases) {
    parts.push('<h2>Ticket write-up template</h2><p>Issue, Impact, Root cause, Resolution.</p>');
    parts.push('<h2>Decision tree</h2><p>If it wakes with the keyboard, check the device power settings.</p>');
  }

  parts.push(`<h2>${l.n === 1 ? 'Interview Questions' : 'Interview questions'}</h2>`);
  for (let q = 1; q <= 3; q++) {
    parts.push(`<details><summary>Question ${q} for ${esc(l.title)}?</summary><p>Answer ${q}.</p></details>`);
  }
  if (l.n === 1) parts.push('<h2>Stretch goal: script it</h2><p>Automate the onboarding with PowerShell.</p>');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(titleTag)}</title>
<style>body{font-family:sans-serif;max-width:760px;margin:24px auto;color:#222;background:#fff}.card{border:1px solid #ccc;padding:8px;margin:8px 0}.tag{background:#eef;padding:2px 6px;border-radius:4px}pre{background:#f4f4f4;padding:6px}</style>
</head><body>
${parts.join('\n')}
</body></html>
`;
}

for (const labsDir of labsDirs) {
  for (const l of LABS) fs.writeFileSync(path.join(labsDir, `${l.date}-${l.slug}.html`), build(l));
  fs.writeFileSync(
    path.join(labsDir, 'lab-log.txt'),
    LABS.map((l) => `${l.date} | Lab ${String(l.n).padStart(2, '0')} | ${l.log} | ${l.slug}`).join('\n') + '\n',
  );
}

fs.writeFileSync(
  path.join(badDir, '2026-10-30-malformed-lab.html'),
  '<html><head><title>Lab 08: Half Written</title></head><body><h1>Half Written</h1><h2>Steps<div><p>unclosed',
);
fs.writeFileSync(path.join(badDir, '2026-10-31-empty-lab.html'), '');
fs.writeFileSync(path.join(badDir, 'not-a-lab.html'), '<html><body><h1>Wrong filename</h1></body></html>');
console.log('Labs written to', labsDirs.join(' and '));
