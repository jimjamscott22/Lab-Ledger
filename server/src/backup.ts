import fs from 'node:fs';
import path from 'node:path';
import type { BackupV1 } from '@lab-ledger/shared';
import type { Db } from './db/open';
import * as repo from './db/repo';

export function exportBackup(db: Db, dataDir: string, now: Date): BackupV1 {
  const labState = (db.prepare('SELECT slug, status, started_at, completed_at, updated_at FROM lab_state ORDER BY slug').all() as
    { slug: string; status: BackupV1['labState'][number]['status']; started_at: string | null; completed_at: string | null; updated_at: string | null }[])
    .map((r) => ({ slug: r.slug, status: r.status, startedAt: r.started_at, completedAt: r.completed_at, updatedAt: r.updated_at }));

  const stepProgress = (db.prepare('SELECT slug, step_index, text_hash, checked, checked_at FROM step_progress ORDER BY slug, step_index').all() as
    { slug: string; step_index: number; text_hash: string; checked: number; checked_at: string | null }[])
    .map((r) => ({ slug: r.slug, stepIndex: r.step_index, textHash: r.text_hash, checked: !!r.checked, checkedAt: r.checked_at }));

  const journals = (db.prepare('SELECT slug, body_md, time_taken_min, difficulty, confidence, updated_at FROM journals ORDER BY slug').all() as
    { slug: string; body_md: string; time_taken_min: number | null; difficulty: number | null; confidence: number | null; updated_at: string | null }[])
    .map((r) => ({ slug: r.slug, bodyMd: r.body_md ?? '', timeTakenMin: r.time_taken_min, difficulty: r.difficulty, confidence: r.confidence, updatedAt: r.updated_at }));

  const attachments = (db.prepare('SELECT id, slug, file_name, mime, bytes, created_at FROM attachments ORDER BY id').all() as
    { id: string; slug: string; file_name: string; mime: string; bytes: number; created_at: string }[])
    .map((r) => {
      const file = path.join(dataDir, 'attachments', r.slug, r.file_name);
      const data = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
      return { id: r.id, slug: r.slug, fileName: r.file_name, mime: r.mime as 'image/png' | 'image/jpeg' | 'image/webp', bytes: r.bytes, createdAt: r.created_at, dataBase64: data.toString('base64') };
    });

  const activity = (db.prepare('SELECT day, slug, kind, at FROM activity ORDER BY id').all() as BackupV1['activity']);

  return { version: 1, exportedAt: now.toISOString(), labState, stepProgress, journals, attachments, activity };
}

export function importBackup(db: Db, dataDir: string, b: BackupV1): void {
  db.transaction(() => {
    for (const t of ['lab_state', 'step_progress', 'journals', 'attachments', 'activity']) db.exec(`DELETE FROM ${t}`);
    const insState = db.prepare('INSERT INTO lab_state (slug,status,started_at,completed_at,updated_at) VALUES (?,?,?,?,?)');
    b.labState.forEach((r) => insState.run(r.slug, r.status, r.startedAt, r.completedAt, r.updatedAt));
    const insStep = db.prepare('INSERT INTO step_progress (slug,step_index,text_hash,checked,checked_at) VALUES (?,?,?,?,?)');
    b.stepProgress.forEach((r) => insStep.run(r.slug, r.stepIndex, r.textHash, r.checked ? 1 : 0, r.checkedAt));
    const insJ = db.prepare('INSERT INTO journals (slug,body_md,time_taken_min,difficulty,confidence,updated_at) VALUES (?,?,?,?,?,?)');
    b.journals.forEach((r) => insJ.run(r.slug, r.bodyMd, r.timeTakenMin, r.difficulty, r.confidence, r.updatedAt));
    const insA = db.prepare('INSERT INTO attachments (id,slug,file_name,mime,bytes,created_at) VALUES (?,?,?,?,?,?)');
    b.attachments.forEach((r) => insA.run(r.id, r.slug, r.fileName, r.mime, r.bytes, r.createdAt));
    const insAct = db.prepare('INSERT INTO activity (day,slug,kind,at) VALUES (?,?,?,?)');
    b.activity.forEach((r) => insAct.run(r.day, r.slug, r.kind, r.at));
  })();

  const root = path.join(dataDir, 'attachments');
  fs.rmSync(root, { recursive: true, force: true });
  for (const a of b.attachments) {
    const dir = path.join(root, a.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, a.fileName), Buffer.from(a.dataBase64, 'base64'));
  }
}

export function backupToMarkdown(db: Db): string {
  const parts = ['# Lab Dashboard notes\n'];
  for (const lab of repo.listLabs(db)) {
    const j = repo.getJournal(db, lab.slug);
    if (!j || !j.bodyMd.trim()) continue;
    const num = lab.labNumber ? `Lab ${String(lab.labNumber).padStart(2, '0')}` : 'Lab';
    const meta = [
      `Status: ${repo.getState(db, lab.slug).status}`,
      j.timeTakenMin !== null ? `Time: ${j.timeTakenMin} min` : null,
      j.difficulty !== null ? `Difficulty: ${j.difficulty}/5` : null,
      j.confidence !== null ? `Confidence: ${j.confidence}/5` : null,
    ].filter(Boolean).join(' · ');
    parts.push(`## ${num} – ${lab.title} (${lab.slug})\n\n${meta}\n\n${j.bodyMd.trim()}\n`);
  }
  return parts.join('\n');
}
