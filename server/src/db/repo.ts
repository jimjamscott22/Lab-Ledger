import type { Journal, Lab, LabState, LabStatus, LabSummary, Ticket, TicketFields } from '@lab-ledger/shared';
import type { Db } from './open';
import type { ProgressRow } from '../ingest/stepMatch';

interface LabRow {
  parsed_json: string;
  missing_file: number;
}

const hydrate = (r: LabRow): Lab => ({
  ...(JSON.parse(r.parsed_json) as Lab),
  missingFile: !!r.missing_file,
});

export function upsertLab(db: Db, lab: Lab): void {
  db.prepare(
    `INSERT INTO labs (slug,date,lab_number,title,topic_label,topics,tags,time_low,time_high,parsed_json,file_name,file_hash,parse_status,missing_file,ingested_at)
     VALUES (@slug,@date,@labNumber,@title,@topicLabel,@topics,@tags,@timeLow,@timeHigh,@parsed,@fileName,@fileHash,@parseStatus,@missing,@ingestedAt)
     ON CONFLICT(slug) DO UPDATE SET date=excluded.date, lab_number=excluded.lab_number, title=excluded.title,
       topic_label=excluded.topic_label, topics=excluded.topics, tags=excluded.tags, time_low=excluded.time_low,
       time_high=excluded.time_high, parsed_json=excluded.parsed_json, file_name=excluded.file_name,
       file_hash=excluded.file_hash, parse_status=excluded.parse_status, missing_file=excluded.missing_file,
       ingested_at=excluded.ingested_at`,
  ).run({
    slug: lab.slug,
    date: lab.date,
    labNumber: lab.labNumber,
    title: lab.title,
    topicLabel: lab.topicLabel,
    topics: JSON.stringify(lab.topics),
    tags: JSON.stringify(lab.tags),
    timeLow: lab.timeEstimateMin?.low ?? null,
    timeHigh: lab.timeEstimateMin?.high ?? null,
    parsed: JSON.stringify(lab),
    fileName: lab.fileName,
    fileHash: lab.fileHash,
    parseStatus: lab.parseStatus,
    missing: lab.missingFile ? 1 : 0,
    ingestedAt: lab.ingestedAt,
  });
}

export function getLab(db: Db, slug: string): Lab | null {
  const r = db.prepare('SELECT parsed_json, missing_file FROM labs WHERE slug=?').get(slug) as
    | LabRow
    | undefined;
  return r ? hydrate(r) : null;
}

export function listLabs(db: Db): Lab[] {
  const rows = db
    .prepare(
      'SELECT parsed_json, missing_file FROM labs ORDER BY date ASC, COALESCE(lab_number, 9999) ASC, slug ASC',
    )
    .all() as LabRow[];
  return rows.map(hydrate);
}

export function markMissing(db: Db, slug: string): void {
  db.prepare('UPDATE labs SET missing_file=1 WHERE slug=?').run(slug);
}

export function getState(db: Db, slug: string): LabState {
  const r = db.prepare('SELECT status, started_at, completed_at, updated_at FROM lab_state WHERE slug=?').get(slug) as
    | { status: LabStatus; started_at: string | null; completed_at: string | null; updated_at: string | null }
    | undefined;
  return r
    ? { status: r.status, startedAt: r.started_at, completedAt: r.completed_at, updatedAt: r.updated_at }
    : { status: 'not_started', startedAt: null, completedAt: null, updatedAt: null };
}

export function setStatus(db: Db, slug: string, status: LabStatus, nowIso: string): LabState {
  const prev = getState(db, slug);
  const startedAt = prev.startedAt ?? (status === 'in_progress' || status === 'completed' ? nowIso : null);
  const completedAt = status === 'completed' ? (prev.completedAt ?? nowIso) : null;
  db.prepare(
    `INSERT INTO lab_state (slug,status,started_at,completed_at,updated_at) VALUES (?,?,?,?,?)
     ON CONFLICT(slug) DO UPDATE SET status=excluded.status, started_at=excluded.started_at,
       completed_at=excluded.completed_at, updated_at=excluded.updated_at`,
  ).run(slug, status, startedAt, completedAt, nowIso);
  return getState(db, slug);
}

export function getProgressRows(db: Db, slug: string): ProgressRow[] {
  const rows = db
    .prepare('SELECT step_index, text_hash, checked, checked_at FROM step_progress WHERE slug=? ORDER BY step_index')
    .all(slug) as { step_index: number; text_hash: string; checked: number; checked_at: string | null }[];
  return rows.map((r) => ({
    stepIndex: r.step_index,
    textHash: r.text_hash,
    checked: !!r.checked,
    checkedAt: r.checked_at,
  }));
}

export function replaceProgress(db: Db, slug: string, rows: ProgressRow[]): void {
  db.prepare('DELETE FROM step_progress WHERE slug=?').run(slug);
  const ins = db.prepare(
    'INSERT INTO step_progress (slug, step_index, text_hash, checked, checked_at) VALUES (?,?,?,?,?)',
  );
  for (const r of rows) ins.run(slug, r.stepIndex, r.textHash, r.checked ? 1 : 0, r.checkedAt);
}

export function setStep(
  db: Db,
  slug: string,
  index: number,
  textHash: string,
  checked: boolean,
  nowIso: string,
): void {
  db.prepare(
    `INSERT INTO step_progress (slug, step_index, text_hash, checked, checked_at) VALUES (?,?,?,?,?)
     ON CONFLICT(slug, step_index) DO UPDATE SET text_hash=excluded.text_hash, checked=excluded.checked, checked_at=excluded.checked_at`,
  ).run(slug, index, textHash, checked ? 1 : 0, checked ? nowIso : null);
}

