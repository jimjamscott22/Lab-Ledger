import fs from 'node:fs';
import path from 'node:path';
import type { BackupV1 } from '@lab-ledger/shared';
import type { Db } from './db/open';
import * as repo from './db/repo';
import { reindexNotes } from './search';
import { sniffImage, MAX_BYTES } from './routes/attachments';

export class BackupValidationError extends Error {}

// Written by restores from before the phase moved into SQLite; still
// honoured on startup so an interrupted legacy restore can be reconciled.
const LEGACY_RESTORE_STATE_FILE = 'attachments.restore-state.json';

function readRestorePhase(db: Db): string | null {
  const row = db.prepare('SELECT phase FROM restore_state WHERE id = 1').get() as
    { phase: string } | undefined;
  return row?.phase ?? null;
}

function readLegacyRestorePhase(dataDir: string): 'staged' | 'committed' | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(dataDir, LEGACY_RESTORE_STATE_FILE), 'utf8'),
    ) as { phase?: unknown };
    return parsed.phase === 'staged' || parsed.phase === 'committed' ? parsed.phase : null;
  } catch {
    return null;
  }
}

function finishAttachmentSwap(dataDir: string): void {
  const root = path.join(dataDir, 'attachments');
  const staging = path.join(dataDir, 'attachments.restore-new');
  const previous = path.join(dataDir, 'attachments.restore-old');
  if (fs.existsSync(staging)) {
    if (fs.existsSync(root) && !fs.existsSync(previous)) fs.renameSync(root, previous);
    if (!fs.existsSync(root)) fs.renameSync(staging, root);
  }
  fs.rmSync(previous, { recursive: true, force: true });
  fs.rmSync(staging, { recursive: true, force: true });
}

/**
 * Brings the attachments directory back in line with the database after a
 * restore that was interrupted mid-flight. The restore records
 * 'files-pending' inside the same SQLite transaction that replaces the
 * data, so the record and the commit are atomic: if the row is present,
 * the database already points at the staged files and the swap is
 * finished here; if it is absent, the transaction rolled back and any
 * staged files are discarded.
 */
