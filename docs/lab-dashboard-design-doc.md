# Lab Dashboard — Design Document

**Owner:** Jamie Scott · **Builder:** Cursor (AI coding agent) · **Status:** Phase 2 in progress · **Date:** 2026-10-29

A personal, local-first web app for browsing the daily IT labs committed in this repository's `labs/` directory and recording what I did in each one. I'm a recent Information Science grad aiming for entry-level IT Support, Help Desk, or junior sysadmin roles. The app turns the labs into a practice log, an interview-prep tool, and a portfolio.

---

## 0. Instructions for Cursor (read first)

### Prompt to paste
> Build the "Lab Dashboard" described in `lab-dashboard-design-doc.md`. Use Vite + React + TypeScript for the client and a small Node (Fastify) server with SQLite (better-sqlite3). Implement Phase 1 (MVP) completely and make every Phase 1 acceptance criterion pass, along with the tests in §9. Use the defaults in §0.4 for any open question; don't stop to ask. Never modify the source lab HTML files. Make no external network calls at runtime. When you finish, print how to run it (`npm install && npm run dev`) and list any deviations.

### Repository structure
```
lab-dashboard/
├─ labs/                    # canonical, committed lab HTML and lab-log.txt
├─ package.json            # npm workspaces: server, client, shared
├─ .env.example            # LABS_DIR, DATA_DIR, PORT
├─ shared/src/types.ts     # Lab, Progress, Journal, etc. (single source of truth)
├─ server/src/
│  ├─ index.ts             # Fastify bootstrap, static client in prod
│  ├─ config.ts
│  ├─ db/{schema.sql,migrate.ts,repo.ts}
│  ├─ ingest/{scan.ts,parse.ts,labLog.ts,watch.ts,topics.ts}
│  ├─ routes/{labs.ts,progress.ts,journal.ts,questions.ts,export.ts,search.ts,attachments.ts}
│  └─ export/{markdown.ts,html.ts}
├─ client/src/
│  ├─ pages/{Home,LabList,LabViewer,Practice,Search,Export,Settings}.tsx
│  ├─ components/{LabFrame,StepList,JournalEditor,TicketEditor,StatCard,TopicGrid}.tsx
│  ├─ hooks/ lib/api.ts  styles/
├─ tests/fixtures/         # isolated lab copies plus malformed parser inputs
├─ Dockerfile, docker-compose.yml
└─ data/                   # gitignored: app.db, attachments/, backups/
```

### Conventions
- TypeScript strict mode, ESM, Prettier and ESLint defaults. Validate API input with zod (use the schemas in `shared`).
- The lab HTML files are read-only inputs. Store all user data in `DATA_DIR`.
- The lab **slug** is the stable ID (from the filename). Never key anything on the title.
- Small commits, one per milestone item.

### Open questions and the defaults to use
| Question | Default |
|---|---|
| Port | `5173` client (dev), `4317` API; prod serves both on `4317` |
| Labs folder | Repository-owned `./labs`; `LABS_DIR` can override it |
| Data folder | `DATA_DIR`, default `./data` |
| Week start / streak timezone | `America/New_York`; a day counts if any step is checked or the lab is marked Completed |
| Streak rule | Consecutive calendar days with activity. Skipped labs neither break nor extend it |
| PDF export | Use the browser's print stylesheet on the HTML export (no headless Chrome dependency) |
| Markdown editor | `@uiw/react-md-editor` (offline) or a textarea with a preview pane |
| Duplicate slug / date | Newest file mtime wins; log a warning |
| Auth | None; bind to `127.0.0.1` by default |
| Spaced repetition | Leitner boxes 1–5 (intervals of 1, 2, 4, 8, 16 days) |

---

## 1. Goals and non-goals

