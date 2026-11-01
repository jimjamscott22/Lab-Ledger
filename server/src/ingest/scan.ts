import fs from 'node:fs';
import path from 'node:path';
import type { Lab } from '@lab-ledger/shared';
import type { Db } from '../db/open';
import * as repo from '../db/repo';
import { sha256 } from '../lib/hash';
import { LAB_FILE_RE, parseLabHtml } from './parse';
import { parseLabLog } from './labLog';
import { classifyTopics } from './topics';
import { remapProgress } from './stepMatch';
import { reconcileQuestionReviews } from '../questions';

export interface ScanResult {
  added: string[];
  updated: string[];
  removed: string[];
  warnings: string[];
}

export function scanLabs(db: Db, labsDir: string, now: () => Date = () => new Date()): ScanResult {
  const result: ScanResult = { added: [], updated: [], removed: [], warnings: [] };
  const names = fs.existsSync(labsDir) ? fs.readdirSync(labsDir) : [];

  const bySlug = new Map<string, { name: string; mtime: number }>();
  for (const name of names) {
    const m = LAB_FILE_RE.exec(name);
    if (!m) continue;
    const mtime = fs.statSync(path.join(labsDir, name)).mtimeMs;
    const prev = bySlug.get(m[2]);
    if (prev) {
      result.warnings.push(`Duplicate slug ${m[2]}: keeping the newest file`);
      if (prev.mtime >= mtime) continue;
    }
    bySlug.set(m[2], { name, mtime });
  }

  const logPath = path.join(labsDir, 'lab-log.txt');
  const log = fs.existsSync(logPath) ? parseLabLog(fs.readFileSync(logPath, 'utf8')) : new Map();

  const tx = db.transaction(() => {
    for (const [slug, { name }] of bySlug) {
      let buf: Buffer;
      try {
        buf = fs.readFileSync(path.join(labsDir, name));
      } catch (err) {
        result.warnings.push(`Could not read ${name}: ${(err as Error).message}`);
        continue;
      }
      const fileHash = sha256(buf);
      const prev = repo.getLab(db, slug);
      const before = prev ? JSON.stringify(prev) : null;

      let lab: Lab;
      if (prev && prev.fileHash === fileHash && prev.fileName === name && !prev.missingFile) {
        lab = { ...prev };
      } else {
        lab = {
          ...parseLabHtml(buf.toString('utf8'), name),
          topicLabel: null,
          topics: [],
          fileHash,
          ingestedAt: now().toISOString(),
          missingFile: false,
        };
      }

      const entry = log.get(slug);
      lab.labNumber = entry?.labNumber ?? lab.labNumber;
      lab.topicLabel = entry?.topicLabel ?? null;
      lab.topics = classifyTopics({ topicLabel: lab.topicLabel, tags: lab.tags, title: lab.title });
      lab.missingFile = false;

      if (before === JSON.stringify(lab)) continue;

      repo.upsertLab(db, lab);
      if (!prev) {
        result.added.push(slug);
      } else {
        result.updated.push(slug);
        const rows = repo.getProgressRows(db, slug);
        if (rows.length) repo.replaceProgress(db, slug, remapProgress(rows, lab.steps));
        reconcileQuestionReviews(db, slug, prev.questions, lab.questions);
      }
    }

    for (const lab of repo.listLabs(db)) {
      if (!bySlug.has(lab.slug) && !lab.missingFile) {
        repo.markMissing(db, lab.slug);
        result.removed.push(lab.slug);
      }
    }

    for (const [slug, entry] of log) {
      if (bySlug.has(slug) || repo.getLab(db, slug)) continue;
      repo.upsertLab(db, {
        slug,
        date: entry.date,
        labNumber: entry.labNumber,
        title: entry.topicLabel,
        topicLabel: entry.topicLabel,
        topics: classifyTopics({ topicLabel: entry.topicLabel, tags: [], title: entry.topicLabel }),
        tags: [],
        timeEstimateMin: null,
        scenarioText: null,
        prerequisites: [],
        steps: [],
        questions: [],
        sections: [],
        fileName: '',
        fileHash: '',
        parseStatus: 'failed',
        ingestedAt: now().toISOString(),
        missingFile: true,
      });
      result.added.push(slug);
    }
  });
  tx();

  return result;
}