export function reconcileRestore(db: Db, dataDir: string): void {
  const root = path.join(dataDir, 'attachments');
  const staging = path.join(dataDir, 'attachments.restore-new');
  const previous = path.join(dataDir, 'attachments.restore-old');

  if (readRestorePhase(db) === 'files-pending') {
    finishAttachmentSwap(dataDir);
    db.prepare('DELETE FROM restore_state WHERE id = 1').run();
    fs.rmSync(path.join(dataDir, LEGACY_RESTORE_STATE_FILE), { force: true });
    return;
  }

  const legacy = readLegacyRestorePhase(dataDir);
  if (legacy === 'committed') {
    finishAttachmentSwap(dataDir);
  } else if (legacy === 'staged') {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  fs.rmSync(path.join(dataDir, LEGACY_RESTORE_STATE_FILE), { force: true });

  if (!legacy) {
    // Interrupted before any commit record: staged files are orphans.
    fs.rmSync(staging, { recursive: true, force: true });
    if (!fs.existsSync(root) && fs.existsSync(previous)) fs.renameSync(previous, root);
  }
}

interface DecodedAttachment {
  meta: BackupV1['attachments'][number];
  data: Buffer;
}

function decodeAttachments(b: BackupV1): DecodedAttachment[] {
  return b.attachments.map((a) => {
    // Decode, then require an exact canonical re-encode. Buffer.from is
    // lenient about invalid characters, so the round trip is what rejects
    // them — and unlike a quantified regex it cannot overflow the stack on
    // multi-megabyte payloads.
    const data = Buffer.from(a.dataBase64, 'base64');
    if (data.toString('base64') !== a.dataBase64) {
      throw new BackupValidationError(`Attachment ${a.id}: data is not valid base64`);
    }
    if (data.length !== a.bytes) {
      throw new BackupValidationError(
        `Attachment ${a.id}: expected ${a.bytes} bytes, decoded ${data.length}`,
      );
    }
    if (data.length > MAX_BYTES) {
      throw new BackupValidationError(`Attachment ${a.id}: exceeds the ${MAX_BYTES} byte limit`);
    }
    const kind = sniffImage(data);
    if (!kind || kind.mime !== a.mime || !a.fileName.endsWith(`.${kind.ext}`)) {
      throw new BackupValidationError(
        `Attachment ${a.id}: content does not match its declared type`,
      );
    }
    return { meta: a, data };
  });
}

export function exportBackup(db: Db, dataDir: string, now: Date): BackupV1 {
  const labState = (
    db
      .prepare(
        'SELECT slug, status, started_at, completed_at, updated_at FROM lab_state ORDER BY slug',
      )
      .all() as {
      slug: string;
      status: BackupV1['labState'][number]['status'];
      started_at: string | null;
      completed_at: string | null;
      updated_at: string | null;
    }[]
  ).map((r) => ({
    slug: r.slug,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    updatedAt: r.updated_at,
  }));

  const stepProgress = (
    db
      .prepare(
        'SELECT slug, step_index, text_hash, checked, checked_at FROM step_progress ORDER BY slug, step_index',
      )
      .all() as {
      slug: string;
      step_index: number;
      text_hash: string;
      checked: number;
      checked_at: string | null;
    }[]
  ).map((r) => ({
    slug: r.slug,
    stepIndex: r.step_index,
    textHash: r.text_hash,
    checked: !!r.checked,
    checkedAt: r.checked_at,
  }));

  const journals = (
    db
      .prepare(
        'SELECT slug, body_md, time_taken_min, difficulty, confidence, updated_at FROM journals ORDER BY slug',
      )
      .all() as {
      slug: string;
      body_md: string;
      time_taken_min: number | null;
      difficulty: number | null;
      confidence: number | null;
      updated_at: string | null;
    }[]
  ).map((r) => ({
    slug: r.slug,
    bodyMd: r.body_md ?? '',
    timeTakenMin: r.time_taken_min,
    difficulty: r.difficulty,
    confidence: r.confidence,
    updatedAt: r.updated_at,
  }));

  const tickets = (
    db.prepare('SELECT slug, fields_json, updated_at FROM tickets ORDER BY slug').all() as {
      slug: string;
      fields_json: string;
      updated_at: string | null;
    }[]
  ).map((r) => ({
    slug: r.slug,
    fields: JSON.parse(r.fields_json) as BackupV1['tickets'][number]['fields'],
    updatedAt: r.updated_at,
  }));

  const questionReviews = (
    db
      .prepare(
        `SELECT slug, q_index, box, last_rating, last_reviewed, due_date
         FROM question_reviews ORDER BY slug, q_index`,
      )
      .all() as {
      slug: string;
      q_index: number;
      box: number;
      last_rating: BackupV1['questionReviews'][number]['lastRating'];
      last_reviewed: string;
      due_date: string;
    }[]
  ).map((r) => ({
    slug: r.slug,
    questionIndex: r.q_index,
    box: r.box,
    lastRating: r.last_rating,
    lastReviewed: r.last_reviewed,
    dueDate: r.due_date,
  }));

  const attachments = (
    db
      .prepare('SELECT id, slug, file_name, mime, bytes, created_at FROM attachments ORDER BY id')
      .all() as {
      id: string;
      slug: string;
      file_name: string;
      mime: string;
      bytes: number;
      created_at: string;
    }[]
  ).map((r) => {
    const file = path.join(dataDir, 'attachments', r.slug, r.file_name);
    const data = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
    return {
      id: r.id,
      slug: r.slug,
      fileName: r.file_name,
      mime: r.mime as 'image/png' | 'image/jpeg' | 'image/webp',
      bytes: r.bytes,
      createdAt: r.created_at,
      dataBase64: data.toString('base64'),
    };
  });

  const activity = db
    .prepare('SELECT day, slug, kind, at FROM activity ORDER BY id')
    .all() as BackupV1['activity'];

  return {
    version: 1,
    exportedAt: now.toISOString(),
    labState,
    stepProgress,
    journals,
    tickets,
    questionReviews,
    attachments,
    activity,
  };
}

export function importBackup(db: Db, dataDir: string, b: BackupV1): void {
  const root = path.join(dataDir, 'attachments');
  const staging = path.join(dataDir, 'attachments.restore-new');
  const previous = path.join(dataDir, 'attachments.restore-old');

  // Validate every attachment before touching the database or the live files.
  const decoded = decodeAttachments(b);

  reconcileRestore(db, dataDir);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(previous, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });

  let committed = false;
  try {
    for (const { meta, data } of decoded) {
      const dir = path.join(staging, meta.slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, meta.fileName), data);
    }
    fs.mkdirSync(staging, { recursive: true });

    db.transaction(() => {
      for (const t of [
        'lab_state',
        'step_progress',
        'journals',
        'tickets',
        'question_reviews',
        'attachments',
        'activity',
      ]) {
        db.exec(`DELETE FROM ${t}`);
      }
      const insState = db.prepare(
        'INSERT INTO lab_state (slug,status,started_at,completed_at,updated_at) VALUES (?,?,?,?,?)',
      );
      b.labState.forEach((r) =>
        insState.run(r.slug, r.status, r.startedAt, r.completedAt, r.updatedAt),
      );
      const insStep = db.prepare(
        'INSERT INTO step_progress (slug,step_index,text_hash,checked,checked_at) VALUES (?,?,?,?,?)',
      );
      b.stepProgress.forEach((r) =>
        insStep.run(r.slug, r.stepIndex, r.textHash, r.checked ? 1 : 0, r.checkedAt),
      );
      const insJ = db.prepare(
        'INSERT INTO journals (slug,body_md,time_taken_min,difficulty,confidence,updated_at) VALUES (?,?,?,?,?,?)',
      );
      b.journals.forEach((r) =>
        insJ.run(r.slug, r.bodyMd, r.timeTakenMin, r.difficulty, r.confidence, r.updatedAt),
      );
      const insTicket = db.prepare(
        'INSERT INTO tickets (slug,fields_json,updated_at) VALUES (?,?,?)',
      );
      b.tickets.forEach((r) => insTicket.run(r.slug, JSON.stringify(r.fields), r.updatedAt));
      const insReview = db.prepare(
        `INSERT INTO question_reviews
           (slug,q_index,box,last_rating,last_reviewed,due_date) VALUES (?,?,?,?,?,?)`,
      );
      b.questionReviews.forEach((r) =>
        insReview.run(r.slug, r.questionIndex, r.box, r.lastRating, r.lastReviewed, r.dueDate),
      );
      const insA = db.prepare(
        'INSERT INTO attachments (id,slug,file_name,mime,bytes,created_at) VALUES (?,?,?,?,?,?)',
      );
      b.attachments.forEach((r) =>
        insA.run(r.id, r.slug, r.fileName, r.mime, r.bytes, r.createdAt),
      );
      const insAct = db.prepare('INSERT INTO activity (day,slug,kind,at) VALUES (?,?,?,?)');
      b.activity.forEach((r) => insAct.run(r.day, r.slug, r.kind, r.at));
      reindexNotes(db);
      // Recorded inside the transaction, so this marker and the restored
      // data commit (or roll back) together. reconcileRestore() uses it to
      // finish the attachment swap after a crash in the window below.
      db.prepare(
        `INSERT INTO restore_state (id, phase) VALUES (1, 'files-pending')
         ON CONFLICT(id) DO UPDATE SET phase = excluded.phase`,
      ).run();
    })();
    committed = true;

    // The database now points at the staged files; swap them into place.
    if (fs.existsSync(root)) fs.renameSync(root, previous);
    fs.renameSync(staging, root);
    fs.rmSync(previous, { recursive: true, force: true });
    db.prepare('DELETE FROM restore_state WHERE id = 1').run();
  } catch (err) {
    if (!committed) {
      fs.rmSync(staging, { recursive: true, force: true });
    }
    throw err;
  }
}

export function backupToMarkdown(db: Db): string {
  const parts = ['# Lab Dashboard notes\n'];
  for (const row of repo.listNotedJournals(db)) {
    const num = row.labNumber ? `Lab ${String(row.labNumber).padStart(2, '0')}` : 'Lab';
    const j = row.journal;
    const meta = [
      `Status: ${row.status}`,
      j.timeTakenMin !== null ? `Time: ${j.timeTakenMin} min` : null,
      j.difficulty !== null ? `Difficulty: ${j.difficulty}/5` : null,
      j.confidence !== null ? `Confidence: ${j.confidence}/5` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    parts.push(`## ${num} – ${row.title} (${row.slug})\n\n${meta}\n\n${j.bodyMd.trim()}\n`);
  }
  return parts.join('\n');
}
