# Lab Dashboard Phase 1 Implementation Plan

> **For agentic workers:** Execute this plan task by task, in order. Steps use checkbox (`- [ ]`) syntax for tracking. Use the `verification-before-completion` skill before declaring any task done, the `systematic-debugging` skill when a test fails unexpectedly, and the `finishing-a-development-branch` skill at the end. Don't skip the "run it and watch it fail" steps.

**Goal:** Build the Phase 1 (MVP) Lab Dashboard: ingest daily IT lab HTML files, browse and track them, keep a journal with screenshots, show stats, and back up and restore user data.

**Architecture:** An npm-workspaces monorepo. `server` is Fastify + better-sqlite3 and owns ingestion (scan, cheerio parse, chokidar watch, SSE). `client` is Vite + React + TypeScript and renders each lab in a same-origin sandboxed iframe, reading its checkboxes from the parent page. `shared` holds the types and zod schemas that both sides import. All user data lives in SQLite and `DATA_DIR`. Lab HTML is read-only.

**Tech Stack:** Node 22, TypeScript 5.9 (strict, ESM), Fastify 5, better-sqlite3 12, chokidar 4, cheerio 1, zod 3, Vitest 3, React 19, Vite 7, react-router-dom 7, marked 15, DOMPurify 3, Playwright + axe-core.

**Spec:** `docs/superpowers/specs/2026-10-31-lab-dashboard-phase1-spec.md` (decisions D1–D12 there are binding). **Design doc:** `docs/lab-dashboard-design-doc.md`.

## Global Constraints

- TypeScript `strict`, ESM, Prettier and ESLint. Validate every API body with the zod schemas in `shared`.
- The lab HTML files are read-only inputs. Never modify them. Store all user data in `DATA_DIR`.
- The lab **slug** is the stable ID (from the filename). Never key anything on the title.
- Lab filename regex: `^(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)\.html$`. Only files matching it inside `LABS_DIR` are read.
- `lab-log.txt` regex: `^(\d{4}-\d{2}-\d{2})\s*\|\s*Lab\s+(\d+)\s*\|\s*(.+?)\s*\|\s*([a-z0-9-]+)\s*$`.
- Ports: client `5173` (dev), API `4317`. Production serves both on `4317`. `LABS_DIR` default `/workspace/labs`. `DATA_DIR` default `./data`.
- Bind to `127.0.0.1` by default. No auth. No external network calls at runtime (no CDN, fonts, analytics).
- Timezone for days and streaks: `America/New_York`.
- The iframe is `sandbox="allow-same-origin"` and **never** has `allow-scripts`. Raw lab responses carry `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:`.
- Uploads: png, jpg, webp only, ≤ 10 MB, validated by magic bytes, renamed to UUIDs, served `nosniff` and inline.
- Duplicate slug: newest file mtime wins and a warning is returned.
- Small commits, one per task. Don't change Phase 2 or 3 scope.
- Pinned dependency majors (don't upgrade): see Task 1.

---

## File Structure

```
package.json  tsconfig.base.json  .prettierrc  eslint.config.js  .gitignore  .env.example
vitest.config.ts  playwright.config.ts  README.md
scripts/gen-fixtures.mjs  scripts/e2e-prepare.mjs
tests/fixtures/labs/*.html + lab-log.txt        # generated, committed (7 labs)
tests/fixtures/malformed/*                      # generated, committed (2 broken + 1 badly named)
tests/e2e/*.spec.ts
shared/package.json  shared/tsconfig.json  shared/src/index.ts
server/package.json  server/tsconfig.json  server/tsup.config.ts
server/src/index.ts            # bootstrap: config, db, scan, watcher, scheduler, listen
server/src/app.ts              # buildApp(ctx): Fastify, error handler, static client, routes
server/src/config.ts
server/src/testing.ts          # FIXTURES path, copyFixtures() for tests
server/src/events.ts           # LabEvents bus
server/src/scheduler.ts        # 15-min and 09:20 ET rescans
server/src/stats.ts            # computeStreaks, buildStats
server/src/backup.ts           # export/import/markdown
server/src/lib/{hash.ts,time.ts}
server/src/db/{schema.ts,open.ts,repo.ts}
server/src/ingest/{parse.ts,labLog.ts,topics.ts,stepMatch.ts,scan.ts,service.ts,watch.ts}
server/src/routes/{labs.ts,progress.ts,journal.ts,attachments.ts,stats.ts,backup.ts}
client/package.json  client/tsconfig.json  client/vite.config.ts  client/index.html
client/src/main.tsx  App.tsx
client/src/lib/{api.ts,useAsync.ts,events.ts,hotkeys.ts,theme.ts}
client/src/components/{Toasts.tsx,LabFrame.tsx,StepList.tsx,JournalEditor.tsx,StatCard.tsx,TopicGrid.tsx}
client/src/pages/{Home.tsx,LabList.tsx,LabViewer.tsx,Settings.tsx}
client/src/styles/app.css
```

Each server module has one job. Each `*.test.ts` lives beside the module it tests.

---

### Task 1: Scaffold the workspace

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.prettierrc`, `eslint.config.js`, `.gitignore`, `.env.example`, `vitest.config.ts`
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts` (stub)
- Create: `server/package.json`, `server/tsconfig.json`, `server/tsup.config.ts`, `server/src/config.ts`, `server/src/config.test.ts`
- Create: `client/package.json`, `client/tsconfig.json`

**Interfaces:**
- Produces: `loadConfig(env?: NodeJS.ProcessEnv): Config` where `Config = { labsDir: string; dataDir: string; port: number; host: string; timezone: string; watchStabilityMs: number }`.

- [ ] **Step 1: Write the root files**

`package.json`:

```json
{
  "name": "lab-ledger",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "dev": "concurrently -n server,client -c blue,green \"npm run dev -w server\" \"npm run dev -w client\"",
    "build": "npm run build -w client && npm run build -w server",
    "start": "node server/dist/index.js",
    "test": "vitest run",
    "e2e": "npm run build && playwright test",
    "lint": "eslint .",
    "typecheck": "tsc -p shared --noEmit && tsc -p server --noEmit && tsc -p client --noEmit",
    "fixtures": "node scripts/gen-fixtures.mjs"
  },
  "devDependencies": {
    "@axe-core/playwright": "^4.10.0",
    "@eslint/js": "^9.0.0",
    "@playwright/test": "^1.50.0",
    "@types/node": "^22.0.0",
    "concurrently": "^9.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "typescript": "~5.9.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^3.0.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

`.prettierrc`:

```json
{ "singleQuote": true, "printWidth": 100 }
```

`eslint.config.js`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'data/**', '.e2e/**', 'tests/fixtures/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
);
```

`.gitignore`:

```
node_modules/
dist/
data/
.e2e/
.env
playwright-report/
test-results/
*.log
```

`.env.example`:

```
LABS_DIR=/workspace/labs
DATA_DIR=./data
PORT=4317
HOST=127.0.0.1
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['shared/src/**/*.test.ts', 'server/src/**/*.test.ts', 'client/src/**/*.test.ts'],
    testTimeout: 15000,
  },
});
```

- [ ] **Step 2: Write the workspace package files**

`shared/package.json`:

```json
{
  "name": "@lab-ledger/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^3.25.0" }
}
```

`shared/tsconfig.json`:

```json
{ "extends": "../tsconfig.base.json", "include": ["src"] }
```

`shared/src/index.ts`:

```ts
export const SHARED_READY = true;
```

`server/package.json`:

```json
{
  "name": "@lab-ledger/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup"
  },
  "dependencies": {
    "@fastify/multipart": "^9.0.0",
    "@fastify/static": "^8.0.0",
    "@lab-ledger/shared": "*",
    "better-sqlite3": "^12.0.0",
    "chokidar": "^4.0.0",
    "cheerio": "^1.0.0",
    "fastify": "^5.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "tsup": "^8.0.0",
    "tsx": "^4.0.0"
  }
}
```

`server/tsconfig.json`:

```json
{ "extends": "../tsconfig.base.json", "include": ["src"] }
```

`server/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  noExternal: [/^@lab-ledger\/shared/],
});
```

`client/package.json`:

```json
{
  "name": "@lab-ledger/client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@lab-ledger/shared": "*",
    "dompurify": "^3.2.0",
    "marked": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^7.0.0"
  }
}
```

`client/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["vite/client"] },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 3: Write the failing config test**

`server/src/config.test.ts`:

```ts
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('uses the documented defaults', () => {
    const c = loadConfig({});
    expect(c.labsDir).toBe('/workspace/labs');
    expect(c.dataDir).toBe(path.resolve('./data'));
    expect(c.port).toBe(4317);
    expect(c.host).toBe('127.0.0.1');
    expect(c.timezone).toBe('America/New_York');
    expect(c.watchStabilityMs).toBe(2000);
  });

  it('reads overrides from the environment', () => {
    const c = loadConfig({ LABS_DIR: '/tmp/l', DATA_DIR: '/tmp/d', PORT: '9000', HOST: '0.0.0.0', WATCH_STABILITY_MS: '50' });
    expect(c).toMatchObject({ labsDir: '/tmp/l', dataDir: '/tmp/d', port: 9000, host: '0.0.0.0', watchStabilityMs: 50 });
  });
});
```

- [ ] **Step 4: Install dependencies and run the test to verify it fails**

Run: `npm install && npx vitest run server/src/config.test.ts`
Expected: FAIL with "Failed to resolve import './config'".

- [ ] **Step 5: Implement `server/src/config.ts`**

```ts
import path from 'node:path';

export interface Config {
  labsDir: string;
  dataDir: string;
  port: number;
  host: string;
  timezone: string;
  watchStabilityMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    labsDir: path.resolve(env.LABS_DIR ?? '/workspace/labs'),
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    port: Number(env.PORT ?? 4317),
    host: env.HOST ?? '127.0.0.1',
    timezone: 'America/New_York',
    watchStabilityMs: Number(env.WATCH_STABILITY_MS ?? 2000),
  };
}
```

- [ ] **Step 6: Run the test, plus lint and typecheck of the scaffold**

Run: `npx vitest run server/src/config.test.ts && npm run lint`
Expected: PASS (2 tests). Lint exits 0. (`npm run typecheck` is checked in Task 2, once `client/src` exists.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold npm workspaces, tooling, and config loader"
```

---

### Task 2: Shared types and zod schemas

**Files:**
- Modify: `shared/src/index.ts`
- Test: `shared/src/index.test.ts`

**Interfaces:**
- Produces (used by every later task): `LAB_STATUSES`, `LabStatus`, `TOPICS`, `RotationTopic`, `Topic`, `ParseStatus`, `Step`, `Question`, `Section`, `Lab`, `LabState`, `Journal`, `LabSummary`, `LabDetail`, `TopicCoverage`, `Stats`, `LabEventPayload`, and the zod schemas `StatusBody`, `StepToggleBody`, `JournalBody`, `BackupSchema`, plus `type BackupV1 = z.infer<typeof BackupSchema>`.

- [ ] **Step 1: Write the failing test**

`shared/src/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { StatusBody, StepToggleBody, JournalBody, TOPICS, BackupSchema } from './index';

describe('shared schemas', () => {
  it('has the 12 rotation topics', () => {
    expect(TOPICS).toHaveLength(12);
  });
  it('accepts valid status and rejects unknown', () => {
    expect(StatusBody.parse({ status: 'completed' }).status).toBe('completed');
    expect(() => StatusBody.parse({ status: 'done' })).toThrow();
  });
  it('rejects negative or fractional step index', () => {
    expect(() => StepToggleBody.parse({ index: -1, checked: true })).toThrow();
    expect(() => StepToggleBody.parse({ index: 1.5, checked: true })).toThrow();
    expect(StepToggleBody.parse({ index: 0, checked: false })).toEqual({ index: 0, checked: false });
  });
  it('bounds difficulty and confidence to 1-5', () => {
    const base = { bodyMd: '', timeTakenMin: null, difficulty: null, confidence: null };
    expect(() => JournalBody.parse({ ...base, difficulty: 6 })).toThrow();
    expect(() => JournalBody.parse({ ...base, confidence: 0 })).toThrow();
    expect(JournalBody.parse({ ...base, difficulty: 5, confidence: 1 })).toBeTruthy();
  });
  it('rejects unsafe slugs and ids in a backup', () => {
    const empty = { version: 1, exportedAt: 'x', labState: [], stepProgress: [], journals: [], attachments: [], activity: [] };
    expect(BackupSchema.parse(empty)).toBeTruthy();
    const bad = { ...empty, attachments: [{ id: '../x', slug: 'a', fileName: 'a.png', mime: 'image/png', bytes: 1, createdAt: 'x', dataBase64: '' }] };
    expect(() => BackupSchema.parse(bad)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run shared`
Expected: FAIL ("StatusBody is not exported" or similar).

- [ ] **Step 3: Implement `shared/src/index.ts`**

```ts
import { z } from 'zod';

export const LAB_STATUSES = ['not_started', 'in_progress', 'completed', 'skipped'] as const;
export type LabStatus = (typeof LAB_STATUSES)[number];

export const TOPICS = [
  'ad-gpo', 'm365-entra', 'intune', 'windows-troubleshooting', 'powershell', 'linux',
  'networking', 'dns-dhcp', 'backups', 'security-hardening', 'ticket-writeups', 'docker',
] as const;
export type RotationTopic = (typeof TOPICS)[number];
export type Topic = RotationTopic | 'other';

export type ParseStatus = 'ok' | 'partial' | 'failed';

export interface Step { index: number; key: string; textHash: string; text: string; section: string }
export interface Question { index: number; question: string; answerHtml: string }
export interface Section { kind: string; heading: string; html: string }

export interface Lab {
  slug: string;
  date: string;
  labNumber: number | null;
  title: string;
  topicLabel: string | null;
  topics: Topic[];
  tags: string[];
  timeEstimateMin: { low: number; high: number } | null;
  scenarioText: string | null;
  prerequisites: string[];
  steps: Step[];
  questions: Question[];
  sections: Section[];
  fileName: string;
  fileHash: string;
  parseStatus: ParseStatus;
  ingestedAt: string;
  missingFile?: boolean;
}

export interface LabState {
  status: LabStatus;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
}

export interface Journal {
  bodyMd: string;
  timeTakenMin: number | null;
  difficulty: number | null;
  confidence: number | null;
  updatedAt: string | null;
}

export interface LabSummary {
  slug: string;
  date: string;
  labNumber: number | null;
  title: string;
  topicLabel: string | null;
  topics: Topic[];
  tags: string[];
  timeEstimateMin: { low: number; high: number } | null;
  parseStatus: ParseStatus;
  missingFile: boolean;
  status: LabStatus;
  stepsTotal: number;
  stepsChecked: number;
  hasNotes: boolean;
}

export interface LabDetail {
  lab: Lab;
  state: LabState;
  checked: number[];
  journal: Journal | null;
  neighbors: { prev: string | null; next: string | null };
}

export interface TopicCoverage { topic: RotationTopic; count: number; completed: number; pct: number }

export interface Stats {
  completed: number;
  total: number;
  currentStreak: number;
  longestStreak: number;
  totalMinutes: number;
  avgDifficulty: number | null;
  topicCoverage: TopicCoverage[];
  today: LabSummary | null;
  recentJournals: { slug: string; title: string; snippet: string; updatedAt: string }[];
}

export interface LabEventPayload {
  type: 'lab:added' | 'lab:updated' | 'lab:removed';
  slug: string;
  title?: string;
}

export const StatusBody = z.object({ status: z.enum(LAB_STATUSES) });
export const StepToggleBody = z.object({ index: z.number().int().min(0), checked: z.boolean() });
export const JournalBody = z.object({
  bodyMd: z.string().max(200_000),
  timeTakenMin: z.number().int().min(0).max(100_000).nullable(),
  difficulty: z.number().int().min(1).max(5).nullable(),
  confidence: z.number().int().min(1).max(5).nullable(),
});

const Slug = z.string().regex(/^[a-z0-9-]+$/);
const Uuid = z.string().regex(/^[0-9a-f-]{36}$/);
const Mime = z.enum(['image/png', 'image/jpeg', 'image/webp']);

export const BackupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  labState: z.array(z.object({
    slug: Slug, status: z.enum(LAB_STATUSES),
    startedAt: z.string().nullable(), completedAt: z.string().nullable(), updatedAt: z.string().nullable(),
  })),
  stepProgress: z.array(z.object({
    slug: Slug, stepIndex: z.number().int().min(0), textHash: z.string(),
    checked: z.boolean(), checkedAt: z.string().nullable(),
  })),
  journals: z.array(z.object({
    slug: Slug, bodyMd: z.string(), timeTakenMin: z.number().int().nullable(),
    difficulty: z.number().int().min(1).max(5).nullable(),
    confidence: z.number().int().min(1).max(5).nullable(), updatedAt: z.string().nullable(),
  })),
  attachments: z.array(z.object({
    id: Uuid, slug: Slug, fileName: z.string().regex(/^[0-9a-f-]{36}\.(png|jpg|webp)$/),
    mime: Mime, bytes: z.number().int().min(0), createdAt: z.string(), dataBase64: z.string(),
  })),
  activity: z.array(z.object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slug: Slug, kind: z.string(), at: z.string(),
  })),
});
export type BackupV1 = z.infer<typeof BackupSchema>;
```

- [ ] **Step 4: Run to verify it passes, and typecheck**

