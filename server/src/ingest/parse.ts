import * as cheerio from 'cheerio';
import type { Lab, ParseStatus, Question, Section, Step } from '@lab-ledger/shared';
import { sha1 } from '../lib/hash';

export const LAB_FILE_RE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)\.html$/;

export type ParsedLab = Omit<Lab, 'topicLabel' | 'topics' | 'fileHash' | 'ingestedAt' | 'missingFile'>;

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

export function titleFromSlug(slug: string): string {
  return slug.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

const KINDS: [string, RegExp][] = [
  ['scenario', /^(skill\s*&\s*scenario|the ticket|scenario)/i],
  ['time', /^time estimate/i],
  ['prerequisites', /^prerequisites/i],
  ['verify', /^verify it worked/i],
  ['cleanup', /^cleanup/i],
  ['ticketTemplate', /^ticket write-?up template/i],
  ['interview', /^interview questions/i],
  ['stretch', /^stretch goal/i],
  ['steps', /^(steps\b|phase\s+\d+)/i],
];

const classify = (heading: string) => KINDS.find(([, re]) => re.test(heading))?.[0] ?? 'other';

function parseTime(s: string): { low: number; high: number } | null {
  const range = /(\d+)\s*[–-]\s*(\d+)\s*min/i.exec(s);
  if (range) return { low: Number(range[1]), high: Number(range[2]) };
  const single = /~\s*(\d+)\s*min/i.exec(s) ?? /(\d+)\s*min/i.exec(s);
  return single ? { low: Number(single[1]), high: Number(single[1]) } : null;
}

const textOf = (html: string) => norm(cheerio.load(html).root().text());

export function parseLabHtml(html: string, fileName: string): ParsedLab {
  const m = LAB_FILE_RE.exec(fileName);
  if (!m) throw new Error(`Not a lab filename: ${fileName}`);
  const [, date, slug] = m;
  const base = { slug, date, fileName, labNumber: null, scenarioText: null, prerequisites: [], steps: [], questions: [], sections: [], tags: [], timeEstimateMin: null };
  const fallback: ParsedLab = { ...base, title: titleFromSlug(slug), parseStatus: 'failed' };

  if (!html.trim()) return fallback;
  try {
    return parseBody(html, { date, slug, fileName });
  } catch {
    return fallback;
  }
}

function parseBody(html: string, id: { date: string; slug: string; fileName: string }): ParsedLab {
  const $ = cheerio.load(html);
  const titleTag = norm($('title').first().text());
  const h1 = norm($('h1').first().text());
  const tm = /^Lab\s+(\d+)\s*[:–—-]\s*(.*)$/i.exec(titleTag);
  const labNumber = tm ? Number(tm[1]) : null;
  const rawTitle = h1 || (tm ? tm[2] : titleTag);
  const title = rawTitle.replace(/^Lab\s+\d+\s*[:–—-]\s*/i, '').trim();

  const sections: Section[] = [];
  $('h2').each((_, el) => {
    const h = $(el);
    const heading = norm(h.text());
    const sectionHtml = h.nextUntil('h2').toArray().map((n) => $.html(n)).join('');
    sections.push({ kind: classify(heading), heading, html: sectionHtml });
  });

  const steps: Step[] = [];
  let current = '';
  $('h2, input[type="checkbox"]').each((_, el) => {
    const node = $(el);
    if (node.is('h2')) {
      current = norm(node.text());
      return;
    }
    const label = node.closest('label');
    const text = norm((label.length ? label : node.parent()).text());
    const index = steps.length;
    steps.push({ index, key: `${id.slug}#${index}`, textHash: sha1(text.toLowerCase()), text, section: current });
  });

  const tags = $('span.tag').toArray().map((el) => norm($(el).text())).filter((t) => t && !t.includes('⏱'));

  let time: { low: number; high: number } | null = null;
  const timeSection = sections.find((s) => s.kind === 'time');
  if (timeSection) time = parseTime(textOf(timeSection.html));
  if (!time) {
    for (const el of $('span.tag').toArray()) {
      const t = norm($(el).text());
      if (t.includes('⏱')) {
        time = parseTime(t);
        if (time) break;
      }
    }
  }
  if (!time) {
    const parts = sections.filter((s) => /^phase\s+\d+/i.test(s.heading)).map((s) => parseTime(s.heading)).filter((t) => t !== null);
    if (parts.length) {
      const sum = parts.reduce((acc, t) => ({ low: acc.low + t.low, high: acc.high + t.high }), { low: 0, high: 0 });
      time = sum;
    }
  }

  const scenarioSection = sections.find((s) => s.kind === 'scenario');
  const scenarioText = scenarioSection ? textOf(scenarioSection.html) : norm($('div.card.ticket').first().text()) || null;

  const prereq = sections.find((s) => s.kind === 'prerequisites');
  const $p = prereq ? cheerio.load(prereq.html) : null;
  const prerequisites = $p ? $p('li').toArray().map((li) => norm($p(li).text())) : [];

  const questions: Question[] = [];
  $('details').each((i, el) => {
    const d = $(el);
    const summary = d.children('summary').first();
    const question = norm(summary.text());
    summary.remove();
    questions.push({ index: i, question, answerHtml: (d.html() ?? '').trim() });
  });

  const hasTitle = title.length > 0;
  const parseStatus: ParseStatus = hasTitle && steps.length > 0 ? 'ok' : hasTitle || steps.length > 0 ? 'partial' : 'failed';

  return {
    slug: id.slug, date: id.date, fileName: id.fileName, labNumber,
    title: hasTitle ? title : titleFromSlug(id.slug),
    tags, timeEstimateMin: time, scenarioText, prerequisites, steps, questions, sections, parseStatus,
  };
}