**Goals**
- Flip through every daily lab in order, with prev/next and arrow keys.
- Pick up new labs automatically (one arrives daily at **9:13 AM ET**).
- Track step completion, status, time spent, difficulty, and confidence for each lab.
- Keep a Markdown journal and a ticket write-up for each lab, with pasted screenshots.
- Practice the interview questions with self-rating and lightweight spaced repetition.
- Export completed labs and notes to a portfolio (Markdown and static HTML, plus PDF via print).
- Use free tools only, run locally, and stay usable offline.

**Non-goals**
- Multiple users, accounts, or authentication (Phase 1).
- Job-search features (applications, résumé, job boards).
- Editing or generating lab content.
- Cloud hosting, telemetry, or any third-party API calls.

---

## 2. Stack

**Recommendation:** Vite + React + TypeScript (client) and Node + Fastify + better-sqlite3 (server), with chokidar for folder watching, cheerio for HTML parsing, and SQLite FTS5 for search. Run with `npm run dev` (concurrently), or `docker compose up` for the Pi.

Why this stack:
- It's all free, and SQLite is a single file that's easy to back up.
- It needs a real backend process anyway, for watching the folder and writing files, so a static SPA alone won't do.
- Vite gives fast hot reload, and the stack is mainstream, so the coding agent will be reliable with it.
- It runs on a Raspberry Pi (arm64). For a homelab deploy, put it behind Caddy (`reverse_proxy localhost:4317`) and expose it only over Tailscale.

**Alternative:** Next.js (App Router) with route handlers and SQLite. This gives a single framework, but folder watching in a long-running process works poorly with Next's dev and serverless model. Choose it only if Jamie wants to learn Next.

---

## 3. Lab ingestion

### 3.1 What the real files look like (observed 2026-10-29)
- **Filename:** `YYYY-MM-DD-<slug>.html`, for example `2026-10-29-windows-wont-wake-from-sleep.html`. Regex: `^(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)\.html$`.
- **Index:** `lab-log.txt`, one line per lab, with pipe-separated fields:
  ```
  2026-10-23 | Lab 01 | AD users/groups | ad-user-onboarding
  YYYY-MM-DD | Lab NN | <topic label (free text)> | <slug>
  ```
  Regex: `^(\d{4}-\d{2}-\d{2})\s*\|\s*Lab\s+(\d+)\s*\|\s*(.+?)\s*\|\s*([a-z0-9-]+)\s*$`.
- **Self-contained HTML:** a `<style>` block or inline styles, with no external scripts.
- **`<title>`:** `Lab NN: Title` or `Lab NN – Title` (en dash). The `<h1>` holds the display title, sometimes without the "Lab NN" prefix.
- **Sections:** each one is an `<h2>`, and the content runs until the next `<h2>`. Heading wording **varies** between files:

| Canonical section | Heading variants seen (case-insensitive match) |
|---|---|
| scenario | "Skill & Scenario", "The ticket" |
| time | "Time Estimate" (Lab 01). Otherwise found in `span.tag` text with ⏱ or in phase headings ("~10 min") |
| prerequisites | "Prerequisites", "Prerequisites (all free)" |
| steps | "Steps", or several "Phase N: …" headings |
| verify | "Verify It Worked", "Verify it worked" |
| cleanup | "Cleanup", "Cleanup / rollback" |
| ticketTemplate | "Ticket write-up template" (Lab 07) |
| interview | "Interview Questions", "Interview questions" |
| stretch | starts with "Stretch goal" |
| other | anything else (e.g. "Decision tree", "Isolation test matrix") |

- **Steps / checkboxes:** each step is `<label><input type="checkbox"> …step text…</label>`, with the step body (`<pre>`, `<p>`) as siblings inside a wrapping `<div>`. Lab 01 uses `div.card.step`. Later labs use unclassed `<div>`s with inline styles, and the step text is wrapped in `<b>`. Checkboxes have no `id`/`name`. Counts per lab: 9, 12, 12, 15, 13, 14, 42 (checkboxes also appear in Verify and Cleanup sections).
- **Other markers:** `span.tag` (topic tags plus time, Lab 01), `div.card.ticket`, `div.card.warn` (safety banner).
- **Interview Q&A:** `<details><summary>Question</summary>Answer…</details>`, three per lab.

