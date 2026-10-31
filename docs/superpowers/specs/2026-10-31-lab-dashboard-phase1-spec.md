# Lab Dashboard — Phase 1 (MVP) Build Spec

**Source of truth for product intent:** `docs/lab-dashboard-design-doc.md` (2026-10-29).
**This document:** the build-ready contract for Phase 1. It resolves ambiguities and conflicts in the design doc, so the implementer doesn't have to guess. If this spec and the design doc disagree, this spec wins for Phase 1.
**Companion plan:** `docs/superpowers/plans/2026-10-31-lab-dashboard-phase1.md`

---

## 1. Purpose

A local-first web app that lists the daily IT labs from a folder of HTML files, lets Jamie flip through them, tick off steps, set a status, keep a Markdown journal (with pasted screenshots), and see progress stats. Single user, no auth, no network calls at runtime.

## 2. Scope

**In scope (Phase 1):**

| ID | Capability |
|---|---|
| M1 | Workspace scaffold, config, SQLite migrations |
| M2 | Ingestion: scan, parse, `lab-log.txt` merge, folder watcher, scheduled rescan, SSE events |
| M3 | Lab list, viewer (sandboxed iframe), prev/next buttons and arrow keys |
| M4 | Step progress (persisted, synced iframe and side panel) and lab status |
| M5 | Journal (Markdown, structured fields, autosave, pasted screenshots) |
| M6 | Home stats: completed/total, streaks, total time, average difficulty, 12-topic coverage, today's lab, last 5 journal entries |
| M7 | JSON backup and restore, Markdown notes export |

**Out of scope (Phase 2/3 or never):** ticket write-up editor, interview practice and Leitner scheduling, FTS search and Cmd+K, portfolio export and scrub check, list filters beyond status, tags UI, Sections reading view, `?` shortcut-help overlay, Docker/compose, nightly auto-backup, Obsidian sync, heatmap, PWA, auth, any third-party API call.

## 3. Findings and resolved decisions

These are the places where the design doc is silent, inconsistent, or can't be followed as written.

| # | Finding | Decision |
|---|---|---|
| D1 | `/workspace/labs` does not exist in this environment, and neither do the "7 real labs" the tests need as fixtures. | Generate **synthetic fixtures** with `scripts/gen-fixtures.mjs`. They reproduce the structure in design doc §3.1 (filename pattern, heading variants, checkbox counts 9/12/12/15/13/14/42, 3 `<details>` per lab, `lab-log.txt`). The generated files are committed to `tests/fixtures/`. Tests never depend on `/workspace/labs`. If real labs appear later, set `LABS_DIR`; no code change is needed. |
| D2 | §3.3 specifies `<iframe srcdoc=…>` and also a CSP **response header**. A `srcdoc` document has no response, so the header never applies. | Load the lab with `<iframe src="/api/labs/:slug/raw" sandbox="allow-same-origin">`. The server sets `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:` and `X-Content-Type-Options: nosniff`. The parent can still reach `contentDocument` (same origin), so checkbox sync works without `allow-scripts`. |
| D3 | §3.1 says "steps" are all checkboxes (counts include Verify and Cleanup checkboxes), but §3.1 also has a "steps" section kind. | A **step** is any `input[type=checkbox]` in document order, wherever it sits. `Step.section` records the nearest preceding `<h2>` text. Progress bar and "all checked" use all steps. |
| D4 | The doc's tree shows `db/schema.sql`. A bundled server can't read a sibling `.sql` file at runtime. | Embed the SQL in `server/src/db/schema.ts` as a string. |
| D5 | The doc's `lab_state` has `REFERENCES labs`. Restore must be able to load user data before labs are ingested. | User-data tables have **no foreign keys**. Orphan rows for deleted labs are harmless and are kept. |
| D6 | Tree puts 7 fixtures plus 2 malformed files in `tests/fixtures/labs`. Mixing them breaks the exact "7 labs, numbers 1–7" assertions. | `tests/fixtures/labs/` holds the 7 good labs plus `lab-log.txt`. `tests/fixtures/malformed/` holds the broken files. Ingestion tests copy both to a temp dir when they need them. |
| D7 | Design doc names the repo `lab-dashboard/`. This repo is `Lab-Ledger` and `docs/` is already at the root. | The repo root is the project root, with npm workspaces `shared`, `server`, `client`. Package scope is `@lab-ledger/*`. |
| D8 | The design doc says "supertest". Fastify ships `app.inject()`. | Use `app.inject()`. No supertest dependency. |
| D9 | The design doc doesn't pin versions. The registry's latest majors (TypeScript 7, zod 4, vitest 5, chokidar 6, better-sqlite3 13) are newer than the APIs this plan was written against. | Pin the majors listed in the plan's Task 1. Don't upgrade during the build. |
| D10 | "Skipped labs neither break nor extend the streak" is ambiguous. | A day on which a lab was marked *skipped* and which has no other activity is **transparent**. It doesn't add to the streak and doesn't end it. Any other day with no activity ends the streak. If today has no activity yet, the current streak is counted from yesterday, so it doesn't show 0 until the day is over. |
| D11 | The "Markdown editor" default allows either `@uiw/react-md-editor` or a textarea with preview. | Use a `<textarea>` plus a preview pane rendered with `marked` and sanitized with `DOMPurify`. Both are bundled, with no network. |
| D12 | Dev ports: client 5173, API 4317. | Vite proxies `/api` to `127.0.0.1:4317` (including SSE). In production the server serves `client/dist` on 4317. |