Run: `npx vitest run shared && npx tsc -p shared --noEmit`
Expected: PASS (5 tests), tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): domain types and zod request/backup schemas"
```

---

### Task 3: Fixture generator and committed fixtures

The environment has no `/workspace/labs` (spec D1). This task generates the synthetic fixtures that every later test depends on.

**Files:**
- Create: `scripts/gen-fixtures.mjs`
- Create (generated): `tests/fixtures/labs/*.html` (7), `tests/fixtures/labs/lab-log.txt`, `tests/fixtures/malformed/*` (3)
- Create: `server/src/testing.ts`
- Test: `server/src/testing.test.ts` (fixture sanity)

**Interfaces:**
- Produces: `FIXTURES: string` (absolute path of `tests/fixtures`), `copyFixtures(opts?: { malformed?: boolean }): string` (returns a fresh temp dir holding copies of the good labs, `lab-log.txt`, and optionally the malformed files).

- [ ] **Step 1: Write the failing sanity test**

`server/src/testing.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { FIXTURES, copyFixtures } from './testing';

describe('fixtures', () => {
  it('has 7 labs and a log with 7 lines', () => {
    const html = fs.readdirSync(path.join(FIXTURES, 'labs')).filter((f) => f.endsWith('.html'));
    expect(html).toHaveLength(7);
    const log = fs.readFileSync(path.join(FIXTURES, 'labs', 'lab-log.txt'), 'utf8').trim().split('\n');
    expect(log).toHaveLength(7);
  });
  it('checkbox counts are 9/12/12/15/13/14/42', () => {
    const counts = fs.readdirSync(path.join(FIXTURES, 'labs')).filter((f) => f.endsWith('.html')).sort()
      .map((f) => (fs.readFileSync(path.join(FIXTURES, 'labs', f), 'utf8').match(/type="checkbox"/g) ?? []).length);
    expect(counts).toEqual([9, 12, 12, 15, 13, 14, 42]);
  });
  it('copyFixtures returns an independent temp dir', () => {
    const dir = copyFixtures({ malformed: true });
    expect(fs.readdirSync(dir)).toContain('lab-log.txt');
    expect(fs.readdirSync(dir)).toContain('2026-10-31-empty-lab.html');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/testing.test.ts`
Expected: FAIL (cannot resolve `./testing`).

- [ ] **Step 3: Write the generator**

`scripts/gen-fixtures.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tests/fixtures');
const labsDir = path.join(root, 'labs');
const badDir = path.join(root, 'malformed');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(labsDir, { recursive: true });
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

for (const l of LABS) fs.writeFileSync(path.join(labsDir, `${l.date}-${l.slug}.html`), build(l));
fs.writeFileSync(
  path.join(labsDir, 'lab-log.txt'),
  LABS.map((l) => `${l.date} | Lab ${String(l.n).padStart(2, '0')} | ${l.log} | ${l.slug}`).join('\n') + '\n',
);

fs.writeFileSync(
  path.join(badDir, '2026-10-30-malformed-lab.html'),
  '<html><head><title>Lab 08: Half Written</title></head><body><h1>Half Written</h1><h2>Steps<div><p>unclosed',
);
fs.writeFileSync(path.join(badDir, '2026-10-31-empty-lab.html'), '');
fs.writeFileSync(path.join(badDir, 'not-a-lab.html'), '<html><body><h1>Wrong filename</h1></body></html>');
console.log('Fixtures written to', root);
```

- [ ] **Step 4: Implement `server/src/testing.ts`**

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const FIXTURES = path.resolve(import.meta.dirname, '../../tests/fixtures');

export function copyFixtures(opts: { malformed?: boolean } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labs-'));
  fs.cpSync(path.join(FIXTURES, 'labs'), dir, { recursive: true });
  if (opts.malformed) fs.cpSync(path.join(FIXTURES, 'malformed'), dir, { recursive: true });
  return dir;
}
```

- [ ] **Step 5: Generate fixtures and run the test**

Run: `npm run fixtures && npx vitest run server/src/testing.test.ts`
Expected: prints "Fixtures written to …/tests/fixtures". PASS (3 tests). The counts assertion proves 9/12/12/15/13/14/42.

- [ ] **Step 6: Commit**

```bash
git add scripts tests server/src/testing.ts server/src/testing.test.ts
git commit -m "test: generate synthetic lab fixtures matching the real lab structure"
```

---

### Task 4: Lab HTML parser

**Files:**
- Create: `server/src/lib/hash.ts`, `server/src/ingest/parse.ts`
- Test: `server/src/ingest/parse.test.ts`

**Interfaces:**
- Produces: `sha1(s: string): string`, `sha256(b: Buffer | string): string`, `LAB_FILE_RE: RegExp`, `titleFromSlug(slug: string): string`, `type ParsedLab = Omit<Lab, 'topicLabel' | 'topics' | 'fileHash' | 'ingestedAt' | 'missingFile'>`, `parseLabHtml(html: string, fileName: string): ParsedLab` (throws only if `fileName` doesn't match `LAB_FILE_RE`).

- [ ] **Step 1: Write the failing test**

`server/src/ingest/parse.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/ingest/parse.test.ts`
Expected: FAIL (cannot resolve `./parse`).

- [ ] **Step 3: Implement `server/src/lib/hash.ts`**

```ts
import { createHash } from 'node:crypto';

export const sha1 = (s: string): string => createHash('sha1').update(s).digest('hex');
export const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');
```

- [ ] **Step 4: Implement `server/src/ingest/parse.ts`**

```ts
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
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run server/src/ingest/parse.test.ts`
Expected: PASS (7 `it.each` cases plus 7 other tests). If the Lab 7 time or step-section assertion fails, run `systematic-debugging` against the fixture HTML; don't loosen the assertion.

- [ ] **Step 6: Commit**

```bash
git add server/src/lib server/src/ingest/parse.ts server/src/ingest/parse.test.ts
git commit -m "feat(server): cheerio lab parser with section, step, time and fallback handling"
```

---

### Task 5: lab-log parser, topic classifier, step matching

**Files:**
- Create: `server/src/ingest/labLog.ts`, `server/src/ingest/topics.ts`, `server/src/ingest/stepMatch.ts`
- Test: `labLog.test.ts`, `topics.test.ts`, `stepMatch.test.ts` (same folder)

**Interfaces:**
- Produces: `LogEntry = { date: string; labNumber: number; topicLabel: string; slug: string }`, `parseLabLog(text: string): Map<string, LogEntry>` (keyed by slug).
- Produces: `classifyTopics(input: { topicLabel: string | null; tags: string[]; title: string }): Topic[]`.
- Produces: `ProgressRow = { stepIndex: number; textHash: string; checked: boolean; checkedAt: string | null }`, `remapProgress(old: ProgressRow[], steps: Step[]): ProgressRow[]`.

- [ ] **Step 1: Write the failing tests**

`labLog.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseLabLog } from './labLog';
import { FIXTURES } from '../testing';

describe('parseLabLog', () => {
  it('parses all 7 fixture lines', () => {
    const map = parseLabLog(fs.readFileSync(path.join(FIXTURES, 'labs', 'lab-log.txt'), 'utf8'));
    expect(map.size).toBe(7);
    expect(map.get('ad-user-onboarding')).toEqual({ date: '2026-10-23', labNumber: 1, topicLabel: 'AD users/groups', slug: 'ad-user-onboarding' });
    expect(map.get('windows-wont-wake-from-sleep')?.labNumber).toBe(7);
  });
  it('tolerates extra whitespace, blank lines, comments and pipes inside the label', () => {
    const map = parseLabLog('\n# note\n2026-10-30  |  Lab  08 |  DNS | DHCP, scopes  |  dns-scopes  \n');
    expect(map.get('dns-scopes')).toEqual({ date: '2026-10-30', labNumber: 8, topicLabel: 'DNS | DHCP, scopes', slug: 'dns-scopes' });
  });
  it('skips malformed lines', () => {
    expect(parseLabLog('garbage\n2026-10-30 | Lab x | y | z').size).toBe(0);
  });
});
```

`topics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyTopics } from './topics';

const c = (topicLabel: string | null, tags: string[] = [], title = '') => classifyTopics({ topicLabel, tags, title });

describe('classifyTopics', () => {
  it.each([
    ['AD users/groups', ['ad-gpo']],
    ['GPO basics', ['ad-gpo']],
    ['M365/Entra licensing', ['m365-entra']],
    ['Intune enrollment', ['intune']],
    ['PowerShell reporting', ['powershell']],
    ['Linux permissions', ['linux']],
    ['Windows troubleshooting, real-world', ['windows-troubleshooting']],
  ])('maps "%s"', (label, expected) => {
    expect(c(label)).toEqual(expected);
  });
  it('falls back to tags and title only when the label matches nothing', () => {
    expect(c(null, [], 'DNS and DHCP scopes')).toEqual(['dns-dhcp']);
    expect(c('Misc', ['Docker'], 'x')).toEqual(['docker']);
  });
  it('prefers the label over the title', () => {
    expect(c('Linux permissions', [], 'Active Directory tie-in')).toEqual(['linux']);
  });
  it('returns other when nothing matches', () => {
    expect(c('Soft skills', [], 'Communication')).toEqual(['other']);
  });
});
```

`stepMatch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { remapProgress, type ProgressRow } from './stepMatch';
import type { Step } from '@lab-ledger/shared';

const step = (index: number, textHash: string): Step => ({ index, key: `s#${index}`, textHash, text: textHash, section: '' });
const row = (stepIndex: number, textHash: string, checked = true): ProgressRow => ({ stepIndex, textHash, checked, checkedAt: checked ? 't' : null });

describe('remapProgress', () => {
  it('keeps progress when nothing changed', () => {
    const out = remapProgress([row(0, 'a'), row(1, 'b')], [step(0, 'a'), step(1, 'b')]);
    expect(out.map((r) => [r.stepIndex, r.checked])).toEqual([[0, true], [1, true]]);
  });
  it('follows a reordered step by hash', () => {
    const out = remapProgress([row(0, 'a', false), row(1, 'b', true)], [step(0, 'b'), step(1, 'a')]);
    expect(out.find((r) => r.stepIndex === 0)).toMatchObject({ textHash: 'b', checked: true });
    expect(out.find((r) => r.stepIndex === 1)).toMatchObject({ textHash: 'a', checked: false });
  });
  it('falls back to index when the text was edited', () => {
    const out = remapProgress([row(0, 'a'), row(1, 'b')], [step(0, 'a'), step(1, 'b-edited')]);
    expect(out.find((r) => r.stepIndex === 1)).toMatchObject({ textHash: 'b-edited', checked: true });
  });
  it('drops rows for removed steps and does not invent rows for new ones', () => {
    const out = remapProgress([row(0, 'a'), row(1, 'b'), row(2, 'c')], [step(0, 'a'), step(1, 'c')]);
    expect(out.map((r) => r.stepIndex)).toEqual([0, 1]);
    expect(out.find((r) => r.stepIndex === 1)?.textHash).toBe('c');
  });
  it('matches duplicate hashes in order', () => {
    const out = remapProgress([row(0, 'x', true), row(1, 'x', false)], [step(0, 'x'), step(1, 'x')]);
    expect(out.map((r) => r.checked)).toEqual([true, false]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/src/ingest/labLog.test.ts server/src/ingest/topics.test.ts server/src/ingest/stepMatch.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement the three modules**

`labLog.ts`:

```ts
export interface LogEntry {
  date: string;
  labNumber: number;
  topicLabel: string;
  slug: string;
}

const LINE_RE = /^(\d{4}-\d{2}-\d{2})\s*\|\s*Lab\s+(\d+)\s*\|\s*(.+?)\s*\|\s*([a-z0-9-]+)\s*$/;

export function parseLabLog(text: string): Map<string, LogEntry> {
  const out = new Map<string, LogEntry>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    out.set(m[4], { date: m[1], labNumber: Number(m[2]), topicLabel: m[3], slug: m[4] });
  }
  return out;
}
```

`topics.ts`:

```ts
import type { RotationTopic, Topic } from '@lab-ledger/shared';

const RULES: [RotationTopic, RegExp][] = [
  ['ad-gpo', /\b(ad|active directory|gpo|group policy|domain controller)\b/i],
  ['m365-entra', /\b(entra|m365|microsoft 365|office 365|graph|azure ad)\b/i],
  ['intune', /\b(intune|mdm|autopilot|endpoint manager)\b/i],
  ['windows-troubleshooting', /\b(windows|troubleshoot\w*|bsod|event viewer)\b/i],
  ['powershell', /\b(powershell|pwsh)\b/i],
  ['linux', /\b(linux|ubuntu|bash|chmod)\b/i],
  ['networking', /\b(network\w*|tcp|vlan|subnet\w*|ping)\b/i],
  ['dns-dhcp', /\b(dns|dhcp)\b/i],
  ['backups', /\b(backup\w*|restore|recovery)\b/i],
  ['security-hardening', /\b(hardening|security|bitlocker|firewall|mfa)\b/i],
  ['ticket-writeups', /\b(ticket\w*|write-?up)\b/i],
  ['docker', /\b(docker|container\w*|compose)\b/i],
];

const match = (text: string): RotationTopic[] => RULES.filter(([, re]) => re.test(text)).map(([t]) => t);

export function classifyTopics(input: { topicLabel: string | null; tags: string[]; title: string }): Topic[] {
  const fromLabel = input.topicLabel ? match(input.topicLabel) : [];
  if (fromLabel.length) return fromLabel;
  const fromRest = match(`${input.tags.join(' ')} ${input.title}`);
  return fromRest.length ? fromRest : ['other'];
}
```

`stepMatch.ts`:

```ts
import type { Step } from '@lab-ledger/shared';

export interface ProgressRow {
  stepIndex: number;
  textHash: string;
  checked: boolean;
  checkedAt: string | null;
}

export function remapProgress(old: ProgressRow[], steps: Step[]): ProgressRow[] {
  const byHash = new Map<string, ProgressRow[]>();
  for (const r of [...old].sort((a, b) => a.stepIndex - b.stepIndex)) {
    const list = byHash.get(r.textHash) ?? [];
    list.push(r);
    byHash.set(r.textHash, list);
  }
  const used = new Set<ProgressRow>();
  const out = new Map<number, ProgressRow>();

  for (const s of steps) {
    const hit = byHash.get(s.textHash)?.find((r) => !used.has(r));
    if (hit) {
      used.add(hit);
      out.set(s.index, { ...hit, stepIndex: s.index });
    }
  }
  const oldByIndex = new Map(old.map((r) => [r.stepIndex, r]));
  for (const s of steps) {
    if (out.has(s.index)) continue;
    const r = oldByIndex.get(s.index);
    if (r && !used.has(r)) {
      used.add(r);
      out.set(s.index, { ...r, stepIndex: s.index, textHash: s.textHash });
    }
  }
  return [...out.values()].sort((a, b) => a.stepIndex - b.stepIndex);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run server/src/ingest`
Expected: PASS for parse, labLog, topics, and stepMatch tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/ingest
git commit -m "feat(server): lab-log parser, topic classifier, and hash-first step progress remapping"
```

---

### Task 6: SQLite schema and repository

**Files:**
- Create: `server/src/lib/time.ts`, `server/src/db/schema.ts`, `server/src/db/open.ts`, `server/src/db/repo.ts`
- Test: `server/src/lib/time.test.ts`, `server/src/db/repo.test.ts`

**Interfaces:**
- Produces from `lib/time.ts`: `dayInTz(d: Date, tz: string): string` (`YYYY-MM-DD`), `hhmmInTz(d: Date, tz: string): string` (`HH:MM`, 24 h).
- Produces from `db/open.ts`: `type Db = Database.Database`, `openDb(file: string): Db` (use `':memory:'` in tests).
- Produces from `db/repo.ts` (all take `db` first):
  - `upsertLab(db, lab: Lab): void`, `getLab(db, slug): Lab | null`, `listLabs(db): Lab[]` (ordered by date, labNumber, slug), `markMissing(db, slug): void`
  - `getState(db, slug): LabState`, `setStatus(db, slug, status: LabStatus, nowIso: string): LabState`
  - `getProgressRows(db, slug): ProgressRow[]`, `replaceProgress(db, slug, rows: ProgressRow[]): void`, `setStep(db, slug, index: number, textHash: string, checked: boolean, nowIso: string): void`, `getChecked(db, slug): number[]`
  - `getJournal(db, slug): Journal | null`, `putJournal(db, slug, j: Omit<Journal, 'updatedAt'>, nowIso: string): Journal`
  - `insertAttachment(db, a: {id; slug; fileName; mime; bytes; createdAt}): void`, `getAttachment(db, id): {id; slug; fileName; mime; bytes; createdAt} | null`
  - `addActivity(db, day: string, slug: string, kind: 'step' | 'completed' | 'skipped', at: string): void`, `activityDays(db): { active: string[]; skipped: string[] }`
  - `listSummaries(db): LabSummary[]`

- [ ] **Step 1: Write the failing tests**

`server/src/lib/time.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dayInTz, hhmmInTz } from './time';

describe('time helpers', () => {
  it('computes the New York day across the UTC boundary', () => {
    expect(dayInTz(new Date('2026-10-30T02:00:00Z'), 'America/New_York')).toBe('2026-10-29');
    expect(dayInTz(new Date('2026-10-30T05:00:00Z'), 'America/New_York')).toBe('2026-10-30');
  });
  it('formats 24h time in the zone', () => {
    expect(hhmmInTz(new Date('2026-10-29T13:20:00Z'), 'America/New_York')).toBe('09:20');
    expect(hhmmInTz(new Date('2026-10-29T04:05:00Z'), 'America/New_York')).toBe('00:05');
  });
});
```

`server/src/db/repo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, type Db } from './open';
import * as repo from './repo';
import type { Lab } from '@lab-ledger/shared';

const lab = (slug: string, date: string, n: number | null, steps = 2): Lab => ({
  slug, date, labNumber: n, title: `T ${slug}`, topicLabel: 'x', topics: ['linux'], tags: [], timeEstimateMin: null,
  scenarioText: null, prerequisites: [],
  steps: Array.from({ length: steps }, (_, i) => ({ index: i, key: `${slug}#${i}`, textHash: `h${i}`, text: `s${i}`, section: '' })),
  questions: [], sections: [], fileName: `${date}-${slug}.html`, fileHash: 'f', parseStatus: 'ok', ingestedAt: 'now',
});

let db: Db;
beforeEach(() => { db = openDb(':memory:'); });

describe('repo', () => {
  it('creates the Phase 1 tables', () => {
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['labs', 'lab_state', 'step_progress', 'journals', 'attachments', 'activity']));
  });
  it('upserts and orders labs by date then number', () => {
    repo.upsertLab(db, lab('b', '2026-10-24', 2));
    repo.upsertLab(db, lab('a', '2026-10-23', 1));
    repo.upsertLab(db, lab('a', '2026-10-23', 1));
    expect(repo.listLabs(db).map((l) => l.slug)).toEqual(['a', 'b']);
    expect(repo.getLab(db, 'a')?.steps).toHaveLength(2);
    expect(repo.getLab(db, 'zzz')).toBeNull();
  });
  it('marks missing files', () => {
    repo.upsertLab(db, lab('a', '2026-10-23', 1));
    repo.markMissing(db, 'a');
    expect(repo.getLab(db, 'a')?.missingFile).toBe(true);
  });
  it('tracks status transitions with timestamps', () => {
    expect(repo.getState(db, 'a').status).toBe('not_started');
    const s1 = repo.setStatus(db, 'a', 'in_progress', 't1');
    expect(s1).toMatchObject({ status: 'in_progress', startedAt: 't1', completedAt: null });
    const s2 = repo.setStatus(db, 'a', 'completed', 't2');
    expect(s2).toMatchObject({ startedAt: 't1', completedAt: 't2' });
    expect(repo.setStatus(db, 'a', 'in_progress', 't3').completedAt).toBeNull();
  });
  it('persists step toggles', () => {
    repo.setStep(db, 'a', 1, 'h1', true, 't');
    repo.setStep(db, 'a', 0, 'h0', true, 't');
    repo.setStep(db, 'a', 1, 'h1', false, 't2');
    expect(repo.getChecked(db, 'a')).toEqual([0]);
    expect(repo.getProgressRows(db, 'a')).toHaveLength(2);
  });
  it('round-trips a journal and enforces rating bounds', () => {
    expect(repo.getJournal(db, 'a')).toBeNull();
    const j = repo.putJournal(db, 'a', { bodyMd: 'hi', timeTakenMin: 30, difficulty: 3, confidence: 4 }, 't');
    expect(j).toEqual({ bodyMd: 'hi', timeTakenMin: 30, difficulty: 3, confidence: 4, updatedAt: 't' });
    expect(() => repo.putJournal(db, 'a', { bodyMd: '', timeTakenMin: null, difficulty: 9, confidence: null }, 't')).toThrow();
  });
  it('summarises labs with progress and notes', () => {
    repo.upsertLab(db, lab('a', '2026-10-23', 1, 3));
    repo.setStep(db, 'a', 0, 'h0', true, 't');
    repo.putJournal(db, 'a', { bodyMd: 'notes', timeTakenMin: null, difficulty: null, confidence: null }, 't');
    expect(repo.listSummaries(db)[0]).toMatchObject({ slug: 'a', stepsTotal: 3, stepsChecked: 1, hasNotes: true, status: 'not_started' });
  });
  it('separates active and skipped activity days', () => {
    repo.addActivity(db, '2026-10-23', 'a', 'step', 't');
    repo.addActivity(db, '2026-10-24', 'b', 'skipped', 't');
    expect(repo.activityDays(db)).toEqual({ active: ['2026-10-23'], skipped: ['2026-10-24'] });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/src/lib server/src/db`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `lib/time.ts`**

```ts
export function dayInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function hhmmInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}
```

- [ ] **Step 4: Implement `db/schema.ts` and `db/open.ts`**

`schema.ts`:

```ts
export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS labs (
  slug TEXT PRIMARY KEY, date TEXT NOT NULL, lab_number INTEGER, title TEXT NOT NULL,
  topic_label TEXT, topics TEXT, tags TEXT, time_low INTEGER, time_high INTEGER,
  parsed_json TEXT NOT NULL, file_name TEXT, file_hash TEXT, parse_status TEXT,
  missing_file INTEGER DEFAULT 0, ingested_at TEXT
);
CREATE TABLE IF NOT EXISTS lab_state (
  slug TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'not_started',
  started_at TEXT, completed_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS step_progress (
  slug TEXT NOT NULL, step_index INTEGER NOT NULL, text_hash TEXT, checked INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT, PRIMARY KEY (slug, step_index)
);
CREATE TABLE IF NOT EXISTS journals (
  slug TEXT PRIMARY KEY, body_md TEXT, time_taken_min INTEGER,
  difficulty INTEGER CHECK(difficulty BETWEEN 1 AND 5),
  confidence INTEGER CHECK(confidence BETWEEN 1 AND 5), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL, file_name TEXT NOT NULL, mime TEXT NOT NULL,
  bytes INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY, day TEXT NOT NULL, slug TEXT NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_day ON activity(day);
`;
```

`open.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA_V1 } from './schema';

export type Db = Database.Database;

export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version < 1) {
    db.exec(SCHEMA_V1);
    db.pragma('user_version = 1');
  }
  return db;
}
```

- [ ] **Step 5: Implement `db/repo.ts`**

```ts
import type { Journal, Lab, LabState, LabStatus, LabSummary } from '@lab-ledger/shared';
import type { Db } from './open';
import type { ProgressRow } from '../ingest/stepMatch';

interface LabRow { parsed_json: string; missing_file: number }

const hydrate = (r: LabRow): Lab => ({ ...(JSON.parse(r.parsed_json) as Lab), missingFile: !!r.missing_file });

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
    slug: lab.slug, date: lab.date, labNumber: lab.labNumber, title: lab.title, topicLabel: lab.topicLabel,
    topics: JSON.stringify(lab.topics), tags: JSON.stringify(lab.tags),
    timeLow: lab.timeEstimateMin?.low ?? null, timeHigh: lab.timeEstimateMin?.high ?? null,
    parsed: JSON.stringify(lab), fileName: lab.fileName, fileHash: lab.fileHash, parseStatus: lab.parseStatus,
    missing: lab.missingFile ? 1 : 0, ingestedAt: lab.ingestedAt,
  });
}

export function getLab(db: Db, slug: string): Lab | null {
  const r = db.prepare('SELECT parsed_json, missing_file FROM labs WHERE slug=?').get(slug) as LabRow | undefined;
  return r ? hydrate(r) : null;
}

export function listLabs(db: Db): Lab[] {
  const rows = db.prepare('SELECT parsed_json, missing_file FROM labs ORDER BY date ASC, COALESCE(lab_number, 9999) ASC, slug ASC').all() as LabRow[];
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
  const rows = db.prepare('SELECT step_index, text_hash, checked, checked_at FROM step_progress WHERE slug=? ORDER BY step_index').all(slug) as
    { step_index: number; text_hash: string; checked: number; checked_at: string | null }[];
  return rows.map((r) => ({ stepIndex: r.step_index, textHash: r.text_hash, checked: !!r.checked, checkedAt: r.checked_at }));
}

export function replaceProgress(db: Db, slug: string, rows: ProgressRow[]): void {
  db.prepare('DELETE FROM step_progress WHERE slug=?').run(slug);
  const ins = db.prepare('INSERT INTO step_progress (slug, step_index, text_hash, checked, checked_at) VALUES (?,?,?,?,?)');
  for (const r of rows) ins.run(slug, r.stepIndex, r.textHash, r.checked ? 1 : 0, r.checkedAt);
}

export function setStep(db: Db, slug: string, index: number, textHash: string, checked: boolean, nowIso: string): void {
  db.prepare(
    `INSERT INTO step_progress (slug, step_index, text_hash, checked, checked_at) VALUES (?,?,?,?,?)
     ON CONFLICT(slug, step_index) DO UPDATE SET text_hash=excluded.text_hash, checked=excluded.checked, checked_at=excluded.checked_at`,
  ).run(slug, index, textHash, checked ? 1 : 0, checked ? nowIso : null);
}

export function getChecked(db: Db, slug: string): number[] {
  return (db.prepare('SELECT step_index FROM step_progress WHERE slug=? AND checked=1 ORDER BY step_index').all(slug) as { step_index: number }[]).map((r) => r.step_index);
}

export function getJournal(db: Db, slug: string): Journal | null {
  const r = db.prepare('SELECT body_md, time_taken_min, difficulty, confidence, updated_at FROM journals WHERE slug=?').get(slug) as
    | { body_md: string; time_taken_min: number | null; difficulty: number | null; confidence: number | null; updated_at: string | null }
    | undefined;
  return r ? { bodyMd: r.body_md ?? '', timeTakenMin: r.time_taken_min, difficulty: r.difficulty, confidence: r.confidence, updatedAt: r.updated_at } : null;
}

export function putJournal(db: Db, slug: string, j: Omit<Journal, 'updatedAt'>, nowIso: string): Journal {
  db.prepare(
    `INSERT INTO journals (slug, body_md, time_taken_min, difficulty, confidence, updated_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(slug) DO UPDATE SET body_md=excluded.body_md, time_taken_min=excluded.time_taken_min,
       difficulty=excluded.difficulty, confidence=excluded.confidence, updated_at=excluded.updated_at`,
  ).run(slug, j.bodyMd, j.timeTakenMin, j.difficulty, j.confidence, nowIso);
  return getJournal(db, slug)!;
}

export interface AttachmentRow { id: string; slug: string; fileName: string; mime: string; bytes: number; createdAt: string }

export function insertAttachment(db: Db, a: AttachmentRow): void {
  db.prepare('INSERT INTO attachments (id, slug, file_name, mime, bytes, created_at) VALUES (?,?,?,?,?,?)').run(a.id, a.slug, a.fileName, a.mime, a.bytes, a.createdAt);
}

export function getAttachment(db: Db, id: string): AttachmentRow | null {
  const r = db.prepare('SELECT id, slug, file_name, mime, bytes, created_at FROM attachments WHERE id=?').get(id) as
    { id: string; slug: string; file_name: string; mime: string; bytes: number; created_at: string } | undefined;
  return r ? { id: r.id, slug: r.slug, fileName: r.file_name, mime: r.mime, bytes: r.bytes, createdAt: r.created_at } : null;
}

export function addActivity(db: Db, day: string, slug: string, kind: 'step' | 'completed' | 'skipped', at: string): void {
  db.prepare('INSERT INTO activity (day, slug, kind, at) VALUES (?,?,?,?)').run(day, slug, kind, at);
}

export function activityDays(db: Db): { active: string[]; skipped: string[] } {
  const rows = db.prepare('SELECT DISTINCT day, kind FROM activity ORDER BY day').all() as { day: string; kind: string }[];
  const active = [...new Set(rows.filter((r) => r.kind !== 'skipped').map((r) => r.day))];
  const skipped = [...new Set(rows.filter((r) => r.kind === 'skipped').map((r) => r.day))];
  return { active, skipped };
}

export function listSummaries(db: Db): LabSummary[] {
  const states = new Map((db.prepare('SELECT slug, status FROM lab_state').all() as { slug: string; status: LabStatus }[]).map((r) => [r.slug, r.status]));
  const counts = new Map((db.prepare('SELECT slug, SUM(checked) AS c FROM step_progress GROUP BY slug').all() as { slug: string; c: number }[]).map((r) => [r.slug, r.c]));
  const notes = new Set((db.prepare("SELECT slug FROM journals WHERE TRIM(COALESCE(body_md,'')) <> ''").all() as { slug: string }[]).map((r) => r.slug));
  return listLabs(db).map((l) => ({
    slug: l.slug, date: l.date, labNumber: l.labNumber, title: l.title, topicLabel: l.topicLabel, topics: l.topics,
    tags: l.tags, timeEstimateMin: l.timeEstimateMin, parseStatus: l.parseStatus, missingFile: !!l.missingFile,
    status: states.get(l.slug) ?? 'not_started', stepsTotal: l.steps.length, stepsChecked: counts.get(l.slug) ?? 0,
    hasNotes: notes.has(l.slug),
  }));
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run server/src/lib server/src/db`
Expected: PASS (2 time tests, 8 repo tests). If `better-sqlite3` fails to load, run `npm rebuild better-sqlite3` and rerun.

- [ ] **Step 7: Commit**

```bash
git add server/src/lib server/src/db
git commit -m "feat(server): SQLite schema, migrations and repository"
```

---

### Task 7: Scan pipeline and ingest service

**Files:**
- Create: `server/src/events.ts`, `server/src/ingest/scan.ts`, `server/src/ingest/service.ts`
- Test: `server/src/ingest/scan.test.ts`

**Interfaces:**
- Consumes: `parseLabHtml`, `LAB_FILE_RE`, `parseLabLog`, `classifyTopics`, `remapProgress`, `sha256`, and the repo functions from Task 6.
- Produces: `ScanResult = { added: string[]; updated: string[]; removed: string[]; warnings: string[] }`, `scanLabs(db: Db, labsDir: string, now?: () => Date): ScanResult`.
- Produces: `class LabEvents { publish(e: LabEventPayload): void; subscribe(fn: (e: LabEventPayload) => void): () => void }`.
- Produces: `createIngestService(o: { db: Db; labsDir: string; events: LabEvents }): { rescan(): ScanResult }`. It publishes `lab:added|updated|removed` with `title`.

- [ ] **Step 1: Write the failing test**

`server/src/ingest/scan.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { openDb } from '../db/open';
import * as repo from '../db/repo';
import { scanLabs } from './scan';
import { createIngestService } from './service';
import { LabEvents } from '../events';
import { copyFixtures } from '../testing';
import type { LabEventPayload } from '@lab-ledger/shared';

const hashDir = (dir: string) => {
  const h = createHash('sha256');
  for (const f of fs.readdirSync(dir).sort()) h.update(f).update(fs.readFileSync(path.join(dir, f)));
  return h.digest('hex');
};

describe('scanLabs', () => {
  it('ingests the 7 fixture labs in date order with numbers 1-7 and topics', () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    const r = scanLabs(db, dir);
    expect(r.added).toHaveLength(7);
    const labs = repo.listLabs(db);
    expect(labs.map((l) => l.labNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(labs.map((l) => l.date)).toEqual([...labs.map((l) => l.date)].sort());
    expect(labs.map((l) => l.steps.length)).toEqual([9, 12, 12, 15, 13, 14, 42]);
    expect(labs[6].topics).toEqual(['windows-troubleshooting']);
    expect(labs[2].topics).toEqual(['m365-entra']);
    expect(labs[0].topicLabel).toBe('AD users/groups');
  });

  it('lists malformed files without crashing and ignores bad filenames', () => {
    const dir = copyFixtures({ malformed: true });
    const db = openDb(':memory:');
    const r = scanLabs(db, dir);
    expect(r.added).toHaveLength(9);
    expect(repo.getLab(db, 'malformed-lab')?.parseStatus).toBe('partial');
    expect(repo.getLab(db, 'empty-lab')?.parseStatus).toBe('failed');
    expect(repo.getLab(db, 'not-a-lab')).toBeNull();
  });

  it('is idempotent and skips unchanged files', () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    scanLabs(db, dir);
    const r = scanLabs(db, dir);
    expect(r).toEqual({ added: [], updated: [], removed: [], warnings: [] });
  });

  it('detects added, changed and removed files', () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    scanLabs(db, dir);
    fs.writeFileSync(path.join(dir, '2026-10-30-new-one.html'), '<html><head><title>Lab 08: New One</title></head><body><h1>New One</h1><label><input type="checkbox"> a</label></body></html>');
    fs.appendFileSync(path.join(dir, '2026-10-23-ad-user-onboarding.html'), '\n<!-- edit -->');
    fs.rmSync(path.join(dir, '2026-10-24-gpo-drive-mapping.html'));
    const r = scanLabs(db, dir);
    expect(r.added).toEqual(['new-one']);
    expect(r.updated).toEqual(['ad-user-onboarding']);
    expect(r.removed).toEqual(['gpo-drive-mapping']);
    expect(repo.getLab(db, 'gpo-drive-mapping')?.missingFile).toBe(true);
  });

  it('creates a placeholder for a log line without a file', () => {
    const dir = copyFixtures();
    fs.appendFileSync(path.join(dir, 'lab-log.txt'), '2026-10-30 | Lab 08 | DNS basics | dns-basics\n');
    const db = openDb(':memory:');
    scanLabs(db, dir);
    const lab = repo.getLab(db, 'dns-basics');
    expect(lab).toMatchObject({ missingFile: true, labNumber: 8, title: 'DNS basics' });
  });

  it('ingests a file with no log line using the number from the title', () => {
    const dir = copyFixtures();
    fs.writeFileSync(path.join(dir, '2026-10-30-no-log.html'), '<html><head><title>Lab 09: No Log</title></head><body><h1>No Log</h1><label><input type="checkbox"> a</label></body></html>');
    const db = openDb(':memory:');
    scanLabs(db, dir);
    expect(repo.getLab(db, 'no-log')).toMatchObject({ labNumber: 9, topicLabel: null });
  });

  it('keeps the newest file when two share a slug', () => {
    const dir = copyFixtures();
    const older = path.join(dir, '2026-10-20-ad-user-onboarding.html');
    fs.copyFileSync(path.join(dir, '2026-10-23-ad-user-onboarding.html'), older);
    fs.utimesSync(older, new Date('2020-01-01'), new Date('2020-01-01'));
    const db = openDb(':memory:');
    const r = scanLabs(db, dir);
    expect(r.warnings.join(' ')).toMatch(/Duplicate slug ad-user-onboarding/);
    expect(repo.getLab(db, 'ad-user-onboarding')?.date).toBe('2026-10-23');
  });

  it('keeps progress when a lab is re-parsed with a reordered step', () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    scanLabs(db, dir);
    const lab = repo.getLab(db, 'ad-user-onboarding')!;
    repo.setStep(db, lab.slug, 0, lab.steps[0].textHash, true, 't');
    const file = path.join(dir, '2026-10-23-ad-user-onboarding.html');
    const html = fs.readFileSync(file, 'utf8');
    const a = html.indexOf('<div class="card step">');
    const b = html.indexOf('<div class="card step">', a + 1);
    const c = html.indexOf('<div class="card step">', b + 1);
    const swapped = html.slice(0, a) + html.slice(b, c) + html.slice(a, b) + html.slice(c);
    fs.writeFileSync(file, swapped);
    scanLabs(db, dir);
    const after = repo.getLab(db, lab.slug)!;
    expect(after.steps[1].textHash).toBe(lab.steps[0].textHash);
    expect(repo.getChecked(db, lab.slug)).toEqual([1]);
  });

  it('never modifies the source files', () => {
    const dir = copyFixtures({ malformed: true });
    const before = hashDir(dir);
    const db = openDb(':memory:');
    scanLabs(db, dir);
    scanLabs(db, dir);
    expect(hashDir(dir)).toBe(before);
  });
});

describe('createIngestService', () => {
  it('publishes events with titles', () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    const events = new LabEvents();
    const seen: LabEventPayload[] = [];
    events.subscribe((e) => seen.push(e));
    const svc = createIngestService({ db, labsDir: dir, events });
    svc.rescan();
    expect(seen.filter((e) => e.type === 'lab:added')).toHaveLength(7);
    expect(seen[0].title).toBeTruthy();
    fs.rmSync(path.join(dir, '2026-10-24-gpo-drive-mapping.html'));
    svc.rescan();
    expect(seen.at(-1)).toMatchObject({ type: 'lab:removed', slug: 'gpo-drive-mapping' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/ingest/scan.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `events.ts`**

```ts
import { EventEmitter } from 'node:events';
import type { LabEventPayload } from '@lab-ledger/shared';

export class LabEvents {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  publish(e: LabEventPayload): void {
    this.emitter.emit('event', e);
  }

  subscribe(fn: (e: LabEventPayload) => void): () => void {
    this.emitter.on('event', fn);
    return () => this.emitter.off('event', fn);
  }
}
```

- [ ] **Step 4: Implement `ingest/scan.ts`**

```ts
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
          topicLabel: null, topics: [], fileHash, ingestedAt: now().toISOString(), missingFile: false,
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
        slug, date: entry.date, labNumber: entry.labNumber, title: entry.topicLabel, topicLabel: entry.topicLabel,
        topics: classifyTopics({ topicLabel: entry.topicLabel, tags: [], title: entry.topicLabel }),
        tags: [], timeEstimateMin: null, scenarioText: null, prerequisites: [], steps: [], questions: [], sections: [],
        fileName: '', fileHash: '', parseStatus: 'failed', ingestedAt: now().toISOString(), missingFile: true,
      });
      result.added.push(slug);
    }
  });
  tx();

  return result;
}
```

Placeholder labs reported as `added` get a `lab:added` event. That's acceptable. The UI shows them with a "file missing" notice.

- [ ] **Step 5: Implement `ingest/service.ts`**

```ts
import type { Db } from '../db/open';
import { getLab } from '../db/repo';
import type { LabEvents } from '../events';
import { scanLabs, type ScanResult } from './scan';

export interface IngestService {
  rescan(): ScanResult;
}

export function createIngestService(o: { db: Db; labsDir: string; events: LabEvents }): IngestService {
  return {
    rescan() {
      const r = scanLabs(o.db, o.labsDir);
      const emit = (type: 'lab:added' | 'lab:updated' | 'lab:removed', slug: string) =>
        o.events.publish({ type, slug, title: getLab(o.db, slug)?.title });
      r.added.forEach((s) => emit('lab:added', s));
      r.updated.forEach((s) => emit('lab:updated', s));
      r.removed.forEach((s) => emit('lab:removed', s));
      return r;
    },
  };
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run server/src/ingest`
Expected: PASS. The reordered-step test is the most fragile. If it fails, check the fixture's `<div class="card step">` boundaries with `systematic-debugging`; don't weaken the assertion.

- [ ] **Step 7: Commit**

```bash
git add server/src/events.ts server/src/ingest
git commit -m "feat(server): idempotent lab scan with log merge, progress remap and event publishing"
```

---

### Task 8: Folder watcher and scheduler

**Files:**
- Create: `server/src/ingest/watch.ts`, `server/src/scheduler.ts`
- Test: `server/src/ingest/watch.test.ts`

**Interfaces:**
- Produces: `watchLabs(o: { labsDir: string; stabilityMs: number; debounceMs?: number; onChange: () => void }): { ready: Promise<void>; close(): Promise<void> }`.
- Produces: `startScheduler(rescan: () => void, tz: string, now?: () => Date): () => void` (returns a stop function).

- [ ] **Step 1: Write the failing integration test**

`server/src/ingest/watch.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { openDb } from '../db/open';
import { LabEvents } from '../events';
import { createIngestService } from './service';
import { watchLabs } from './watch';
import { copyFixtures } from '../testing';
import type { LabEventPayload } from '@lab-ledger/shared';

const waitFor = async (pred: () => boolean, ms: number) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return pred();
};

const NEW_LAB = '<html><head><title>Lab 08: Watch Me</title></head><body><h1>Watch Me</h1><label><input type="checkbox"> a</label></body></html>';

let closer: (() => Promise<void>) | null = null;
afterEach(async () => { await closer?.(); closer = null; });

describe('watchLabs', () => {
  it('emits add, change and remove events within 5 seconds', async () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    const events = new LabEvents();
    const ingest = createIngestService({ db, labsDir: dir, events });
    ingest.rescan();
    const seen: LabEventPayload[] = [];
    events.subscribe((e) => seen.push(e));

    const w = watchLabs({ labsDir: dir, stabilityMs: 200, debounceMs: 100, onChange: () => ingest.rescan() });
    closer = w.close;
    await w.ready;

    const file = path.join(dir, '2026-10-30-watch-me.html');
    fs.writeFileSync(file, NEW_LAB);
    expect(await waitFor(() => seen.some((e) => e.type === 'lab:added' && e.slug === 'watch-me'), 5000)).toBe(true);

    fs.appendFileSync(file, '\n<!-- changed -->');
    expect(await waitFor(() => seen.some((e) => e.type === 'lab:updated' && e.slug === 'watch-me'), 5000)).toBe(true);

    fs.rmSync(file);
    expect(await waitFor(() => seen.some((e) => e.type === 'lab:removed' && e.slug === 'watch-me'), 5000)).toBe(true);
  });

  it('reacts to lab-log.txt changes', async () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    const events = new LabEvents();
    const ingest = createIngestService({ db, labsDir: dir, events });
    ingest.rescan();
    const seen: LabEventPayload[] = [];
    events.subscribe((e) => seen.push(e));
    const w = watchLabs({ labsDir: dir, stabilityMs: 200, debounceMs: 100, onChange: () => ingest.rescan() });
    closer = w.close;
    await w.ready;
    fs.appendFileSync(path.join(dir, 'lab-log.txt'), '2026-10-30 | Lab 08 | DNS basics | dns-basics\n');
    expect(await waitFor(() => seen.some((e) => e.slug === 'dns-basics'), 5000)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/ingest/watch.test.ts`
Expected: FAIL (cannot resolve `./watch`).

- [ ] **Step 3: Implement `ingest/watch.ts`**

```ts
import path from 'node:path';
import chokidar from 'chokidar';
import { LAB_FILE_RE } from './parse';

export function watchLabs(o: {
  labsDir: string;
  stabilityMs: number;
  debounceMs?: number;
  onChange: () => void;
}): { ready: Promise<void>; close(): Promise<void> } {
  const watcher = chokidar.watch(o.labsDir, {
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: o.stabilityMs, pollInterval: 100 },
  });

  let timer: NodeJS.Timeout | null = null;
  const trigger = (file: string) => {
    const base = path.basename(file);
    if (!LAB_FILE_RE.test(base) && base !== 'lab-log.txt') return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        o.onChange();
      } catch (err) {
        console.error('rescan failed', err);
      }
    }, o.debounceMs ?? 300);
  };
  watcher.on('add', trigger).on('change', trigger).on('unlink', trigger);

  const ready = new Promise<void>((resolve) => watcher.once('ready', () => resolve()));
  return {
    ready,
    close: async () => {
      if (timer) clearTimeout(timer);
      await watcher.close();
    },
  };
}
```

- [ ] **Step 4: Implement `scheduler.ts`**

```ts
import { dayInTz, hhmmInTz } from './lib/time';

export function startScheduler(rescan: () => void, tz: string, now: () => Date = () => new Date()): () => void {
  const safe = () => {
    try {
      rescan();
    } catch (err) {
      console.error('scheduled rescan failed', err);
    }
  };
  const everyFifteen = setInterval(safe, 15 * 60_000);
  let lastDay = '';
  const tick = setInterval(() => {
    const d = now();
    const day = dayInTz(d, tz);
    if (hhmmInTz(d, tz) === '09:20' && lastDay !== day) {
      lastDay = day;
      safe();
    }
  }, 30_000);
  return () => {
    clearInterval(everyFifteen);
    clearInterval(tick);
  };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run server/src/ingest/watch.test.ts`
Expected: PASS (2 tests, each event within 5 s). If flaky on a slow filesystem, raise only the test's `stabilityMs`; don't raise the 5 s bound.

- [ ] **Step 6: Commit**

```bash
git add server/src/ingest/watch.ts server/src/ingest/watch.test.ts server/src/scheduler.ts
git commit -m "feat(server): chokidar folder watcher and scheduled rescans"
```

---

### Task 9: HTTP app, lab routes, status and step progress

**Files:**
- Create: `server/src/app.ts`, `server/src/routes/labs.ts`, `server/src/routes/progress.ts`
- Test: `server/src/api.test.ts`

**Interfaces:**
- Produces: `interface AppContext { config: Config; db: Db; events: LabEvents; ingest: IngestService; now: () => Date }`.
- Produces: `buildApp(ctx: AppContext, opts?: { clientDir?: string | null }): Promise<FastifyInstance>`.
- Produces route registrars `registerLabRoutes(app, ctx)`, `registerProgressRoutes(app, ctx)`. Later tasks add `registerJournalRoutes`, `registerAttachmentRoutes`, `registerStatsRoutes`, `registerBackupRoutes` with the same signature, and call them from `buildApp`.
- Produces test helper `makeTestApp(opts?: { malformed?: boolean; now?: Date })` in `server/src/api.test.ts`. Later API tests import it from `server/src/testing-app.ts`. **Create `server/src/testing-app.ts` in this task** with the same contents, and have `api.test.ts` import it.

- [ ] **Step 1: Write the failing tests**

`server/src/testing-app.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp, type AppContext } from './app';
import { loadConfig } from './config';
import { openDb } from './db/open';
import { LabEvents } from './events';
import { createIngestService } from './ingest/service';
import { copyFixtures } from './testing';

export async function makeTestApp(opts: { malformed?: boolean; now?: Date } = {}) {
  const labsDir = copyFixtures({ malformed: opts.malformed });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-'));
  const config = { ...loadConfig({}), labsDir, dataDir };
  const db = openDb(':memory:');
  const events = new LabEvents();
  const ingest = createIngestService({ db, labsDir, events });
  ingest.rescan();
  let current = opts.now ?? new Date('2026-10-29T15:00:00Z');
  const ctx: AppContext = { config, db, events, ingest, now: () => current };
  const app = await buildApp(ctx, { clientDir: null });
  return { app, ctx, labsDir, dataDir, setNow: (d: Date) => { current = d; } };
}
```

`server/src/api.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeTestApp } from './testing-app';
import type { LabDetail, LabSummary } from '@lab-ledger/shared';

describe('labs API', () => {
  it('lists the 7 labs with summary fields', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject('/api/labs');
    const labs = res.json() as LabSummary[];
    expect(res.statusCode).toBe(200);
    expect(labs).toHaveLength(7);
    expect(labs[0]).toMatchObject({ slug: 'ad-user-onboarding', labNumber: 1, status: 'not_started', stepsTotal: 9, stepsChecked: 0 });
  });

  it('filters by status, topic and text', async () => {
    const { app } = await makeTestApp();
    expect(((await app.inject('/api/labs?topic=linux')).json() as LabSummary[]).map((l) => l.slug)).toEqual(['linux-file-permissions']);
    expect(((await app.inject('/api/labs?q=intune')).json() as LabSummary[])).toHaveLength(1);
    expect(((await app.inject('/api/labs?status=completed')).json() as LabSummary[])).toHaveLength(0);
  });

  it('returns lab detail with neighbors', async () => {
    const { app } = await makeTestApp();
    const first = (await app.inject('/api/labs/ad-user-onboarding')).json() as LabDetail;
    expect(first.neighbors).toEqual({ prev: null, next: 'gpo-drive-mapping' });
    expect(first.lab.steps).toHaveLength(9);
    const last = (await app.inject('/api/labs/windows-wont-wake-from-sleep')).json() as LabDetail;
    expect(last.neighbors).toEqual({ prev: 'linux-file-permissions', next: null });
    expect(last.lab.steps).toHaveLength(42);
  });

  it('404s for unknown slugs and rejects unsafe slugs', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject('/api/labs/nope')).statusCode).toBe(404);
    expect((await app.inject('/api/labs/..%2Fetc%2Fpasswd/raw')).statusCode).toBe(404);
  });

  it('serves raw HTML with a strict CSP and nosniff', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject('/api/labs/ad-user-onboarding/raw');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).toContain('AD User Onboarding');
  });

  it('rescan returns a result', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/labs/rescan' });
    expect(res.json()).toEqual({ added: [], updated: [], removed: [], warnings: [] });
  });
});

describe('status and step API', () => {
  it('toggling the first step moves the lab to in_progress and persists', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/steps', payload: { index: 0, checked: true } });
    expect(res.json()).toEqual({ checked: [0], status: 'in_progress', allChecked: false });
    const detail = (await app.inject('/api/labs/ad-user-onboarding')).json() as LabDetail;
    expect(detail.checked).toEqual([0]);
    expect(detail.state.status).toBe('in_progress');
  });

  it('reports allChecked and does not demote a completed lab', async () => {
    const { app } = await makeTestApp();
    for (let i = 0; i < 9; i++) {
      await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/steps', payload: { index: i, checked: true } });
    }
    const last = await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/steps', payload: { index: 8, checked: true } });
    expect(last.json().allChecked).toBe(true);
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/status', payload: { status: 'completed' } });
    const again = await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/steps', payload: { index: 0, checked: false } });
    expect(again.json().status).toBe('completed');
  });

  it('rejects out-of-range and malformed step input with 400', async () => {
    const { app } = await makeTestApp();
    const url = '/api/labs/ad-user-onboarding/steps';
    expect((await app.inject({ method: 'PUT', url, payload: { index: 9, checked: true } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url, payload: { index: -1, checked: true } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url, payload: { index: 'x', checked: true } })).statusCode).toBe(400);
  });

  it('sets status, validates it and records timestamps', async () => {
    const { app } = await makeTestApp();
    const ok = await app.inject({ method: 'PUT', url: '/api/labs/gpo-drive-mapping/status', payload: { status: 'completed' } });
    expect(ok.json()).toMatchObject({ status: 'completed' });
    expect(ok.json().completedAt).toBeTruthy();
    expect((await app.inject({ method: 'PUT', url: '/api/labs/gpo-drive-mapping/status', payload: { status: 'bogus' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/labs/nope/status', payload: { status: 'completed' } })).statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/api.test.ts`
Expected: FAIL (cannot resolve `./app`).

- [ ] **Step 3: Implement `app.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import type { Config } from './config';
import type { Db } from './db/open';
import type { LabEvents } from './events';
import type { IngestService } from './ingest/service';
import { registerLabRoutes } from './routes/labs';
import { registerProgressRoutes } from './routes/progress';

export interface AppContext {
  config: Config;
  db: Db;
  events: LabEvents;
  ingest: IngestService;
  now: () => Date;
}

export async function buildApp(ctx: AppContext, opts: { clientDir?: string | null } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid request', issues: error.issues });
    }
    return reply.send(error);
  });

  registerLabRoutes(app, ctx);
  registerProgressRoutes(app, ctx);

  if (opts.clientDir && fs.existsSync(path.join(opts.clientDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: opts.clientDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Not found' });
    });
  }
  return app;
}
```

- [ ] **Step 4: Implement `routes/labs.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { LabDetail } from '@lab-ledger/shared';
import type { AppContext } from '../app';
import * as repo from '../db/repo';
import { LAB_FILE_RE } from '../ingest/parse';

const SLUG_RE = /^[a-z0-9-]+$/;
export const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

export function registerLabRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/labs', async (req) => {
    const q = req.query as { status?: string; topic?: string; q?: string };
    const needle = q.q?.trim().toLowerCase();
    return repo.listSummaries(ctx.db).filter(
      (l) =>
        (!q.status || l.status === q.status) &&
        (!q.topic || (l.topics as string[]).includes(q.topic)) &&
        (!needle || `${l.title} ${l.topicLabel ?? ''} ${l.slug}`.toLowerCase().includes(needle)),
    );
  });

  app.get('/api/labs/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const lab = SLUG_RE.test(slug) ? repo.getLab(ctx.db, slug) : null;
    if (!lab) return reply.code(404).send({ error: 'Lab not found' });
    const all = repo.listLabs(ctx.db);
    const i = all.findIndex((l) => l.slug === slug);
    const detail: LabDetail = {
      lab,
      state: repo.getState(ctx.db, slug),
      checked: repo.getChecked(ctx.db, slug),
      journal: repo.getJournal(ctx.db, slug),
      neighbors: { prev: all[i - 1]?.slug ?? null, next: all[i + 1]?.slug ?? null },
    };
    return detail;
  });

  app.get('/api/labs/:slug/raw', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const lab = SLUG_RE.test(slug) ? repo.getLab(ctx.db, slug) : null;
    if (!lab || lab.missingFile || !LAB_FILE_RE.test(lab.fileName)) return reply.code(404).send({ error: 'Lab file not found' });
    const file = path.join(ctx.config.labsDir, lab.fileName);
    if (!fs.existsSync(file)) return reply.code(404).send({ error: 'Lab file not found' });
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Content-Security-Policy', CSP)
      .header('X-Content-Type-Options', 'nosniff')
      .send(fs.readFileSync(file));
  });

  app.post('/api/labs/rescan', async () => ctx.ingest.rescan());

  app.get('/api/events', (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    const off = ctx.events.subscribe((e) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => {
      clearInterval(ping);
      off();
    });
  });
}
```

- [ ] **Step 5: Implement `routes/progress.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { StatusBody, StepToggleBody } from '@lab-ledger/shared';
import type { AppContext } from '../app';
import * as repo from '../db/repo';
import { dayInTz } from '../lib/time';

const SLUG_RE = /^[a-z0-9-]+$/;

export function registerProgressRoutes(app: FastifyInstance, ctx: AppContext): void {
  const recordActivity = (slug: string, kind: 'step' | 'completed' | 'skipped') => {
    const d = ctx.now();
    repo.addActivity(ctx.db, dayInTz(d, ctx.config.timezone), slug, kind, d.toISOString());
  };

  app.put('/api/labs/:slug/status', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const body = StatusBody.parse(req.body);
    if (!SLUG_RE.test(slug) || !repo.getLab(ctx.db, slug)) return reply.code(404).send({ error: 'Lab not found' });
    const prev = repo.getState(ctx.db, slug).status;
    const state = repo.setStatus(ctx.db, slug, body.status, ctx.now().toISOString());
    if (body.status !== prev) {
      if (body.status === 'completed') recordActivity(slug, 'completed');
      if (body.status === 'skipped') recordActivity(slug, 'skipped');
    }
    return state;
  });

  app.get('/api/labs/:slug/steps', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    if (!SLUG_RE.test(slug) || !repo.getLab(ctx.db, slug)) return reply.code(404).send({ error: 'Lab not found' });
    return { checked: repo.getChecked(ctx.db, slug) };
  });

  app.put('/api/labs/:slug/steps', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const body = StepToggleBody.parse(req.body);
    const lab = SLUG_RE.test(slug) ? repo.getLab(ctx.db, slug) : null;
    if (!lab) return reply.code(404).send({ error: 'Lab not found' });
    const step = lab.steps[body.index];
    if (!step) return reply.code(400).send({ error: 'Step index out of range' });

    const nowIso = ctx.now().toISOString();
    repo.setStep(ctx.db, slug, body.index, step.textHash, body.checked, nowIso);
    if (body.checked) {
      recordActivity(slug, 'step');
      if (repo.getState(ctx.db, slug).status === 'not_started') repo.setStatus(ctx.db, slug, 'in_progress', nowIso);
    }
    const checked = repo.getChecked(ctx.db, slug);
    return { checked, status: repo.getState(ctx.db, slug).status, allChecked: lab.steps.length > 0 && checked.length === lab.steps.length };
  });
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run server/src/api.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/app.ts server/src/routes server/src/testing-app.ts server/src/api.test.ts
git commit -m "feat(server): Fastify app with lab, raw, SSE, status and step routes"
```

---

### Task 10: Journal, attachments, stats, backup routes

**Files:**
- Create: `server/src/routes/journal.ts`, `server/src/routes/attachments.ts`, `server/src/routes/stats.ts`, `server/src/routes/backup.ts`, `server/src/stats.ts`, `server/src/backup.ts`
- Modify: `server/src/app.ts` (register the four new route groups, plus `@fastify/multipart`)
- Test: `server/src/stats.test.ts`, `server/src/backup.test.ts`, `server/src/api-journal.test.ts`

**Interfaces:**
- Produces: `computeStreaks(active: string[], skipped: string[], today: string): { current: number; longest: number }`.
- Produces: `buildStats(db: Db, now: Date, tz: string): Stats`.
- Produces: `exportBackup(db: Db, dataDir: string, now: Date): BackupV1`, `importBackup(db: Db, dataDir: string, payload: BackupV1): void`, `backupToMarkdown(db: Db): string`.
- Journal route contract: `GET /api/labs/:slug/journal` returns the journal or `{bodyMd:'', timeTakenMin:null, difficulty:null, confidence:null, updatedAt:null}`. `PUT` validates with `JournalBody`.
- Attachment route contract: `POST /api/labs/:slug/attachments` (multipart field `file`) returns `{id, url}`. `GET /api/attachments/:id` serves the bytes.

- [ ] **Step 1: Write the failing tests**

`server/src/stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeStreaks, buildStats } from './stats';
import { makeTestApp } from './testing-app';

describe('computeStreaks', () => {
  it('counts consecutive active days ending today', () => {
    expect(computeStreaks(['2026-10-27', '2026-10-28', '2026-10-29'], [], '2026-10-29')).toEqual({ current: 3, longest: 3 });
  });
  it('counts from yesterday when today has no activity yet', () => {
    expect(computeStreaks(['2026-10-27', '2026-10-28'], [], '2026-10-29').current).toBe(2);
  });
  it('resets after a gap but remembers the longest', () => {
    const r = computeStreaks(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-28', '2026-10-29'], [], '2026-10-29');
    expect(r).toEqual({ current: 2, longest: 3 });
  });
  it('treats skipped days as transparent', () => {
    const r = computeStreaks(['2026-10-27', '2026-10-29'], ['2026-10-28'], '2026-10-29');
    expect(r).toEqual({ current: 2, longest: 2 });
  });
  it('is zero when yesterday is also empty', () => {
    expect(computeStreaks(['2026-10-20'], [], '2026-10-29')).toEqual({ current: 0, longest: 1 });
  });
  it('handles no data', () => {
    expect(computeStreaks([], [], '2026-10-29')).toEqual({ current: 0, longest: 0 });
  });
});

describe('buildStats', () => {
  it('is empty-safe on a fresh database', async () => {
    const { ctx } = await makeTestApp();
    const s = buildStats(ctx.db, ctx.now(), 'America/New_York');
    expect(s).toMatchObject({ completed: 0, total: 7, currentStreak: 0, longestStreak: 0, totalMinutes: 0, avgDifficulty: null });
    expect(s.topicCoverage).toHaveLength(12);
    expect(s.topicCoverage.find((t) => t.topic === 'ad-gpo')).toEqual({ topic: 'ad-gpo', count: 2, completed: 0, pct: 0 });
    expect(s.today?.slug).toBe('windows-wont-wake-from-sleep');
    expect(s.recentJournals).toEqual([]);
  });
});
```

`server/src/api-journal.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { makeTestApp } from './testing-app';
import type { Stats } from '@lab-ledger/shared';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

function multipart(fileName: string, mime: string, data: Buffer) {
  const boundary = '----labtest';
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`;
  const body = Buffer.concat([Buffer.from(head), data, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return { payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('journal API', () => {
  it('returns an empty journal, saves, and reloads', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject('/api/labs/ad-user-onboarding/journal')).json()).toMatchObject({ bodyMd: '', difficulty: null });
    const body = { bodyMd: '## What I did\nstuff', timeTakenMin: 45, difficulty: 3, confidence: 4 };
    const put = await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/journal', payload: body });
    expect(put.json()).toMatchObject(body);
    expect((await app.inject('/api/labs/ad-user-onboarding/journal')).json()).toMatchObject(body);
  });
  it('rejects bad ratings and unknown labs', async () => {
    const { app } = await makeTestApp();
    const base = { bodyMd: '', timeTakenMin: null, difficulty: null, confidence: null };
    expect((await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/journal', payload: { ...base, difficulty: 6 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/labs/nope/journal', payload: base })).statusCode).toBe(404);
  });
});

describe('attachments API', () => {
  it('stores a png under DATA_DIR and serves it back safely', async () => {
    const { app, dataDir } = await makeTestApp();
    const up = await app.inject({ method: 'POST', url: '/api/labs/ad-user-onboarding/attachments', ...multipart('shot.png', 'image/png', PNG) });
    expect(up.statusCode).toBe(200);
    const { id, url } = up.json() as { id: string; url: string };
    expect(url).toBe(`/api/attachments/${id}`);
    const stored = fs.readdirSync(path.join(dataDir, 'attachments', 'ad-user-onboarding'));
    expect(stored).toEqual([`${id}.png`]);
    const get = await app.inject(url);
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toBe('image/png');
    expect(get.headers['x-content-type-options']).toBe('nosniff');
    expect(get.headers['content-disposition']).toBe('inline');
    expect(get.rawPayload.equals(PNG)).toBe(true);
  });
  it('rejects files whose bytes do not match an allowed image type', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/labs/ad-user-onboarding/attachments', ...multipart('x.png', 'image/png', Buffer.from('<script>alert(1)</script>')) });
    expect(res.statusCode).toBe(415);
  });
  it('rejects uploads over 10 MB', async () => {
    const { app } = await makeTestApp();
    const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024 + 1)]);
    const res = await app.inject({ method: 'POST', url: '/api/labs/ad-user-onboarding/attachments', ...multipart('big.png', 'image/png', big) });
    expect(res.statusCode).toBe(413);
  });
  it('404s for unknown labs and ids', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'POST', url: '/api/labs/nope/attachments', ...multipart('a.png', 'image/png', PNG) })).statusCode).toBe(404);
    expect((await app.inject('/api/attachments/00000000-0000-0000-0000-000000000000')).statusCode).toBe(404);
    expect((await app.inject('/api/attachments/..%2F..%2Fetc')).statusCode).toBe(404);
  });
});

describe('stats API', () => {
  it('reflects completion, streak, time and difficulty', async () => {
    const { app } = await makeTestApp({ now: new Date('2026-10-29T15:00:00Z') });
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/status', payload: { status: 'completed' } });
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/journal', payload: { bodyMd: 'did it', timeTakenMin: 90, difficulty: 4, confidence: 3 } });
    await app.inject({ method: 'PUT', url: '/api/labs/gpo-drive-mapping/journal', payload: { bodyMd: '', timeTakenMin: 30, difficulty: 2, confidence: null } });
    const s = (await app.inject('/api/stats')).json() as Stats;
    expect(s).toMatchObject({ completed: 1, total: 7, currentStreak: 1, longestStreak: 1, totalMinutes: 120, avgDifficulty: 3 });
    expect(s.topicCoverage.find((t) => t.topic === 'ad-gpo')).toEqual({ topic: 'ad-gpo', count: 2, completed: 1, pct: 50 });
    expect(s.recentJournals).toHaveLength(1);
    expect(s.recentJournals[0]).toMatchObject({ slug: 'ad-user-onboarding', snippet: 'did it' });
  });
});
```

`server/src/backup.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { makeTestApp } from './testing-app';
import { openDb } from './db/open';
import { exportBackup, importBackup, backupToMarkdown } from './backup';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, 7)]);

describe('backup', () => {
  it('round-trips into a fresh DB and data dir identically', async () => {
    const { app, ctx, dataDir } = await makeTestApp();
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/steps', payload: { index: 0, checked: true } });
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/status', payload: { status: 'completed' } });
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/journal', payload: { bodyMd: 'notes ![x](/api/attachments/1)', timeTakenMin: 10, difficulty: 2, confidence: 5 } });
    const boundary = 'b';
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), PNG, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    await app.inject({ method: 'POST', url: '/api/labs/ad-user-onboarding/attachments', payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });

    const original = exportBackup(ctx.db, dataDir, new Date('2026-10-29T00:00:00Z'));
    expect(original.attachments).toHaveLength(1);

    const freshDb = openDb(':memory:');
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-'));
    importBackup(freshDb, freshDir, JSON.parse(JSON.stringify(original)));
    const restored = exportBackup(freshDb, freshDir, new Date('2026-10-29T00:00:00Z'));
    expect(restored).toEqual(original);
    const files = fs.readdirSync(path.join(freshDir, 'attachments', 'ad-user-onboarding'));
    expect(files).toHaveLength(1);
    expect(fs.readFileSync(path.join(freshDir, 'attachments', 'ad-user-onboarding', files[0])).equals(PNG)).toBe(true);
  });

  it('restore via the HTTP API validates input', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'POST', url: '/api/restore', payload: { version: 2 } })).statusCode).toBe(400);
    const evil = { version: 1, exportedAt: 'x', labState: [], stepProgress: [], journals: [], activity: [],
      attachments: [{ id: '../../x', slug: 'a', fileName: 'x.png', mime: 'image/png', bytes: 1, createdAt: 'x', dataBase64: 'AA==' }] };
    expect((await app.inject({ method: 'POST', url: '/api/restore', payload: evil })).statusCode).toBe(400);
  });

  it('serves JSON and Markdown downloads', async () => {
    const { app } = await makeTestApp();
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/journal', payload: { bodyMd: 'my notes', timeTakenMin: 5, difficulty: 1, confidence: 2 } });
    const json = await app.inject('/api/backup');
    expect(json.json()).toMatchObject({ version: 1 });
    expect(json.headers['content-disposition']).toMatch(/attachment; filename="lab-backup-.*\.json"/);
    const md = await app.inject('/api/backup/markdown');
    expect(md.headers['content-type']).toMatch(/text\/markdown/);
    expect(md.body).toContain('Lab 01');
    expect(md.body).toContain('my notes');
  });

  it('markdown skips labs without notes', async () => {
    const { ctx } = await makeTestApp();
    expect(backupToMarkdown(ctx.db)).not.toContain('Lab 01');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/src/stats.test.ts server/src/backup.test.ts server/src/api-journal.test.ts`
Expected: FAIL (modules and routes missing).

- [ ] **Step 3: Implement `stats.ts`**

```ts
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
```

- [ ] **Step 4: Implement `backup.ts`**

```ts
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
```

- [ ] **Step 5: Implement the four route files**

`routes/journal.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { JournalBody } from '@lab-ledger/shared';
import type { AppContext } from '../app';
import * as repo from '../db/repo';

const SLUG_RE = /^[a-z0-9-]+$/;
const EMPTY = { bodyMd: '', timeTakenMin: null, difficulty: null, confidence: null, updatedAt: null };

export function registerJournalRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/labs/:slug/journal', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    if (!SLUG_RE.test(slug) || !repo.getLab(ctx.db, slug)) return reply.code(404).send({ error: 'Lab not found' });
    return repo.getJournal(ctx.db, slug) ?? EMPTY;
  });

  app.put('/api/labs/:slug/journal', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const body = JournalBody.parse(req.body);
    if (!SLUG_RE.test(slug) || !repo.getLab(ctx.db, slug)) return reply.code(404).send({ error: 'Lab not found' });
    return repo.putJournal(ctx.db, slug, body, ctx.now().toISOString());
  });
}
```

`routes/attachments.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import type { AppContext } from '../app';
import * as repo from '../db/repo';

const SLUG_RE = /^[a-z0-9-]+$/;
const ID_RE = /^[0-9a-f-]{36}$/;
export const MAX_BYTES = 10 * 1024 * 1024;

export function sniffImage(b: Buffer): { mime: 'image/png' | 'image/jpeg' | 'image/webp'; ext: 'png' | 'jpg' | 'webp' } | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export async function registerAttachmentRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  await app.register(multipart, { limits: { fileSize: MAX_BYTES, files: 1 } });

  app.post('/api/labs/:slug/attachments', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    if (!SLUG_RE.test(slug) || !repo.getLab(ctx.db, slug)) return reply.code(404).send({ error: 'Lab not found' });
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: 'Missing file' });
    const buf = await part.toBuffer();
    if (part.file.truncated) return reply.code(413).send({ error: 'File too large (max 10 MB)' });
    const kind = sniffImage(buf);
    if (!kind) return reply.code(415).send({ error: 'Only png, jpg and webp images are allowed' });

    const id = randomUUID();
    const fileName = `${id}.${kind.ext}`;
    const dir = path.join(ctx.config.dataDir, 'attachments', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), buf);
    repo.insertAttachment(ctx.db, { id, slug, fileName, mime: kind.mime, bytes: buf.length, createdAt: ctx.now().toISOString() });
    return { id, url: `/api/attachments/${id}` };
  });

  app.get('/api/attachments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = ID_RE.test(id) ? repo.getAttachment(ctx.db, id) : null;
    if (!row) return reply.code(404).send({ error: 'Not found' });
    const file = path.join(ctx.config.dataDir, 'attachments', row.slug, row.fileName);
    if (!fs.existsSync(file)) return reply.code(404).send({ error: 'Not found' });
    return reply.header('Content-Type', row.mime).header('X-Content-Type-Options', 'nosniff').header('Content-Disposition', 'inline').send(fs.readFileSync(file));
  });
}
```

If the 10 MB test fails because `@fastify/multipart` throws `RequestFileTooLargeError` from `toBuffer()` instead of setting `truncated`, catch it in the route and return 413. Use `systematic-debugging`: print `err.code`, which is `FST_REQ_FILE_TOO_LARGE`.

`routes/stats.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app';
import { buildStats } from '../stats';

export function registerStatsRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/stats', async () => buildStats(ctx.db, ctx.now(), ctx.config.timezone));
}
```

`routes/backup.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { BackupSchema } from '@lab-ledger/shared';
import type { AppContext } from '../app';
import { backupToMarkdown, exportBackup, importBackup } from '../backup';

export function registerBackupRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/backup', async (_req, reply) => {
    const now = ctx.now();
    return reply
      .header('Content-Disposition', `attachment; filename="lab-backup-${now.toISOString().slice(0, 10)}.json"`)
      .send(exportBackup(ctx.db, ctx.config.dataDir, now));
  });

  app.get('/api/backup/markdown', async (_req, reply) =>
    reply
      .header('Content-Type', 'text/markdown; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="lab-notes.md"')
      .send(backupToMarkdown(ctx.db)),
  );

  app.post('/api/restore', { bodyLimit: 256 * 1024 * 1024 }, async (req) => {
    const payload = BackupSchema.parse(req.body);
    importBackup(ctx.db, ctx.config.dataDir, payload);
    return { ok: true };
  });
}
```

- [ ] **Step 6: Register the routes in `app.ts`**

Add imports and registration (the attachment registrar is async):

```ts
import { registerJournalRoutes } from './routes/journal';
import { registerAttachmentRoutes } from './routes/attachments';
import { registerStatsRoutes } from './routes/stats';
import { registerBackupRoutes } from './routes/backup';
```

```ts
  registerLabRoutes(app, ctx);
  registerProgressRoutes(app, ctx);
  registerJournalRoutes(app, ctx);
  await registerAttachmentRoutes(app, ctx);
  registerStatsRoutes(app, ctx);
  registerBackupRoutes(app, ctx);
```

The `Fastify({ bodyLimit })` default is 1 MB, and the restore route overrides it per route.

- [ ] **Step 7: Run to verify they pass**

Run: `npx vitest run server`
Expected: PASS for all server tests so far. The stats test relies on `makeTestApp`'s clock of `2026-10-29T15:00:00Z`, which is 11:00 ET on 2026-10-29, so "today" is `2026-10-29` and Lab 7's date matches.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc -p server --noEmit`
Expected: exit 0.

```bash
git add server/src
git commit -m "feat(server): journal, attachments, stats and backup/restore endpoints"
```

---

### Task 11: Server entry point and smoke test

**Files:**
- Create: `server/src/index.ts`
- Modify: root `package.json` only if the smoke test finds problems

**Interfaces:**
- Consumes: `loadConfig`, `openDb`, `LabEvents`, `createIngestService`, `watchLabs`, `startScheduler`, `buildApp`.
- Produces: a runnable server. `npm run dev -w server` serves the API on 4317.

- [ ] **Step 1: Implement `server/src/index.ts`**

```ts
import path from 'node:path';
import { buildApp } from './app';
import { loadConfig } from './config';
import { openDb } from './db/open';
import { LabEvents } from './events';
import { createIngestService } from './ingest/service';
import { watchLabs } from './ingest/watch';
import { startScheduler } from './scheduler';

const config = loadConfig();
const db = openDb(path.join(config.dataDir, 'app.db'));
const events = new LabEvents();
const ingest = createIngestService({ db, labsDir: config.labsDir, events });

const first = ingest.rescan();
first.warnings.forEach((w) => console.warn(w));

const watcher = watchLabs({
  labsDir: config.labsDir,
  stabilityMs: config.watchStabilityMs,
  onChange: () => ingest.rescan().warnings.forEach((w) => console.warn(w)),
});
const stopScheduler = startScheduler(() => ingest.rescan(), config.timezone);

const clientDir = path.resolve(import.meta.dirname, '../../client/dist');
const app = await buildApp({ config, db, events, ingest, now: () => new Date() }, { clientDir });

const shutdown = async () => {
  stopScheduler();
  await watcher.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
console.log(`Lab Dashboard API on http://${config.host}:${config.port} (labs: ${config.labsDir}, data: ${config.dataDir})`);
```

- [ ] **Step 2: Smoke test against the fixtures**

Run (in one shell):

```bash
LABS_DIR="$PWD/tests/fixtures/labs" DATA_DIR=/tmp/lab-smoke PORT=4317 npx tsx server/src/index.ts &
sleep 3
curl -s localhost:4317/api/labs | head -c 300
curl -s localhost:4317/api/stats | head -c 300
curl -sI localhost:4317/api/labs/ad-user-onboarding/raw | grep -i content-security
kill %1
```

Expected: a JSON array of labs starting with `ad-user-onboarding`, a stats JSON with `"total":7`, and the exact CSP header. The server prints its startup line.

- [ ] **Step 3: Verify the production build of the server**

Run: `npm run build -w server && ls server/dist`
Expected: `index.js` exists. (The full `npm run build` needs the client, which comes in Task 12.)

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(server): bootstrap with watcher, scheduler and graceful shutdown"
```

---

### Task 12: Client scaffold, API client, theme, toasts, live events

**Files:**
- Create: `client/index.html`, `client/vite.config.ts`, `client/src/main.tsx`, `client/src/App.tsx`
- Create: `client/src/lib/{api.ts,useAsync.ts,events.ts,hotkeys.ts,theme.ts}`, `client/src/components/Toasts.tsx`, `client/src/styles/app.css`
- Create (placeholders, replaced in Tasks 13 and 14): `client/src/pages/{Home,LabList,LabViewer,Settings}.tsx`
- Test: `client/src/lib/hotkeys.test.ts`

**Interfaces:**
- Produces `api` in `lib/api.ts`:
  - `api.labs(): Promise<LabSummary[]>`, `api.lab(slug): Promise<LabDetail>`, `api.stats(): Promise<Stats>`
  - `api.setStatus(slug, status): Promise<LabState>`, `api.toggleStep(slug, index, checked): Promise<{checked: number[]; status: LabStatus; allChecked: boolean}>`
  - `api.saveJournal(slug, j: Omit<Journal, 'updatedAt'>): Promise<Journal>`, `api.uploadAttachment(slug, file: File): Promise<{id: string; url: string}>`
  - `api.rescan()`, `api.restore(json: unknown)`
- Produces `useAsync<T>(fn, deps)` returning `{ data?: T; error?: Error; loading: boolean; reload(): void }`.
- Produces `useLabEvents(handler: (e: LabEventPayload) => void): void`, `useHotkeys(handler: (e: KeyboardEvent) => void): (e: KeyboardEvent) => void`, `isTyping(target: EventTarget | null): boolean`, `useTheme(): { theme: 'light' | 'dark'; toggle(): void }`, `ToastProvider`, `useToast(): (m: { text: string; to?: string }) => void`, `LiveEvents`.

- [ ] **Step 1: Write the failing `isTyping` test**

`client/src/lib/hotkeys.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isTyping } from './hotkeys';

const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, isContentEditable: false, ...extra }) as unknown as EventTarget;

describe('isTyping', () => {
  it('is true for text-like fields', () => {
    expect(isTyping(el('TEXTAREA'))).toBe(true);
    expect(isTyping(el('SELECT'))).toBe(true);
    expect(isTyping(el('INPUT', { type: 'text' }))).toBe(true);
    expect(isTyping(el('DIV', { isContentEditable: true }))).toBe(true);
  });
  it('is false for checkboxes, buttons and null', () => {
    expect(isTyping(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(isTyping(el('BUTTON'))).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run client`
Expected: FAIL (cannot resolve `./hotkeys`).

- [ ] **Step 3: Write the Vite config and HTML**

`client/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:4317', changeOrigin: false } } },
  build: { outDir: 'dist', sourcemap: false },
});
```

`client/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lab Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Write the lib modules**

`client/src/lib/api.ts`:

```ts
import type { Journal, LabDetail, LabState, LabStatus, LabSummary, Stats } from '@lab-ledger/shared';

async function request<T>(path: string, init: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: init.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.form,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const api = {
  labs: () => request<LabSummary[]>('/labs'),
  lab: (slug: string) => request<LabDetail>(`/labs/${slug}`),
  stats: () => request<Stats>('/stats'),
  rescan: () => request<{ added: string[]; updated: string[]; removed: string[]; warnings: string[] }>('/labs/rescan', { method: 'POST' }),
  setStatus: (slug: string, status: LabStatus) => request<LabState>(`/labs/${slug}/status`, { method: 'PUT', json: { status } }),
  toggleStep: (slug: string, index: number, checked: boolean) =>
    request<{ checked: number[]; status: LabStatus; allChecked: boolean }>(`/labs/${slug}/steps`, { method: 'PUT', json: { index, checked } }),
  saveJournal: (slug: string, j: Omit<Journal, 'updatedAt'>) => request<Journal>(`/labs/${slug}/journal`, { method: 'PUT', json: j }),
  uploadAttachment: (slug: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ id: string; url: string }>(`/labs/${slug}/attachments`, { method: 'POST', form });
  },
  restore: (payload: unknown) => request<{ ok: boolean }>('/restore', { method: 'POST', json: payload }),
};
```

`client/src/lib/useAsync.ts`:

```ts
import { useEffect, useRef, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  const lastKey = useRef('');

  useEffect(() => {
    const key = JSON.stringify(deps);
    const depsChanged = key !== lastKey.current;
    lastKey.current = key;
    let alive = true;
    setState((s) => (depsChanged ? { loading: true } : { ...s, loading: true }));
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (error: Error) => alive && setState({ error, loading: false }),
    );
    return () => {
      alive = false;
    };
  }, [JSON.stringify(deps), tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
```

A reload (`tick` change) keeps the previous data visible so the UI doesn't flash. A dependency change (for example a new slug) drops the old data first, so a lab page never shows the previous lab's content.

`client/src/lib/events.ts`:

```ts
import { useEffect, useRef } from 'react';
import type { LabEventPayload } from '@lab-ledger/shared';

type Handler = (e: LabEventPayload) => void;
const handlers = new Set<Handler>();
let source: EventSource | null = null;

function subscribe(h: Handler): () => void {
  handlers.add(h);
  if (!source) {
    source = new EventSource('/api/events');
    for (const type of ['lab:added', 'lab:updated', 'lab:removed']) {
      source.addEventListener(type, (ev) => {
        const payload = JSON.parse((ev as MessageEvent<string>).data) as LabEventPayload;
        handlers.forEach((fn) => fn(payload));
      });
    }
  }
  return () => {
    handlers.delete(h);
  };
}

export function useLabEvents(handler: Handler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe((e) => ref.current(e)), []);
}
```

`client/src/lib/hotkeys.ts`:

```ts
import { useCallback, useEffect, useRef } from 'react';

export function isTyping(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { type?: string }) | null;
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return true;
  if (el.tagName === 'INPUT') return el.type !== 'checkbox';
  return false;
}

export function useHotkeys(handler: (e: KeyboardEvent) => void): (e: KeyboardEvent) => void {
  const ref = useRef(handler);
  ref.current = handler;
  const stable = useCallback((e: KeyboardEvent) => ref.current(e), []);
  useEffect(() => {
    window.addEventListener('keydown', stable);
    return () => window.removeEventListener('keydown', stable);
  }, [stable]);
  return stable;
}
```

`client/src/lib/theme.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function initial(): Theme {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      return next;
    });
  }, []);
  return { theme, toggle };
}
```

- [ ] **Step 5: Write toasts, App shell, main, CSS, and placeholder pages**

`client/src/components/Toasts.tsx`:

```tsx
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLabEvents } from '../lib/events';

type Toast = { text: string; to?: string };
const Ctx = createContext<(m: Toast) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<(Toast & { id: number })[]>([]);
  const push = useCallback((m: Toast) => {
    const id = Date.now() + Math.random();
    setItems((i) => [...i, { id, ...m }]);
    setTimeout(() => setItems((i) => i.filter((x) => x.id !== id)), 8000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            {t.to ? <Link to={t.to}>{t.text}</Link> : t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function LiveEvents() {
  const toast = useToast();
  useLabEvents((e) => {
    if (e.type === 'lab:added') toast({ text: `New lab: ${e.title ?? e.slug}`, to: `/labs/${e.slug}` });
  });
  return null;
}
```

`client/src/App.tsx`:

```tsx
import { NavLink, Route, Routes } from 'react-router-dom';
import { LiveEvents, ToastProvider } from './components/Toasts';
import { useTheme } from './lib/theme';
import Home from './pages/Home';
import LabList from './pages/LabList';
import LabViewer from './pages/LabViewer';
import Settings from './pages/Settings';

export default function App() {
  const { theme, toggle } = useTheme();
  return (
    <ToastProvider>
      <LiveEvents />
      <header className="topbar">
        <strong className="brand">Lab Dashboard</strong>
        <nav aria-label="Main">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/labs">Labs</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <button type="button" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/labs" element={<LabList />} />
          <Route path="/labs/:slug" element={<LabViewer />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </ToastProvider>
  );
}
```

`client/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

`client/src/styles/app.css`:

```css
:root {
  --bg: #fafafa; --fg: #1a1a1a; --muted: #55585f; --card: #ffffff; --border: #c9ccd3;
  --accent: #0b57d0; --accent-fg: #ffffff; --ok: #0a6b2d; --warn: #8a4b00; --focus: #0b57d0;
  color-scheme: light;
}
:root[data-theme='dark'] {
  --bg: #121418; --fg: #e8e8e8; --muted: #a8adb7; --card: #1b1e24; --border: #3a3f49;
  --accent: #8ab4f8; --accent-fg: #0b1020; --ok: #7ddc9a; --warn: #f2b46d; --focus: #8ab4f8;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
a { color: var(--accent); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
main { max-width: 1280px; margin: 0 auto; padding: 16px; }
h1, h2, h3 { line-height: 1.25; }
button, select, input, textarea { font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; }
button { cursor: pointer; }
button:disabled { opacity: 0.55; cursor: not-allowed; }
button.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
.topbar { display: flex; align-items: center; gap: 16px; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--card); }
.topbar nav { display: flex; gap: 12px; flex: 1; }
.topbar nav a { text-decoration: none; padding: 4px 8px; border-radius: 6px; color: var(--fg); }
.topbar nav a.active { background: var(--accent); color: var(--accent-fg); }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 16px 0; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; }
.stat .value { font-size: 1.8rem; font-weight: 700; }
.stat .label { color: var(--muted); }
.topics { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; padding: 0; list-style: none; }
.topics li { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; }
.bar { height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; margin-top: 6px; }
.bar > span { display: block; height: 100%; background: var(--ok); }
.lab-list { list-style: none; padding: 0; display: grid; gap: 10px; }
.lab-card { display: flex; gap: 12px; align-items: center; justify-content: space-between; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; }
.lab-card .num { color: var(--muted); margin-right: 8px; }
.chip { display: inline-block; border: 1px solid var(--border); border-radius: 999px; padding: 1px 10px; font-size: 0.85rem; margin-left: 6px; }
.chip.completed { color: var(--ok); border-color: var(--ok); }
.chip.in_progress { color: var(--accent); border-color: var(--accent); }
.chip.warn { color: var(--warn); border-color: var(--warn); }
.viewer-head { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 8px; }
.viewer-head h1 { font-size: 1.2rem; margin: 0; flex: 1; }
.progress { min-width: 160px; }
.viewer { display: grid; grid-template-columns: 3fr 2fr; gap: 12px; height: calc(100vh - 170px); min-height: 480px; }
.viewer iframe { width: 100%; height: 100%; border: 1px solid var(--border); border-radius: 8px; background: #fff; }
.panel { display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.tabs { display: flex; border-bottom: 1px solid var(--border); }
.tabs button { flex: 1; border: 0; border-radius: 0; background: transparent; padding: 10px; }
.tabs button[aria-selected='true'] { background: var(--accent); color: var(--accent-fg); }
.panel-body { overflow: auto; padding: 12px; flex: 1; }
.steps { list-style: none; margin: 0; padding: 0; }
.steps li { padding: 6px 8px; border-radius: 6px; }
.steps li[data-focused='true'] { outline: 2px solid var(--accent); }
.steps .section-h { font-weight: 600; color: var(--muted); margin-top: 10px; }
.steps label { display: flex; gap: 8px; cursor: pointer; }
.journal-fields { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 10px; }
.journal-fields label { display: flex; flex-direction: column; gap: 4px; font-size: 0.9rem; }
.journal textarea { width: 100%; min-height: 220px; resize: vertical; font-family: ui-monospace, monospace; }
.journal-preview { border-top: 1px solid var(--border); margin-top: 10px; padding-top: 8px; }
.journal-preview img { max-width: 100%; }
.banner { background: var(--card); border: 1px solid var(--ok); border-radius: 8px; padding: 8px 12px; margin: 8px 0; display: flex; gap: 12px; align-items: center; }
.toasts { position: fixed; right: 16px; bottom: 16px; display: grid; gap: 8px; z-index: 10; }
.toast { background: var(--card); border: 1px solid var(--accent); border-radius: 8px; padding: 10px 14px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 767px) {
  .viewer { grid-template-columns: 1fr; height: auto; }
  .viewer iframe { height: 60vh; }
  .panel { min-height: 50vh; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; scroll-behavior: auto !important; } }
```

Placeholder pages (each `client/src/pages/X.tsx`, replaced later):

```tsx
export default function Home() {
  return <h1>Home</h1>;
}
```

Create the same shape for `LabList`, `LabViewer`, `Settings` (changing the name and heading).

- [ ] **Step 6: Run the tests, typecheck, and build**

Run: `npx vitest run client && npm run typecheck && npm run build -w client`
Expected: 2 PASS, tsc exit 0, Vite build prints `dist/index.html` and an assets bundle.

- [ ] **Step 7: Commit**

```bash
git add client
git commit -m "feat(client): app shell with theme, toasts, SSE hook, API client and styles"
```

---

### Task 13: Home, Lab list, and Settings pages

**Files:**
- Modify: `client/src/pages/{Home,LabList,Settings}.tsx`
- Create: `client/src/components/{StatCard,TopicGrid}.tsx`

**Interfaces:**
- Consumes: `api.stats`, `api.labs`, `api.rescan`, `api.restore`, `useAsync`, `useLabEvents`, `Stats`, `LabSummary`.
- Produces: `StatCard({label, value, hint?})`, `TopicGrid({coverage})`.

- [ ] **Step 1: Components**

`client/src/components/StatCard.tsx`:

```tsx
export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
      {hint ? <div className="label">{hint}</div> : null}
    </div>
  );
}
```

`client/src/components/TopicGrid.tsx`:

```tsx
import type { TopicCoverage } from '@lab-ledger/shared';

export function TopicGrid({ coverage }: { coverage: TopicCoverage[] }) {
  return (
    <ul className="topics" aria-label="Topic coverage">
      {coverage.map((t) => (
        <li key={t.topic}>
          <div>{t.topic}</div>
          <div className="label">
            {t.completed}/{t.count} done ({t.pct}%)
          </div>
          <div className="bar" role="presentation">
            <span style={{ width: `${t.pct}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Home page**

`client/src/pages/Home.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { StatCard } from '../components/StatCard';
import { TopicGrid } from '../components/TopicGrid';
import { api } from '../lib/api';
import { useLabEvents } from '../lib/events';
import { useAsync } from '../lib/useAsync';

const hours = (min: number) => `${(min / 60).toFixed(1)} h`;

export default function Home() {
  const { data, error, reload } = useAsync(() => api.stats(), []);
  useLabEvents(() => reload());

  if (error) return <p role="alert">Could not load stats: {error.message}</p>;
  if (!data) return <p>Loading…</p>;

  return (
    <>
      <h1>Dashboard</h1>
      <div className="cards">
        <StatCard label="Completed" value={`${data.completed}/${data.total}`} />
        <StatCard label="Current streak" value={`${data.currentStreak} d`} hint={`Best ${data.longestStreak} d`} />
        <StatCard label="Time logged" value={hours(data.totalMinutes)} />
        <StatCard label="Avg difficulty" value={data.avgDifficulty === null ? '–' : `${data.avgDifficulty} / 5`} />
      </div>

      <section className="card" aria-labelledby="today-h">
        <h2 id="today-h">Today&apos;s lab</h2>
        {data.today ? (
          <p>
            Lab {data.today.labNumber ?? '?'} – {data.today.title}{' '}
            <Link to={`/labs/${data.today.slug}`}>Open</Link>
          </p>
        ) : (
          <p>No labs yet.</p>
        )}
      </section>

      <h2>Topic coverage</h2>
      <TopicGrid coverage={data.topicCoverage} />

      <h2>Recent notes</h2>
      {data.recentJournals.length === 0 ? (
        <p>No journal entries yet.</p>
      ) : (
        <ul className="lab-list">
          {data.recentJournals.map((j) => (
            <li key={j.slug} className="lab-card">
              <span>
                <Link to={`/labs/${j.slug}`}>{j.title}</Link> <span className="label">{j.snippet}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
```

- [ ] **Step 3: Lab list page**

`client/src/pages/LabList.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LAB_STATUSES, type LabStatus } from '@lab-ledger/shared';
import { api } from '../lib/api';
import { useLabEvents } from '../lib/events';
import { useAsync } from '../lib/useAsync';

const LABELS: Record<LabStatus, string> = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', skipped: 'Skipped' };

export default function LabList() {
  const { data, error, reload } = useAsync(() => api.labs(), []);
  useLabEvents(() => reload());
  const [filter, setFilter] = useState<LabStatus | 'all'>('all');

  if (error) return <p role="alert">Could not load labs: {error.message}</p>;
  if (!data) return <p>Loading…</p>;

  const labs = [...data].reverse().filter((l) => filter === 'all' || l.status === filter);

  return (
    <>
      <h1>Labs</h1>
      <label>
        Status{' '}
        <select value={filter} onChange={(e) => setFilter(e.target.value as LabStatus | 'all')}>
          <option value="all">All</option>
          {LAB_STATUSES.map((s) => (
            <option key={s} value={s}>{LABELS[s]}</option>
          ))}
        </select>
      </label>
      <ul className="lab-list">
        {labs.map((l) => (
          <li key={l.slug} className="lab-card">
            <span>
              <Link to={`/labs/${l.slug}`}>
                <span className="num">{l.labNumber ? `Lab ${String(l.labNumber).padStart(2, '0')}` : 'Lab'}</span>
                <span className="title">{l.title}</span>
              </Link>
              {l.parseStatus !== 'ok' && !l.missingFile ? <span className="chip warn">parsed partially</span> : null}
              {l.missingFile ? <span className="chip warn">file missing</span> : null}
            </span>
            <span>
              <span className="label">{l.date}</span>
              <span className={`chip ${l.status}`}>{LABELS[l.status]}</span>
              <span className="label"> {l.stepsChecked}/{l.stepsTotal}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
```

- [ ] **Step 4: Settings page**

`client/src/pages/Settings.tsx`:

```tsx
import { useRef, useState } from 'react';
import { api } from '../lib/api';

export default function Settings() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  async function rescan() {
    const r = await api.rescan();
    setMessage(`Rescan done: ${r.added.length} added, ${r.updated.length} updated, ${r.removed.length} removed.`);
  }

  async function restore() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (!window.confirm('Restoring replaces ALL progress, journals and screenshots. Continue?')) return;
    try {
      await api.restore(JSON.parse(await file.text()));
      setMessage('Restore complete. Reload the page to see restored data.');
    } catch (err) {
      setMessage(`Restore failed: ${(err as Error).message}`);
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <section className="card">
        <h2>Backup</h2>
        <p>
          <a href="/api/backup" download>Download JSON backup</a> · <a href="/api/backup/markdown" download>Download Markdown notes</a>
        </p>
        <label>
          Restore from JSON backup <input ref={fileRef} type="file" accept="application/json,.json" />
        </label>{' '}
        <button type="button" onClick={restore}>Restore</button>
      </section>
      <section className="card">
        <h2>Labs folder</h2>
        <button type="button" onClick={rescan}>Rescan now</button>
      </section>
      <p role="status">{message}</p>
    </>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run build -w client`
Expected: all exit 0. Then smoke-run: start the server as in Task 11 and `npm run dev -w client`, open `http://localhost:5173/`, and confirm Home shows `0/7`, Labs lists 7 newest-first, and Settings links download. (The E2E specs in Task 16 formalise this.)

- [ ] **Step 6: Commit**

```bash
git add client/src
git commit -m "feat(client): home dashboard, lab list and settings pages"
```

---

### Task 14: Lab viewer with iframe, step panel, status, shortcuts

**Files:**
- Create: `client/src/components/{LabFrame,StepList}.tsx`
- Modify: `client/src/pages/LabViewer.tsx`

**Interfaces:**
- Consumes: `api`, `useAsync`, `useHotkeys`, `isTyping`, `LabDetail`, `LabStatus`.
- Produces: `LabFrame({ slug, title, checked: Set<number>, onToggle(i, v), onKey(e) })`, `StepList({ steps, checked, focusIndex, onToggle })`.
- Produces: `JournalEditor` slot in the viewer. The Journal tab renders `<JournalEditor …/>`, built in Task 15. Until then it renders a placeholder.

- [ ] **Step 1: `LabFrame.tsx`**

```tsx
import { useCallback, useEffect, useRef } from 'react';

interface Props {
  slug: string;
  title: string;
  checked: Set<number>;
  onToggle: (index: number, value: boolean) => void;
  onKey: (e: KeyboardEvent) => void;
}

export function LabFrame({ slug, title, checked, onToggle, onKey }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const boxes = useRef<HTMLInputElement[]>([]);
  const toggleRef = useRef(onToggle);
  toggleRef.current = onToggle;

  const apply = useCallback(() => {
    boxes.current.forEach((box, i) => {
      const want = checked.has(i);
      if (box.checked !== want) box.checked = want;
    });
  }, [checked]);

  useEffect(apply, [apply]);

  const onLoad = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    boxes.current = Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    boxes.current.forEach((box, i) => box.addEventListener('change', () => toggleRef.current(i, box.checked)));
    doc.addEventListener('keydown', onKey);
    apply();
  };

  return <iframe ref={frame} key={slug} title={`Lab: ${title}`} sandbox="allow-same-origin" src={`/api/labs/${slug}/raw`} onLoad={onLoad} />;
}
```

The `sandbox` value is exactly `allow-same-origin`. Never add `allow-scripts`. `key={slug}` remounts the iframe per lab, so `boxes` never goes stale.

- [ ] **Step 2: `StepList.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import type { Step } from '@lab-ledger/shared';

interface Props {
  steps: Step[];
  checked: Set<number>;
  focusIndex: number;
  onToggle: (index: number, value: boolean) => void;
}

export function StepList({ steps, checked, focusIndex, onToggle }: Props) {
  const focused = useRef<HTMLLIElement>(null);
  useEffect(() => {
    focused.current?.scrollIntoView({ block: 'nearest' });
  }, [focusIndex]);

  let lastSection = '';
  return (
    <ol className="steps" aria-label="Steps">
      {steps.map((s) => {
        const header = s.section !== lastSection ? s.section : null;
        lastSection = s.section;
        return (
          <li key={s.key} ref={s.index === focusIndex ? focused : undefined} data-focused={s.index === focusIndex}>
            {header ? <div className="section-h">{header}</div> : null}
            <label>
              <input type="checkbox" checked={checked.has(s.index)} onChange={(e) => onToggle(s.index, e.target.checked)} />
              <span>{s.text}</span>
            </label>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 3: `LabViewer.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LAB_STATUSES, type LabStatus } from '@lab-ledger/shared';
import { LabFrame } from '../components/LabFrame';
import { StepList } from '../components/StepList';
import { api } from '../lib/api';
import { isTyping, useHotkeys } from '../lib/hotkeys';
import { useAsync } from '../lib/useAsync';

const LABELS: Record<LabStatus, string> = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', skipped: 'Skipped' };

export default function LabViewer() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const { data, error } = useAsync(() => api.lab(slug), [slug]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<LabStatus>('not_started');
  const [focusStep, setFocusStep] = useState(0);
  const [tab, setTab] = useState<'steps' | 'journal'>('steps');
  const [allChecked, setAllChecked] = useState(false);
  const journalRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!data) return;
    setChecked(new Set(data.checked));
    setStatus(data.state.status);
    setFocusStep(0);
    setAllChecked(false);
  }, [data]);

  const total = data?.lab.steps.length ?? 0;

  async function toggle(index: number, value: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (value) next.add(index);
      else next.delete(index);
      return next;
    });
    const res = await api.toggleStep(slug, index, value);
    setStatus(res.status);
    setAllChecked(res.allChecked && res.status !== 'completed');
  }

  async function changeStatus(next: LabStatus) {
    setStatus(next);
    const state = await api.setStatus(slug, next);
    setStatus(state.status);
    if (next === 'completed') setAllChecked(false);
  }

  const onKey = useHotkeys((e) => {
    if (!data || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    switch (e.key) {
      case 'ArrowLeft':
        if (data.neighbors.prev) nav(`/labs/${data.neighbors.prev}`);
        break;
      case 'ArrowRight':
        if (data.neighbors.next) nav(`/labs/${data.neighbors.next}`);
        break;
      case 'j':
        setFocusStep((i) => Math.min(i + 1, Math.max(total - 1, 0)));
        break;
      case 'k':
        setFocusStep((i) => Math.max(i - 1, 0));
        break;
      case ' ':
        if (target?.tagName === 'INPUT' || target?.tagName === 'BUTTON') return;
        e.preventDefault();
        if (total > 0) void toggle(focusStep, !checked.has(focusStep));
        break;
      case 's': {
        const next = LAB_STATUSES[(LAB_STATUSES.indexOf(status) + 1) % LAB_STATUSES.length];
        void changeStatus(next);
        break;
      }
      case 'n':
        e.preventDefault();
        setTab('journal');
        setTimeout(() => journalRef.current?.focus(), 0);
        break;
    }
  });

  if (error) return <p role="alert">Could not load lab: {error.message}</p>;
  if (!data) return <p>Loading…</p>;
  const { lab, neighbors } = data;
  const pct = total ? Math.round((checked.size / total) * 100) : 0;

  return (
    <>
      <div className="viewer-head">
        {neighbors.prev ? <Link to={`/labs/${neighbors.prev}`} role="button" aria-label="Previous lab">←</Link> : <button type="button" disabled aria-label="Previous lab">←</button>}
        <h1>
          {lab.labNumber ? `Lab ${String(lab.labNumber).padStart(2, '0')}: ` : ''}
          {lab.title}
        </h1>
        {lab.parseStatus !== 'ok' && !lab.missingFile ? <span className="chip warn">parsed partially</span> : null}
        <label>
          <span className="sr-only">Status</span>
          <select value={status} onChange={(e) => void changeStatus(e.target.value as LabStatus)} aria-label="Status">
            {LAB_STATUSES.map((s) => (
              <option key={s} value={s}>{LABELS[s]}</option>
            ))}
          </select>
        </label>
        <div className="progress">
          <div>{checked.size}/{total} steps</div>
          <div className="bar" role="progressbar" aria-label="Step progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={checked.size}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        {neighbors.next ? <Link to={`/labs/${neighbors.next}`} role="button" aria-label="Next lab">→</Link> : <button type="button" disabled aria-label="Next lab">→</button>}
      </div>

      {allChecked ? (
        <div className="banner" role="status">
          <span>Every step is checked.</span>
          <button type="button" className="primary" onClick={() => void changeStatus('completed')}>Mark completed</button>
          <button type="button" onClick={() => setAllChecked(false)}>Not yet</button>
        </div>
      ) : null}

      <div className="viewer">
        {lab.missingFile ? (
          <p className="card">The lab file is missing from the labs folder.</p>
        ) : (
          <LabFrame slug={slug} title={lab.title} checked={checked} onToggle={(i, v) => void toggle(i, v)} onKey={onKey} />
        )}
        <section className="panel" aria-label="Lab notes and steps">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" id="tab-steps" aria-selected={tab === 'steps'} aria-controls="panel-steps" onClick={() => setTab('steps')}>Steps</button>
            <button type="button" role="tab" id="tab-journal" aria-selected={tab === 'journal'} aria-controls="panel-journal" onClick={() => setTab('journal')}>Journal</button>
          </div>
          <div className="panel-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'steps' ? (
              <StepList steps={lab.steps} checked={checked} focusIndex={focusStep} onToggle={(i, v) => void toggle(i, v)} />
            ) : (
              <p>Journal editor loads here (Task 15).</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
```

`<Link role="button">` is used so prev/next are real links (middle-click works) and Playwright can find them by role. Disabled ends are real `<button disabled>`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build -w client`
Expected: exit 0. Manual smoke (server on fixtures plus `npm run dev -w client`): open `/labs/ad-user-onboarding`, confirm `0/9 steps`, tick a step in the side panel (the matching iframe checkbox ticks), tick one in the iframe (the panel and bar update), press `→` to go to Lab 2, and confirm `←` is disabled on Lab 1.

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "feat(client): lab viewer with sandboxed iframe, synced step panel, status and shortcuts"
```

---

### Task 15: Journal editor with autosave and pasted screenshots

**Files:**
- Create: `client/src/components/JournalEditor.tsx`
- Create: `client/src/lib/markdown.ts`, `client/src/lib/markdown.test.ts`
- Modify: `client/src/pages/LabViewer.tsx` (replace the placeholder)

**Interfaces:**
- Produces: `renderMarkdown(md: string): string` (sanitized HTML). `JournalEditor({ slug, initial: Journal | null, textareaRef })`.
- Consumes: `api.saveJournal`, `api.uploadAttachment`.

- [ ] **Step 1: Write the failing markdown test**

`client/src/lib/markdown.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders headings and keeps attachment images', () => {
    const html = renderMarkdown('## Title\n\n![shot](/api/attachments/abc)');
    expect(html).toContain('<h2');
    expect(html).toContain('<img');
    expect(html).toContain('/api/attachments/abc');
  });
  it('strips scripts and inline handlers', () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror="alert(1)">');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
  });
});
```

- [ ] **Step 2: Add the jsdom dev dependency and run the test to verify it fails**

Run: `npm install -D jsdom -w client && npx vitest run client/src/lib/markdown.test.ts`
Expected: FAIL (cannot resolve `./markdown`).

- [ ] **Step 3: Implement `markdown.ts`**

```ts
import DOMPurify from 'dompurify';
import { marked } from 'marked';

export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false, gfm: true, breaks: true }) as string;
  return DOMPurify.sanitize(html);
}
```

- [ ] **Step 4: Implement `JournalEditor.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type RefObject } from 'react';
import type { Journal } from '@lab-ledger/shared';
import { api } from '../lib/api';
import { renderMarkdown } from '../lib/markdown';

const TEMPLATE = '## What I did\n\n## What broke\n\n## How I fixed it\n\n## Commands that worked\n\n';

interface Props {
  slug: string;
  initial: Journal | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

type Fields = { bodyMd: string; timeTakenMin: number | null; difficulty: number | null; confidence: number | null };
const toNum = (v: string): number | null => (v === '' ? null : Number(v));

export function JournalEditor({ slug, initial, textareaRef }: Props) {
  const [fields, setFields] = useState<Fields>({
    bodyMd: initial && initial.bodyMd ? initial.bodyMd : TEMPLATE,
    timeTakenMin: initial?.timeTakenMin ?? null,
    difficulty: initial?.difficulty ?? null,
    confidence: initial?.confidence ?? null,
  });
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const latest = useRef(fields);
  const dirty = useRef(false);
  latest.current = fields;

  const save = async () => {
    dirty.current = false;
    setSaveState('saving');
    try {
      await api.saveJournal(slug, latest.current);
      setSaveState('saved');
    } catch {
      dirty.current = true;
      setSaveState('error');
    }
  };

  const change = (patch: Partial<Fields>) => {
    dirty.current = true;
    setSaveState('idle');
    setFields((f) => ({ ...f, ...patch }));
  };

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void save(), 800);
    return () => clearTimeout(t);
  }, [fields]);

  useEffect(
    () => () => {
      if (dirty.current) void api.saveJournal(slug, latest.current);
    },
    [slug],
  );

  const insert = (text: string) => {
    const ta = textareaRef.current;
    const body = latest.current.bodyMd;
    const start = ta?.selectionStart ?? body.length;
    const end = ta?.selectionEnd ?? body.length;
    change({ bodyMd: `${body.slice(0, start)}${text}${body.slice(end)}` });
  };

  const upload = async (file: File) => {
    try {
      const { url } = await api.uploadAttachment(slug, file);
      insert(`\n![screenshot](${url})\n`);
    } catch {
      setSaveState('error');
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    void upload(file);
  };

  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    void upload(file);
  };

  const preview = useMemo(() => renderMarkdown(fields.bodyMd), [fields.bodyMd]);

  return (
    <div className="journal">
      <div className="journal-fields">
        <label>
          Time taken (min)
          <input type="number" min={0} value={fields.timeTakenMin ?? ''} onChange={(e) => change({ timeTakenMin: toNum(e.target.value) })} />
        </label>
        <label>
          Difficulty (1-5)
          <input type="number" min={1} max={5} value={fields.difficulty ?? ''} onChange={(e) => change({ difficulty: toNum(e.target.value) })} />
        </label>
        <label>
          Confidence (1-5)
          <input type="number" min={1} max={5} value={fields.confidence ?? ''} onChange={(e) => change({ confidence: toNum(e.target.value) })} />
        </label>
      </div>
      <label>
        <span className="sr-only">Journal (Markdown)</span>
        <textarea
          ref={textareaRef}
          aria-label="Journal (Markdown)"
          value={fields.bodyMd}
          onChange={(e) => change({ bodyMd: e.target.value })}
          onPaste={onPaste}
          onDrop={onDrop}
          placeholder="Paste or drop a screenshot to attach it."
        />
      </label>
      <p role="status" aria-live="polite">
        {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed, will retry on next edit' : ''}
      </p>
      <h3>Preview</h3>
      <div className="journal-preview" dangerouslySetInnerHTML={{ __html: preview }} />
    </div>
  );
}
```

- [ ] **Step 5: Mount it in `LabViewer.tsx`**

Add the import and replace the journal placeholder. Key the editor by slug so its state resets between labs:

```tsx
import { JournalEditor } from '../components/JournalEditor';
```

```tsx
              <JournalEditor key={slug} slug={slug} initial={data.journal} textareaRef={journalRef} />
```

(replacing `<p>Journal editor loads here (Task 15).</p>`).

Fix for tab switching: the editor unmounts when the user flips to the Steps tab, which triggers the cleanup flush. When the user returns, `initial` is the stale `data.journal`. To avoid showing stale text, render both tabs but hide the inactive one: keep `StepList` and `JournalEditor` mounted and toggle `hidden`. Replace the tab body with:

```tsx
          <div className="panel-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            <div hidden={tab !== 'steps'}>
              <StepList steps={lab.steps} checked={checked} focusIndex={focusStep} onToggle={(i, v) => void toggle(i, v)} />
            </div>
            <div hidden={tab !== 'journal'}>
              <JournalEditor key={slug} slug={slug} initial={data.journal} textareaRef={journalRef} />
            </div>
          </div>
```

- [ ] **Step 6: Run the tests, typecheck, lint, build**

Run: `npx vitest run client && npm run typecheck && npm run lint && npm run build -w client`
Expected: markdown tests PASS (2), hotkeys tests PASS (2), the rest exit 0.

- [ ] **Step 7: Commit**

```bash
git add client package.json package-lock.json
git commit -m "feat(client): markdown journal with autosave and pasted screenshot upload"
```

---

### Task 16: End-to-end, security and accessibility tests

**Files:**
- Create: `playwright.config.ts`, `scripts/e2e-prepare.mjs`
- Create: `tests/e2e/01-labs.spec.ts`, `02-viewer.spec.ts`, `03-security.spec.ts`, `04-backup.spec.ts`, `05-a11y.spec.ts`, `99-new-lab.spec.ts`

**Interfaces:**
- Consumes: the built app (`npm run build`), served by `node server/dist/index.js` on port 4318 against a throwaway copy of the fixtures (`.e2e/labs`) and a fresh `.e2e/data`.

- [ ] **Step 1: Install the browser and write the config**

Run: `npx playwright install --with-deps chromium`
Expected: Chromium downloads.

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4318', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/e2e-prepare.mjs && PORT=4318 LABS_DIR=.e2e/labs DATA_DIR=.e2e/data WATCH_STABILITY_MS=300 npm run start',
    url: 'http://127.0.0.1:4318/api/labs',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
```

`scripts/e2e-prepare.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.e2e');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'data'), { recursive: true });
fs.cpSync(path.join(root, 'tests/fixtures/labs'), path.join(out, 'labs'), { recursive: true });
console.log('E2E sandbox ready at', out);
```

- [ ] **Step 2: Write the specs**

`tests/e2e/01-labs.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('lists the 7 labs newest first with correct titles', async ({ page }) => {
  await page.goto('/labs');
  const cards = page.locator('.lab-card');
  await expect(cards).toHaveCount(7);
  await expect(cards.first()).toContainText("PC Won't Wake From Sleep");
  await expect(cards.first()).toContainText('Lab 07');
  await expect(cards.last()).toContainText('AD User Onboarding');
  await expect(cards.last()).toContainText('Lab 01');
  await expect(cards.first()).toContainText('0/42');
  await expect(cards.last()).toContainText('0/9');
});

test('home shows zeroed stats and 12 topics', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('0/7', { exact: true })).toBeVisible();
  await expect(page.locator('ul[aria-label="Topic coverage"] > li')).toHaveCount(12);
  await expect(page.getByRole('link', { name: 'Open' })).toBeVisible();
});
```

`tests/e2e/02-viewer.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('step progress persists across reload and syncs with the iframe', async ({ page }) => {
  await page.goto('/labs/ad-user-onboarding');
  await expect(page.getByText('0/9 steps')).toBeVisible();

  await page.getByRole('checkbox', { name: /Do 1 for ad-user-onboarding/ }).check();
  await expect(page.getByText('1/9 steps')).toBeVisible();
  const frame = page.frameLocator('iframe[title^="Lab:"]');
  await expect(frame.locator('input[type="checkbox"]').first()).toBeChecked();

  await frame.locator('input[type="checkbox"]').nth(1).check();
  await expect(page.getByText('2/9 steps')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Do 2 for ad-user-onboarding/ })).toBeChecked();

  await page.reload();
  await expect(page.getByText('2/9 steps')).toBeVisible();
  await expect(frame.locator('input[type="checkbox"]').first()).toBeChecked();
  await expect(page.getByLabel('Status')).toHaveValue('in_progress');
});

test('arrow keys navigate and the ends disable their buttons', async ({ page }) => {
  await page.goto('/labs/ad-user-onboarding');
  await expect(page.getByRole('button', { name: 'Previous lab' })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/labs\/gpo-drive-mapping$/);
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/\/labs\/ad-user-onboarding$/);

  await page.goto('/labs/windows-wont-wake-from-sleep');
  await expect(page.getByRole('button', { name: 'Next lab' })).toBeDisabled();
  await expect(page.getByText('0/42 steps')).toBeVisible();
});

test('journal autosaves and a pasted screenshot renders after reload', async ({ page }) => {
  await page.goto('/labs/gpo-drive-mapping');
  await page.getByRole('tab', { name: 'Journal' }).click();
  const box = page.getByLabel('Journal (Markdown)');
  await box.fill('## What I did\nMapped the drive.');
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({ timeout: 5000 });

  const uploaded = page.waitForResponse((r) => r.url().includes('/attachments') && r.request().method() === 'POST');
  await page.evaluate(async (b64) => {
    const ta = document.querySelector('textarea')!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'x.png', { type: 'image/png' }));
    ta.focus();
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG_B64);
  expect((await uploaded).status()).toBe(200);
  await expect(box).toHaveValue(/!\[screenshot\]\(\/api\/attachments\/[0-9a-f-]{36}\)/);
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({ timeout: 5000 });

  await page.reload();
  await page.getByRole('tab', { name: 'Journal' }).click();
  await expect(page.getByLabel('Journal (Markdown)')).toHaveValue(/Mapped the drive/);
  const img = page.locator('.journal-preview img');
  await expect(img).toBeVisible();
  const src = await img.getAttribute('src');
  expect((await page.request.get(src!)).status()).toBe(200);
});

test('completing every step offers to mark the lab completed', async ({ page }) => {
  await page.goto('/labs/ad-user-onboarding');
  const boxes = page.locator('ol[aria-label="Steps"] input[type="checkbox"]');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  await page.getByRole('button', { name: 'Mark completed' }).click();
  await expect(page.getByLabel('Status')).toHaveValue('completed');
  await page.goto('/');
  await expect(page.getByText('1/7', { exact: true })).toBeVisible();
});
```

`tests/e2e/03-security.spec.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

test('iframe is sandboxed without allow-scripts and raw HTML carries the CSP', async ({ page }) => {
  await page.goto('/labs/ad-user-onboarding');
  const sandbox = await page.locator('iframe[title^="Lab:"]').getAttribute('sandbox');
  expect(sandbox).toBe('allow-same-origin');
  expect(sandbox).not.toContain('allow-scripts');
  const raw = await page.request.get('/api/labs/ad-user-onboarding/raw');
  expect(raw.headers()['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src data:");
});

test('no external network requests on any page', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (!['http:', 'https:'].includes(u.protocol)) return;
    if (u.origin !== 'http://127.0.0.1:4318') external.push(req.url());
  });
  for (const url of ['/', '/labs', '/labs/ad-user-onboarding', '/labs/windows-wont-wake-from-sleep', '/settings']) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
  }
  expect(external).toEqual([]);
});

test('built client assets reference no external origins', () => {
  const dist = path.resolve('client/dist');
  const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  expect(index).not.toMatch(/<(script|link)[^>]+(src|href)=["']https?:/i);
  const assets = path.join(dist, 'assets');
  for (const f of fs.readdirSync(assets)) {
    const text = fs.readFileSync(path.join(assets, f), 'utf8');
    if (f.endsWith('.css')) expect(text).not.toMatch(/url\(\s*["']?https?:/i);
    if (f.endsWith('.js')) {
      expect(text).not.toMatch(/fetch\(\s*["'`]https?:/);
      expect(text).not.toMatch(/new\s+(WebSocket|EventSource)\(\s*["'`](https?|wss?):/);
    }
  }
});
```

`tests/e2e/04-backup.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('backup downloads valid JSON and Markdown', async ({ page }) => {
  const json = await page.request.get('/api/backup');
  expect(json.status()).toBe(200);
  const body = await json.json();
  expect(body.version).toBe(1);
  expect(body.journals.length).toBeGreaterThan(0);
  const md = await page.request.get('/api/backup/markdown');
  expect(md.headers()['content-type']).toContain('text/markdown');
  expect(await md.text()).toContain('Mapped the drive');
});

test('restoring the backup into the same app keeps data identical', async ({ page }) => {
  const before = await (await page.request.get('/api/backup')).json();
  const res = await page.request.post('/api/restore', { data: before });
  expect(res.status()).toBe(200);
  const after = await (await page.request.get('/api/backup')).json();
  expect({ ...after, exportedAt: '' }).toEqual({ ...before, exportedAt: '' });
});
```

`tests/e2e/05-a11y.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

const PAGES = ['/', '/labs', '/labs/ad-user-onboarding', '/settings'];

for (const scheme of ['light', 'dark'] as const) {
  for (const url of PAGES) {
    test(`no serious axe violations on ${url} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.addInitScript((s) => localStorage.setItem('theme', s), scheme);
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('iframe')
        .analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
}
```

`tests/e2e/99-new-lab.spec.ts` (runs last, because it adds an eighth lab):

```ts
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const LAB = `<html><head><title>Lab 08: Toast Test</title></head><body><h1>Toast Test</h1>
<h2>Steps</h2><div><label><input type="checkbox"> one</label></div><div><label><input type="checkbox"> two</label></div></body></html>`;

test('a new lab appears within 5s without reload, with a toast', async ({ page }) => {
  await page.goto('/labs');
  await expect(page.locator('.lab-card')).toHaveCount(7);

  const dir = path.resolve('.e2e/labs');
  fs.appendFileSync(path.join(dir, 'lab-log.txt'), '2026-10-30 | Lab 08 | Intune enrollment | toast-test\n');
  fs.writeFileSync(path.join(dir, '2026-10-30-toast-test.html'), LAB);

  await expect(page.getByRole('status').filter({ hasText: 'New lab: Toast Test' })).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.lab-card')).toHaveCount(8, { timeout: 5000 });
  await expect(page.locator('.lab-card').first()).toContainText('Toast Test');
});
```

- [ ] **Step 3: Run the full E2E suite**

Run: `npm run e2e`
Expected: the build runs, then all specs PASS. If a test fails, use `systematic-debugging`: read the trace (`npx playwright show-trace test-results/…/trace.zip`), find the root cause, and fix the app or the test. Don't add sleeps. Known risks:
- The pasted-image test depends on Chromium accepting a synthetic `ClipboardEvent`. If React doesn't receive it, dispatch on `document.activeElement` instead.
- `PNG_B64` only needs valid magic bytes for the server. If the preview image fails to decode, the `toBeVisible` assertion may fail. In that case replace the base64 with a known-good 1×1 PNG, and keep the status-200 assertion.
- axe colour-contrast findings point at `app.css` variables. Fix the variables, not the test.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts scripts/e2e-prepare.mjs tests/e2e
git commit -m "test: Playwright E2E, security and axe accessibility suites"
```

---

### Task 17: README, final verification, and branch wrap-up

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the README**

Replace `README.md` with:

````markdown
# Lab-Ledger (Lab Dashboard)

A personal, local-first web app for browsing the daily IT labs in `/workspace/labs` and recording what I did in each one. It is a practice log, an interview-prep tool, and a portfolio.

Phase 1 covers lab ingestion and live reload, a sandboxed lab viewer, step progress and status, a Markdown journal with pasted screenshots, home stats, and JSON/Markdown backup. See `docs/superpowers/specs/2026-10-31-lab-dashboard-phase1-spec.md` for the full spec and `docs/lab-dashboard-design-doc.md` for the roadmap.

## Run it

```bash
npm install
npm run dev          # API on :4317, client on http://localhost:5173
```

Production-style (one process on :4317):

```bash
npm run build && npm start
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `LABS_DIR` | `/workspace/labs` | Folder of `YYYY-MM-DD-<slug>.html` labs plus `lab-log.txt` (read-only) |
| `DATA_DIR` | `./data` | SQLite DB, attachments |
| `PORT` | `4317` | API and (in production) client port |
| `HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` only behind Tailscale or similar |

Copy `.env.example` and export the variables, or prefix the command, for example `LABS_DIR=./tests/fixtures/labs npm run dev`.

If you have no labs yet, point `LABS_DIR` at `tests/fixtures/labs` (synthetic labs made by `npm run fixtures`).

## Backup and restore

Settings -> **Download JSON backup** (progress, journals, screenshots, activity) or **Download Markdown notes**. Restore from the same page. Restoring **replaces** all user data. The API equivalents are `GET /api/backup`, `GET /api/backup/markdown`, and `POST /api/restore`.

## Tests

```bash
npm test             # unit and integration (Vitest)
npm run e2e          # builds, then Playwright incl. security and axe checks
npm run lint && npm run typecheck
```

The lab HTML files are never modified by the app or the tests.
````

- [ ] **Step 2: Run the full verification (use `verification-before-completion`)**

Run, and read the full output of each:

```bash
npm run fixtures && git diff --exit-code tests/fixtures
npm test
npm run lint
npm run typecheck
npm run build
npm run e2e
git status --short
```

Expected:
- `git diff --exit-code tests/fixtures` exits 0. The generator is deterministic and the fixtures are byte-identical after the run.
- Vitest: all suites pass, with 0 failures.
- Lint and typecheck: exit 0.
- Build: exit 0 (client `dist/` and server `dist/index.js`).
- E2E: all specs pass, including the iframe sandbox, zero-external-requests, and axe checks.
- `git status` shows only intended changes. `data/`, `.e2e/`, `dist/`, and `node_modules/` are ignored.

Then tick each Phase 1 acceptance criterion in `docs/superpowers/specs/2026-10-31-lab-dashboard-phase1-spec.md` §8 against the passing test named there. If any criterion has no passing proof, fix that before continuing.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with setup, configuration, backup/restore and test commands"
```

- [ ] **Step 4: Finish the branch (use `finishing-a-development-branch`)**

Push the branch and open or update the PR. In the PR description list any deviations from the design doc (spec §3 decisions D1–D12 plus anything discovered during the build), and the exact commands run in Step 2 with their results.

---

## Self-Review

**Spec coverage** (spec requirement to task):
- R-ING-1..11: Tasks 4 (parse, regex, status, fallbacks), 5 (log, topics), 7 (scan, hash skip, duplicates, placeholders, never-write), 8 (watch, scheduler), 9 (SSE, rescan route).
- R-STEP-1..5: Tasks 4 (index, key, hash), 5 and 7 (remap on re-parse), 9 (toggle, auto in_progress, allChecked, status, activity).
- R-VIEW-1..5: Task 14 (layout, sync, neighbors, shortcuts, badge and missing notice). Mobile stacking is the CSS in Task 12.
- R-JRN-1..4: Task 10 (API, upload rules), Task 15 (autosave, template, paste, drop, preview).
- R-STAT-1..2: Task 10 (`buildStats`, streaks per D10), Task 13 (Home UI).
- R-BAK-1..4: Task 10 (backup, restore, validation, Markdown), Task 13 (Settings UI), Task 16 (restore round-trip over HTTP).
- Non-functional: CSP and sandbox (Tasks 9, 14, 16), no external requests (Task 16), a11y (Task 16), theme (Task 12), bind address (Task 1 config).
- Spec §8 acceptance table: each row has a named test in Tasks 7, 8, 10, and 16.

**Placeholder scan:** I looked for "TBD", "TODO", "similar to Task N", and prose-only steps. The only forward reference is the Journal tab placeholder text in Task 14, and Task 15 replaces it with complete code.

**Type consistency:** `ProgressRow` is defined in `stepMatch.ts` (Task 5) and used in `repo.ts` (Task 6) and `scan.ts` (Task 7). `AppContext` is defined in Task 9 and used by every route registrar and `makeTestApp`. `LabEventPayload` is defined in shared (Task 2) and used by `LabEvents`, `service.ts`, and the client `events.ts`. Route registrar names (`registerLabRoutes`, `registerProgressRoutes`, `registerJournalRoutes`, `registerAttachmentRoutes`, `registerStatsRoutes`, `registerBackupRoutes`) match between Tasks 9 and 10. `api.toggleStep` returns `{checked, status, allChecked}`, matching the server route in Task 9.

**Known risks the executor should expect:** dependency majors are pinned to versions the code was written against. If `npm install` resolves something different or fails, fix the pin. Don't rewrite code to chase a newer major. None of this plan's code has been executed yet; Tasks 4, 7, 10, and 16 are where I expect small corrections.