**Parsing rule:** select `input[type=checkbox]` in document order and assign `stepKey = <slug>#<index>`. Also store a hash of the label text (`sha1(normalizedText)`) so progress survives small edits to a lab. If the index and the hash disagree, match by hash first, then by index.

### 3.2 Pipeline
1. **Scan** `LABS_DIR` on startup, and again via `POST /api/labs/rescan`.
2. **Watch** with chokidar (`add`, `change`, `unlink`, `awaitWriteFinish: 2000ms`). As a safety net, also run a cron-style rescan at 9:20 AM ET daily and every 15 minutes. Push updates to the client over SSE (`GET /api/events`) so the dashboard shows a "New lab" toast.
3. **Parse** with cheerio: title, labNumber, date, slug, sections, steps, questions, tags, and time estimate (regex `(\d+)\s*[–-]\s*(\d+)\s*min` or `~(\d+)\s*min`. Sum the phase minutes if no total is found).
4. **Merge with `lab-log.txt`.** The log supplies `labNumber` and `topicLabel`; the file supplies everything else. A file without a log line is still ingested (labNumber taken from the title). A log line without a file shows as "missing file".
5. **Classify topic** by mapping topicLabel, tags, and title keywords to the canonical rotation in `topics.ts`:
   `ad-gpo, m365-entra, intune, windows-troubleshooting, powershell, linux, networking, dns-dhcp, backups, security-hardening, ticket-writeups, docker`. Keyword examples: "AD", "GPO" → ad-gpo; "Entra", "Graph", "M365" → m365-entra.
6. **Fallback:** if parsing throws or finds no title or steps, set `parseStatus = 'partial' | 'failed'`, keep the raw file, still list the lab (title taken from the filename slug), and render the raw iframe. The UI shows a small "parsed partially" badge.
7. **Hashing:** store the `sha256` of each file and skip re-parsing unchanged files.

### 3.3 Rendering
- The primary view is a **sandboxed iframe**: `<iframe sandbox="allow-same-origin" srcdoc=…>`, with **no** `allow-scripts`. The server sends `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:`.
- Checkbox sync: the parent page (same origin, no scripts inside the frame) attaches listeners to the iframe's `input[type=checkbox]` after load, restores their state, and writes changes back. There's also a native **StepList** side panel built from parsed steps, which is the fallback when the iframe can't be wired.
- A "Sections" tab view renders the parsed sections from sanitized HTML (DOMPurify) for quicker reading on mobile.

### 3.4 Normalized model
```ts
type LabStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';
type Topic = 'ad-gpo'|'m365-entra'|'intune'|'windows-troubleshooting'|'powershell'|'linux'
  |'networking'|'dns-dhcp'|'backups'|'security-hardening'|'ticket-writeups'|'docker'|'other';
interface Lab {
  slug: string; date: string; labNumber: number | null; title: string;
  topicLabel: string | null; topics: Topic[]; tags: string[];
  timeEstimateMin: { low: number; high: number } | null;
  scenarioText: string | null; prerequisites: string[];
  steps: { index: number; key: string; textHash: string; text: string; section: string }[];
  questions: { index: number; question: string; answerHtml: string }[];
  sections: { kind: string; heading: string; html: string }[];
  fileName: string; fileHash: string; parseStatus: 'ok' | 'partial' | 'failed';
  ingestedAt: string; missingFile?: boolean;
}
```

---

## 4. Features