## 4. Functional requirements

### 4.1 Ingestion (M2)

- **R-ING-1** Only files matching `^(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)\.html$` directly inside `LABS_DIR` are read. Anything else is ignored (this also blocks path traversal).
- **R-ING-2** `lab-log.txt` lines match `^(\d{4}-\d{2}-\d{2})\s*\|\s*Lab\s+(\d+)\s*\|\s*(.+?)\s*\|\s*([a-z0-9-]+)\s*$`. The log supplies `labNumber` and `topicLabel`. The file supplies everything else. A file with no log line is still ingested (number from `<title>`). A log line with no file creates a placeholder lab with `missingFile = true`.
- **R-ING-3** The parser derives: title (`<h1>` with any `Lab NN:` prefix stripped, else `<title>`, else slug), lab number from `<title>` (`Lab NN` followed by `:`, en dash, em dash, or hyphen), tags (`span.tag` text minus time tags), time estimate, scenario text, prerequisites (`li` text), steps (R-STEP-1), questions (`<details>`), and sections (each `<h2>` and the siblings up to the next `<h2>`).
- **R-ING-4** Section kinds, case-insensitive on the heading: `scenario` ("Skill & Scenario", "The ticket", "Scenario"), `time` ("Time Estimate"), `prerequisites`, `steps` ("Steps", "Phase N…"), `verify` ("Verify it worked"), `cleanup`, `ticketTemplate` ("Ticket write-up template"), `interview`, `stretch`, else `other`.
- **R-ING-5** Time estimate priority: `time` section → a `span.tag` containing "⏱" → sum of `~N min` in "Phase N" headings. A range `A–B min` gives `{low:A, high:B}`. A single value gives `{low:N, high:N}`. Otherwise `null`.
- **R-ING-6** `parseStatus`: `ok` = title found and ≥1 step. `partial` = title or steps found, but not both. `failed` = neither, or the file is empty. Failed and partial labs are still listed (title falls back to the slug in Title Case) and are shown in the raw iframe with a badge. Ingestion never throws on bad content.
- **R-ING-7** Topic classification: match `topicLabel` against the keyword rules first. Only if nothing matches, use tags and title. No match gives `['other']`. A lab can have several topics.
- **R-ING-8** `fileHash = sha256(bytes)`. An unchanged hash skips parsing. When two files share a slug, the newest mtime wins and a warning is returned.
- **R-ING-9** Watching: chokidar on `LABS_DIR` (`awaitWriteFinish`, 2000 ms in production) for `add`/`change`/`unlink` of lab files and `lab-log.txt`, debounced, then a full rescan. Safety nets: rescan every 15 min and once daily at 09:20 `America/New_York`. `POST /api/labs/rescan` forces a scan.
- **R-ING-10** SSE `GET /api/events` emits `lab:added`, `lab:updated`, `lab:removed`, each with `{type, slug, title?}`. A new file is visible via the API and SSE ≤ 5 s after the copy completes.
- **R-ING-11** Source lab files are never written, renamed, or deleted by the app.