export function getChecked(db: Db, slug: string): number[] {
  return (
    db
      .prepare('SELECT step_index FROM step_progress WHERE slug=? AND checked=1 ORDER BY step_index')
      .all(slug) as { step_index: number }[]
  ).map((r) => r.step_index);
}

export function getJournal(db: Db, slug: string): Journal | null {
  const r = db.prepare('SELECT body_md, time_taken_min, difficulty, confidence, updated_at FROM journals WHERE slug=?').get(slug) as
    | {
        body_md: string;
        time_taken_min: number | null;
        difficulty: number | null;
        confidence: number | null;
        updated_at: string | null;
      }
    | undefined;
  return r
    ? {
        bodyMd: r.body_md ?? '',
        timeTakenMin: r.time_taken_min,
        difficulty: r.difficulty,
        confidence: r.confidence,
        updatedAt: r.updated_at,
      }
    : null;
}

export function putJournal(db: Db, slug: string, j: Omit<Journal, 'updatedAt'>, nowIso: string): Journal {
  db.prepare(
    `INSERT INTO journals (slug, body_md, time_taken_min, difficulty, confidence, updated_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(slug) DO UPDATE SET body_md=excluded.body_md, time_taken_min=excluded.time_taken_min,
       difficulty=excluded.difficulty, confidence=excluded.confidence, updated_at=excluded.updated_at`,
  ).run(slug, j.bodyMd, j.timeTakenMin, j.difficulty, j.confidence, nowIso);
  return getJournal(db, slug)!;
}

export function getTicket(db: Db, slug: string): Ticket | null {
  const row = db.prepare('SELECT fields_json, updated_at FROM tickets WHERE slug=?').get(slug) as
    | { fields_json: string; updated_at: string | null }
    | undefined;
  return row
    ? { fields: JSON.parse(row.fields_json) as TicketFields, updatedAt: row.updated_at }
    : null;
}

export function putTicket(db: Db, slug: string, fields: TicketFields, nowIso: string): Ticket {
  db.prepare(
    `INSERT INTO tickets (slug, fields_json, updated_at) VALUES (?,?,?)
     ON CONFLICT(slug) DO UPDATE SET fields_json=excluded.fields_json, updated_at=excluded.updated_at`,
  ).run(slug, JSON.stringify(fields), nowIso);
  return getTicket(db, slug)!;
}

export interface AttachmentRow {
  id: string;
  slug: string;
  fileName: string;
  mime: string;
  bytes: number;
  createdAt: string;
}

export function insertAttachment(db: Db, a: AttachmentRow): void {
  db.prepare('INSERT INTO attachments (id, slug, file_name, mime, bytes, created_at) VALUES (?,?,?,?,?,?)').run(
    a.id,
    a.slug,
    a.fileName,
    a.mime,
    a.bytes,
    a.createdAt,
  );
}

export function getAttachment(db: Db, id: string): AttachmentRow | null {
  const r = db.prepare('SELECT id, slug, file_name, mime, bytes, created_at FROM attachments WHERE id=?').get(id) as
    | { id: string; slug: string; file_name: string; mime: string; bytes: number; created_at: string }
    | undefined;
  return r
    ? { id: r.id, slug: r.slug, fileName: r.file_name, mime: r.mime, bytes: r.bytes, createdAt: r.created_at }
    : null;
}

export function addActivity(
  db: Db,
  day: string,
  slug: string,
  kind: 'step' | 'completed' | 'skipped',
  at: string,
): void {
  db.prepare('INSERT INTO activity (day, slug, kind, at) VALUES (?,?,?,?)').run(day, slug, kind, at);
}

export function activityDays(db: Db): { active: string[]; skipped: string[] } {
  const rows = db.prepare('SELECT DISTINCT day, kind FROM activity ORDER BY day').all() as {
    day: string;
    kind: string;
  }[];
  const active = [...new Set(rows.filter((r) => r.kind !== 'skipped').map((r) => r.day))];
  const skipped = [...new Set(rows.filter((r) => r.kind === 'skipped').map((r) => r.day))];
  return { active, skipped };
}

export function listSummaries(db: Db): LabSummary[] {
  const states = new Map(
    (db.prepare('SELECT slug, status FROM lab_state').all() as { slug: string; status: LabStatus }[]).map((r) => [
      r.slug,
      r.status,
    ]),
  );
  const counts = new Map(
    (db.prepare('SELECT slug, SUM(checked) AS c FROM step_progress GROUP BY slug').all() as { slug: string; c: number }[]).map(
      (r) => [r.slug, r.c],
    ),
  );
  const notes = new Set(
    (db.prepare("SELECT slug FROM journals WHERE TRIM(COALESCE(body_md,'')) <> ''").all() as { slug: string }[]).map(
      (r) => r.slug,
    ),
  );
  return listLabs(db).map((l) => ({
    slug: l.slug,
    date: l.date,
    labNumber: l.labNumber,
    title: l.title,
    topicLabel: l.topicLabel,
    topics: l.topics,
    tags: l.tags,
    timeEstimateMin: l.timeEstimateMin,
    parseStatus: l.parseStatus,
    missingFile: !!l.missingFile,
    status: states.get(l.slug) ?? 'not_started',
    stepsTotal: l.steps.length,
    stepsChecked: counts.get(l.slug) ?? 0,
    hasNotes: notes.has(l.slug),
  }));
}