| # | Feature | Details |
|---|---|---|
| F1 | Dashboard home | Stat cards: completed / total, current and longest streak, total logged time, average difficulty. Topic coverage grid of the 12 rotation topics (count plus completion %). "Today's lab" card. Last 5 journal entries |
| F2 | Lab list | Table or cards sorted by date (newest first). Filters: status, topic, tag, date range, has-notes. Text search. Status chips: Not started / In progress / Completed / Skipped |
| F3 | Viewer | Lab iframe plus a right panel (steps, journal, ticket, questions tabs). Prev/next buttons and ←/→ keys. Status selector. Progress bar (checked/total) |
| F4 | Step progress | Persisted per stepKey. The first checked step sets status to In progress automatically. When every step is checked, prompt "Mark completed?" |
| F5 | Journal | Markdown editor with a starter template: *What I did / What broke / How I fixed it / Commands that worked*. Structured fields: time taken (min), difficulty 1–5, confidence 1–5. Paste or drag screenshots, stored in `data/attachments/<slug>/`. Autosaves (debounced 800 ms) |
| F6 | Ticket write-up | Per-lab form: Ticket #, Requester, Issue, Impact, Troubleshooting steps, Root cause, Resolution, Time to resolve, Follow-up. Prefilled from the lab's scenario or ticket card and its Ticket template section when present. Exports as Markdown |
| F7 | Interview practice | Deck of all questions, filterable by topic. Question → "Reveal answer" → self-rate (Again / Hard / Good / Easy). Leitner box update. A "Due today" count shows on the home page |
| F8 | Portfolio export | Choose completed labs → Markdown bundle (`README.md` plus one file per lab) or a single static HTML page with a print CSS (PDF via browser print). Each item includes lab title, skill, my journal, ticket write-up, and selected screenshots. A **scrub warning** and a pre-export scanner flag IPs, emails, hostnames, `password`/`secret`/`token` strings, and GUIDs for review |
| F9 | Search | SQLite FTS5 over lab text, journals, and ticket write-ups, with highlighted snippets. Cmd/Ctrl+K opens it |
| F10 | Backup | One-click JSON dump of all user data plus a Markdown export of the notes. Nightly auto-backup to `data/backups/` (keep 14) |

---

## 5. Data model, file layout, API

### 5.1 SQLite schema
```sql
CREATE TABLE labs (slug TEXT PRIMARY KEY, date TEXT NOT NULL, lab_number INTEGER,
  title TEXT NOT NULL, topic_label TEXT, topics TEXT /*json*/, tags TEXT /*json*/,
  time_low INTEGER, time_high INTEGER, parsed_json TEXT NOT NULL, file_name TEXT,
  file_hash TEXT, parse_status TEXT, missing_file INTEGER DEFAULT 0, ingested_at TEXT);
CREATE TABLE lab_state (slug TEXT PRIMARY KEY REFERENCES labs, status TEXT NOT NULL DEFAULT 'not_started',
  started_at TEXT, completed_at TEXT, updated_at TEXT);
CREATE TABLE step_progress (slug TEXT, step_index INTEGER, text_hash TEXT, checked INTEGER,
  checked_at TEXT, PRIMARY KEY (slug, step_index));
CREATE TABLE journals (slug TEXT PRIMARY KEY, body_md TEXT, time_taken_min INTEGER,
  difficulty INTEGER CHECK(difficulty BETWEEN 1 AND 5), confidence INTEGER CHECK(confidence BETWEEN 1 AND 5),
  updated_at TEXT);
CREATE TABLE tickets (slug TEXT PRIMARY KEY, fields_json TEXT, updated_at TEXT);
CREATE TABLE attachments (id TEXT PRIMARY KEY, slug TEXT, file_name TEXT, mime TEXT, bytes INTEGER, created_at TEXT);
CREATE TABLE question_reviews (slug TEXT, q_index INTEGER, box INTEGER DEFAULT 1, last_rating TEXT,
  last_reviewed TEXT, due_date TEXT, PRIMARY KEY (slug, q_index));
CREATE TABLE activity (id INTEGER PRIMARY KEY, day TEXT, slug TEXT, kind TEXT, at TEXT); -- streaks
CREATE VIRTUAL TABLE search_idx USING fts5(slug UNINDEXED, kind UNINDEXED, title, body);
```