### 4.2 Steps and status (M4)

- **R-STEP-1** `step.index` is the position among all checkboxes in document order. `step.key = "<slug>#<index>"`. `step.textHash = sha1(lowercase(normalized label text))`.
- **R-STEP-2** When a lab is re-parsed, saved progress is re-mapped: first by `textHash` (duplicates matched in order), then by index for steps whose text changed. Rows that match nothing are dropped.
- **R-STEP-3** `PUT /api/labs/:slug/steps {index, checked}` persists the toggle. The first checked step moves `not_started` to `in_progress`. The response includes `allChecked`. The client then offers "Mark completed?".
- **R-STEP-4** Status values: `not_started | in_progress | completed | skipped`. Setting `completed` records `completedAt`. Leaving `completed` clears it.
- **R-STEP-5** Activity rows are written when a step is checked, a lab is completed, or a lab is skipped, with `day` in `America/New_York`.

### 4.3 Viewer (M3)

- **R-VIEW-1** Layout: lab iframe (~60%) plus a right panel with tabs **Steps** and **Journal**. Below 768 px the panel stacks under the lab.
- **R-VIEW-2** Checkbox state is synced both ways between the iframe and the Steps tab. It is restored from the server on load.
- **R-VIEW-3** Prev/next order is by `(date, labNumber, slug)` ascending. The first lab disables Prev. The last lab disables Next.
- **R-VIEW-4** Shortcuts, disabled while typing in text inputs: `←`/`→` prev/next lab, `j`/`k` move the step focus, `Space` toggles the focused step, `s` cycles the status, `n` focuses the journal. Key events inside the iframe are forwarded.
- **R-VIEW-5** `partial` and `failed` labs show a "parsed partially" badge. A missing file shows a "file missing" notice instead of the iframe.

### 4.4 Journal (M5)

- **R-JRN-1** Fields: `bodyMd`, `timeTakenMin` (≥0), `difficulty` (1–5), `confidence` (1–5). The last three are nullable.
- **R-JRN-2** Autosave 800 ms after the last change, plus a flush when leaving the lab. A visible "Saved" status uses `role="status"`.
- **R-JRN-3** Starter template (only when no journal exists): *What I did / What broke / How I fixed it / Commands that worked*.
- **R-JRN-4** Pasting or dropping an image uploads it to `POST /api/labs/:slug/attachments`. The editor inserts `![screenshot](/api/attachments/<id>)` at the cursor. Allowed: png, jpg, webp, ≤10 MB, validated by magic bytes. Stored as `DATA_DIR/attachments/<slug>/<uuid>.<ext>`. Served with `nosniff` and `Content-Disposition: inline`.

### 4.5 Stats (M6)

- **R-STAT-1** `GET /api/stats` returns: `completed`, `total` (excludes missing-file labs), `currentStreak`, `longestStreak` (D10), `totalMinutes`, `avgDifficulty` (1 decimal or null), `topicCoverage` (12 entries: `{topic, count, completed, pct}`), `today` (the lab dated today in ET, else the newest lab, else null), and `recentJournals` (≤5, non-empty, newest first, with a 160-character snippet).
- **R-STAT-2** A lab counts under every topic in its `topics` list.

### 4.6 Backup (M7)

