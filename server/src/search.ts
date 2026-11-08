import * as cheerio from 'cheerio';
import type { Lab, SearchKind, SearchResult, SnippetPart, TicketFields } from '@lab-ledger/shared';
import type { Db } from './db/open';

// Private-use control characters bracket matches inside FTS snippets. They are stripped from
// everything we index, so user content can never forge a highlight.
const OPEN = '\u0002';
const CLOSE = '\u0003';
const MAX_TERMS = 10;

const clean = (s: string) => s.replaceAll(OPEN, '').replaceAll(CLOSE, '').replace(/\s+/g, ' ').trim();

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style').remove();
  $('*').after(' ');
  return clean($.root().text());
}

function labBody(lab: Lab): string {
  const parts = [lab.scenarioText ?? '', ...lab.prerequisites];
  if (lab.sections.length > 0) {
    parts.push(...lab.sections.map((s) => `${s.heading} ${htmlToText(s.html)}`));
  } else {
    parts.push(...lab.steps.map((s) => s.text), ...lab.questions.map((q) => `${q.question} ${htmlToText(q.answerHtml)}`));
  }
  return clean(parts.join(' '));
}

function put(db: Db, slug: string, kind: SearchKind, title: string, body: string): void {
  db.transaction(() => {
    db.prepare('DELETE FROM search_idx WHERE slug = ? AND kind = ?').run(slug, kind);
    if (body) db.prepare('INSERT INTO search_idx (slug, kind, title, body) VALUES (?,?,?,?)').run(slug, kind, clean(title), body);
  })();
}

const labTitle = (db: Db, slug: string) =>
  (db.prepare('SELECT title FROM labs WHERE slug = ?').get(slug) as { title: string } | undefined)?.title ?? '';

export function indexLab(db: Db, lab: Lab): void {
  db.transaction(() => {
    put(db, lab.slug, 'lab', lab.title, labBody(lab) || clean(lab.title));
    db.prepare("UPDATE search_idx SET title = ? WHERE slug = ? AND kind <> 'lab'").run(clean(lab.title), lab.slug);
  })();
}

export function indexJournal(db: Db, slug: string, bodyMd: string): void {
  put(db, slug, 'journal', labTitle(db, slug), clean(bodyMd));
}

export function indexTicket(db: Db, slug: string, fields: TicketFields): void {
  put(db, slug, 'ticket', labTitle(db, slug), clean(Object.values(fields).join(' ')));
}

/** Re-index every journal and ticket from the tables (used after a restore). */
export function reindexNotes(db: Db): void {
  db.transaction(() => {
    db.exec("DELETE FROM search_idx WHERE kind IN ('journal','ticket')");
    for (const r of db.prepare('SELECT slug, body_md FROM journals').all() as { slug: string; body_md: string | null }[]) {
      indexJournal(db, r.slug, r.body_md ?? '');
    }
    for (const r of db.prepare('SELECT slug, fields_json FROM tickets').all() as { slug: string; fields_json: string }[]) {
      indexTicket(db, r.slug, JSON.parse(r.fields_json) as TicketFields);
    }
  })();
}

export function rebuildSearchIndex(db: Db): void {
  db.transaction(() => {
    db.exec('DELETE FROM search_idx');
    for (const r of db.prepare('SELECT parsed_json FROM labs').all() as { parsed_json: string }[]) {
      indexLab(db, JSON.parse(r.parsed_json) as Lab);
    }
    reindexNotes(db);
  })();
}

/** Turn free text into a safe FTS5 query: every term quoted, the last one a prefix match. */
export function buildMatchQuery(raw: string): string | null {
  const terms = (raw.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, MAX_TERMS);
  if (terms.length === 0) return null;
  return terms.map((t, i) => `"${t}"${i === terms.length - 1 ? '*' : ''}`).join(' ');
}

function toParts(marked: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let rest = marked;
  while (rest) {
    const start = rest.indexOf(OPEN);
    const end = start === -1 ? -1 : rest.indexOf(CLOSE, start);
    if (end === -1) {
      parts.push({ text: rest, match: false });
      break;
    }
    if (start > 0) parts.push({ text: rest.slice(0, start), match: false });
    parts.push({ text: rest.slice(start + 1, end), match: true });
    rest = rest.slice(end + 1);
  }
  return parts;
}

export function searchAll(db: Db, raw: string, limit = 25): SearchResult[] {
  const match = buildMatchQuery(raw);
  if (!match) return [];
  const rows = db
    .prepare(
      `SELECT search_idx.slug AS slug, search_idx.kind AS kind, labs.title AS title,
              labs.lab_number AS lab_number, labs.date AS date,
              snippet(search_idx, 3, ?, ?, '…', 16) AS body_snippet,
              highlight(search_idx, 2, ?, ?) AS title_marked
       FROM search_idx JOIN labs ON labs.slug = search_idx.slug
       WHERE search_idx MATCH ?
       ORDER BY bm25(search_idx, 0, 0, 10, 1)
       LIMIT ?`,
    )
    .all(OPEN, CLOSE, OPEN, CLOSE, match, limit) as {
    slug: string;
    kind: SearchKind;
    title: string;
    lab_number: number | null;
    date: string;
    body_snippet: string;
    title_marked: string;
  }[];
  return rows.map((r) => {
    const body = toParts(r.body_snippet);
    const snippet = body.some((p) => p.match) || !r.title_marked.includes(OPEN) ? body : toParts(r.title_marked);
    return { slug: r.slug, kind: r.kind, labTitle: r.title, labNumber: r.lab_number, date: r.date, snippet };
  });
}

/** Complete slug set for list filtering, independent of ranked search pagination. */
export function matchingLabSlugs(db: Db, raw: string): Set<string> {
  const match = buildMatchQuery(raw);
  if (!match) return new Set();
  const rows = db.prepare('SELECT DISTINCT slug FROM search_idx WHERE search_idx MATCH ?')
    .all(match) as { slug: string }[];
  return new Set(rows.map((row) => row.slug));
}