### 5.2 Data layout
```
data/app.db
data/attachments/<slug>/<uuid>.png
data/backups/2026-10-29T0300.json
data/exports/portfolio-<date>/
```

### 5.3 API (JSON, prefix `/api`)
| Method & path | Purpose |
|---|---|
| GET `/labs?status=&topic=&q=` | List (summary fields + state) |
| GET `/labs/:slug` | Full parsed lab + state + neighbors {prev,next} |
| GET `/labs/:slug/raw` | Original HTML, with CSP header |
| POST `/labs/rescan` | Force rescan |
| GET `/events` | SSE: `lab:added`, `lab:updated`, `lab:removed` |
| PUT `/labs/:slug/status` | Set status |
| GET/PUT `/labs/:slug/steps` | Step states / toggle `{index, checked}` |
| GET/PUT `/labs/:slug/journal` | Journal |
| GET/PUT `/labs/:slug/ticket` | Ticket write-up |
| POST `/labs/:slug/attachments` · GET `/attachments/:id` | Upload / serve images (png/jpg/webp, ≤10 MB) |
| GET `/questions/due` · POST `/questions/:slug/:i/review` | Practice |
| GET `/stats` | Home stats, streaks, topic coverage |
| GET `/search?q=` | FTS results |
| POST `/export/portfolio` `{slugs, format}` · POST `/export/scrub-check` | Export / sensitive-data scan |
| GET `/backup` · POST `/restore` | JSON backup/restore |

---

## 6. UI/UX

**Pages:** Home `/`, Labs `/labs`, Viewer `/labs/:slug`, Practice `/practice`, Search `/search`, Export `/export`, Settings `/settings` (labs path, theme, backup).

```
┌ Lab Dashboard ─────────────── [Search ⌘K] [☀/☾] ┐
│ Completed 4/7   Streak 3d (best 5)   12.5 h      │
│ Today: Lab 07 – PC won't wake  [Open →]          │
│ Topic coverage: [AD●][Entra●][Intune●][Win●●]... │
│ Questions due: 6 [Practice]   Recent notes ...   │
└──────────────────────────────────────────────────┘
Viewer:
┌ ← Lab 06 | Lab 07: PC Won't Wake | Lab 08 → [Status ▾] ▓▓▓░░ 18/42 ┐
│ ┌──── lab iframe (60%) ────┐ ┌ Tabs: Steps|Journal|Ticket|Q&A ─┐    │
│ │                          │ │ ☑ 0. Back up power scheme       │    │
│ │                          │ │ ☐ 1. Which sleep states…        │    │
│ └──────────────────────────┘ └─────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```
On mobile (<768 px) the panel stacks under the lab as a bottom sheet.

**Theme:** light and dark via CSS variables, following `prefers-color-scheme`, with a toggle. The lab iframe keeps its own light styling. Optionally invert it with a "dim lab" filter.

**Keyboard shortcuts:** `←/→` prev/next lab, `j/k` next/prev step, `Space` toggle the focused step, `s` cycle status, `n` focus journal, `Ctrl/Cmd+K` search, `r` reveal answer, `1–4` rate in practice, `?` shortcut help. Shortcuts are disabled while typing in inputs.

**Accessibility:** WCAG 2.1 AA contrast, all actions keyboard-reachable, visible focus rings, ARIA labels on icon buttons, `aria-live` for save and new-lab toasts, an iframe `title`, and support for reduced motion.

---

## 7. Security and privacy
- Lab HTML renders only in a sandboxed iframe without `allow-scripts`, under a strict CSP. Parsed section HTML is sanitized with DOMPurify.
- No external network calls: no CDNs, fonts, or analytics. Bundle everything. A test asserts that the built assets contain no `http(s)://` fetches.
- The server binds to `127.0.0.1` by default. For the Pi, set `HOST=0.0.0.0` and use Tailscale only. Optional Caddy basic auth.
- Uploads are validated by MIME type and magic bytes, renamed to UUIDs, and served with `Content-Disposition: inline` and `nosniff`.
- Path safety: only files matching the filename regex inside `LABS_DIR` are read (no traversal).
- Backups: JSON (complete and restorable) plus Markdown (human-readable). Portfolio export runs the scrub check and requires an "I've reviewed for sensitive info" confirmation.