- **R-BAK-1** `GET /api/backup` returns `{version:1, exportedAt, labState, stepProgress, journals, attachments (with dataBase64), activity}`, with deterministic ordering.
- **R-BAK-2** `POST /api/restore` replaces all user data from that JSON in one transaction and rewrites the attachment files. Slugs, ids, and mime types are validated, so a crafted backup can't write outside `DATA_DIR`.
- **R-BAK-3** Backup then restore into a fresh DB and data dir, then backup again. The two JSON documents are identical apart from `exportedAt`.
- **R-BAK-4** `GET /api/backup/markdown` returns a readable Markdown file of all journals.

## 5. Non-functional requirements

- TypeScript `strict`, ESM, Prettier, ESLint. API input validated with the zod schemas in `shared`.
- Server binds `127.0.0.1` by default (`HOST` overrides). No CDN, font, or analytics requests.
- The iframe has `sandbox="allow-same-origin"` and **never** `allow-scripts`.
- WCAG 2.1 AA: no serious or critical axe violations on any page, in light and dark themes. Visible focus rings, an iframe `title`, `aria-live` toasts, `prefers-reduced-motion` respected.
- Theme: CSS variables, follows `prefers-color-scheme`, with a toggle stored in `localStorage`.

## 6. API (Phase 1 subset, prefix `/api`)

| Method & path | Notes |
|---|---|
| GET `/labs?status=&topic=&q=` | Summaries: `Lab` summary fields, `status`, `stepsTotal`, `stepsChecked`, `hasNotes` |
| GET `/labs/:slug` | `{lab, state, checked:number[], journal, neighbors:{prev,next}}` |
| GET `/labs/:slug/raw` | Original HTML with the CSP header |
| POST `/labs/rescan` | Returns `{added, updated, removed, warnings}` |
| GET `/events` | SSE |
| PUT `/labs/:slug/status` | `{status}` returns the state |
| PUT `/labs/:slug/steps` | `{index, checked}` returns `{checked, status, allChecked}` |
| GET/PUT `/labs/:slug/journal` | Journal |
| POST `/labs/:slug/attachments` | multipart, field `file` returns `{id, url}` |
| GET `/attachments/:id` | Image bytes |
| GET `/stats` | R-STAT-1 |
| GET `/backup` · GET `/backup/markdown` · POST `/restore` | R-BAK-* |

Errors: invalid input gives `400 {error, issues}`. An unknown slug gives `404`. A bad upload gives `415` or `413`.

## 7. Data model (Phase 1 tables)

`labs`, `lab_state`, `step_progress`, `journals`, `attachments`, `activity`, as in design doc §5.1 with D5 applied. `tickets`, `question_reviews`, and `search_idx` arrive with Phase 2 migrations (`PRAGMA user_version` 2+).

## 8. Acceptance criteria and how each is proven

| Design-doc criterion | Proof |
|---|---|
| `npm install && npm run dev` starts. 7 labs listed in date order with correct titles, numbers 1–7, topics | Integration test `scan.test.ts` plus E2E `01-labs.spec.ts` |
| New `2026-10-30-*.html` plus log line appears within 5 s without reload, with a toast | Integration test `watch.test.ts` plus E2E `99-new-lab.spec.ts` |
| Malformed or empty file listed with a badge and no crash | `parse.test.ts` plus `scan.test.ts` |
| Lab 07 = 42 steps, Lab 01 = 9. Persisted and synced | `parse.test.ts`, `api.test.ts`, E2E `02-viewer.spec.ts` |
| ←/→ navigate. Ends disable the buttons | E2E `02-viewer.spec.ts` |
| Journal autosaves. Pasted screenshot is stored and renders after reload | `api.test.ts` plus E2E `02-viewer.spec.ts` |
| Home shows correct completed count, streak, time, 12-topic coverage | `stats.test.ts` plus E2E |
| iframe has no `allow-scripts`. Zero external requests | E2E `03-security.spec.ts` |
| Backup restores into a fresh DB identically | `backup.test.ts` |

**Definition of done:** all of the above pass, `npm test`, `npm run e2e`, `npm run lint`, `npm run typecheck`, and `npm run build` are green, the README covers setup, env vars, and backup/restore, and the source lab fixtures are byte-identical before and after a test run.
