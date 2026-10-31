import { TOPICS, type Stats } from '@lab-ledger/shared';
import type { Db } from './db/open';
import * as repo from './db/repo';
import { dayInTz } from './lib/time';

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function computeStreaks(active: string[], skipped: string[], today: string): { current: number; longest: number } {
  const act = new Set(active);
  const skip = new Set(skipped);

  let current = 0;
  let day = today;
  if (!act.has(day) && !skip.has(day)) day = addDays(day, -1);
  while (act.has(day) || skip.has(day)) {
    if (act.has(day)) current++;
    day = addDays(day, -1);
  }

  const all = [...new Set([...act, ...skip])].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of all) {
    if (prev === null || addDays(prev, 1) !== d) run = 0;
    if (act.has(d)) run++;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest };
}

export function buildStats(db: Db, now: Date, tz: string): Stats {
  const labs = repo.listSummaries(db).filter((l) => !l.missingFile);
  const { active, skipped } = repo.activityDays(db);
  const streaks = computeStreaks(active, skipped, dayInTz(now, tz));

  const agg = db.prepare('SELECT COALESCE(SUM(time_taken_min),0) AS minutes, AVG(difficulty) AS diff FROM journals').get() as { minutes: number; diff: number | null };

  const topicCoverage = TOPICS.map((topic) => {
    const inTopic = labs.filter((l) => (l.topics as string[]).includes(topic));
    const completed = inTopic.filter((l) => l.status === 'completed').length;
    return { topic, count: inTopic.length, completed, pct: inTopic.length ? Math.round((completed / inTopic.length) * 100) : 0 };
  });

  const today = dayInTz(now, tz);
  const todayLab = labs.find((l) => l.date === today) ?? labs.at(-1) ?? null;

  const recent = db
    .prepare(
      `SELECT j.slug, l.title, j.body_md, j.updated_at FROM journals j JOIN labs l ON l.slug = j.slug
       WHERE TRIM(COALESCE(j.body_md,'')) <> '' ORDER BY j.updated_at DESC LIMIT 5`,
    )
    .all() as { slug: string; title: string; body_md: string; updated_at: string }[];

  return {
    completed: labs.filter((l) => l.status === 'completed').length,
    total: labs.length,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    totalMinutes: agg.minutes,
    avgDifficulty: agg.diff === null ? null : Math.round(agg.diff * 10) / 10,
    topicCoverage,
    today: todayLab,
    recentJournals: recent.map((r) => ({ slug: r.slug, title: r.title, snippet: r.body_md.trim().slice(0, 160), updatedAt: r.updated_at })),
  };
}