---

## 8. Milestones

### Phase 1 — MVP
1. Scaffold the workspaces, config, and DB migrations.
2. Ingestion: scan, parse, lab-log merge, watcher, SSE.
3. Lab list and viewer with sandboxed iframe, prev/next, and arrow keys.
4. Step progress and status.
5. Journal with structured fields and screenshot paste.
6. Home stats and topic coverage.
7. JSON and Markdown backup.

**Acceptance criteria**
- [ ] `npm install && npm run dev` starts the app. All 7 existing labs list in date order with correct titles, lab numbers 1–7, and topics.
- [ ] Copying a new `2026-10-30-*.html` into the folder (plus a log line) makes it appear within 5 s without a reload, with a toast.
- [ ] A malformed or empty HTML file is listed with a "partial/failed" badge and does not crash ingestion.
- [ ] Lab 07 shows 42 steps and Lab 01 shows 9. Checking a step persists across a browser restart and syncs between the iframe and the side panel.
- [ ] ←/→ navigate between labs. The first and last labs disable the corresponding button.
- [ ] The journal autosaves, and a pasted screenshot is stored and renders after reload.
- [ ] Home shows the correct completed count, streak, total time, and 12-topic coverage.
- [ ] The iframe has no `allow-scripts`, and the network tab shows zero external requests.
- [ ] Backup downloads JSON that restores into a fresh DB identically.

### Phase 2
Ticket write-up editor, interview practice with Leitner scheduling, FTS search with Cmd+K, portfolio export (MD/HTML/print-PDF) with scrub check, filters and tags, a Sections reading view, a shortcut help overlay, and Docker/compose.

### Phase 3 (stretch)
Obsidian sync (write `<vault>/Labs/<slug>.md` with YAML front-matter, two-way on mtime), a GitHub-style calendar heatmap, Raspberry Pi deploy guide (Caddy + Tailscale, systemd or compose), a PWA for offline phone use, a weekly review summary, and a skill-gap view comparing topic coverage with target job requirements (manual list, no job-search features).

---

## 9. Testing plan
| Layer | Tool | Cases |
|---|---|---|
| Parser unit | Vitest | Each of the 7 fixture labs: title, lab number, step count (9/12/12/15/13/14/42), 3 questions, time estimate where present. Heading variants map to canonical sections. Malformed HTML gives partial or failed status. Bad filenames are ignored |
| lab-log | Vitest | Parses all 7 lines. Tolerates extra whitespace and pipes inside the topic label. Handles missing-file and missing-log cases |
| Topics | Vitest | "Windows troubleshooting, real-world…" → windows-troubleshooting. "M365/Entra" → m365-entra |
| Step matching | Vitest | Reordered or edited lab keeps progress through the hash match |
| API | Vitest + supertest | CRUD for steps, journal, ticket, reviews. zod rejects bad input. Path traversal is blocked |
| Watcher | Integration | Add, change, or delete a file in a temp dir produces the right SSE events within 5 s |
| E2E | Playwright | Open the app, flip labs with arrow keys, check a step, reload and still see it checked, write a journal, paste an image, export a backup |
| Security | Playwright/unit | Iframe sandbox attribute present, CSP header present, no external requests |
| A11y | @axe-core/playwright | No serious violations on any page, in both themes |

**Final checklist:** all Phase 1 criteria pass, `npm test` and `npm run e2e` are green, `npm run build` succeeds, README covers setup, env vars, backup and restore, and the Pi deploy, and source lab files are byte-identical before and after a test run.
