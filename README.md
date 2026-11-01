# Lab-Ledger (Lab Dashboard)

A personal, local-first web app for browsing the daily IT labs committed in `labs/` and recording what I did in each one. I'm a recent Information Science grad aiming for entry-level IT Support, Help Desk, or junior sysadmin roles. The app turns the labs into a practice log, an interview-prep tool, and a portfolio.

Everything runs on your own machine. There is no account, no cloud service, and no network call at runtime. Your progress and notes live in a single SQLite file that is easy to back up.

> **Status:** Phase 1 (MVP) is complete. Phase 2 is underway; ticket write-ups are implemented.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Quick start](#quick-start)
3. [Installation and setup](#installation-and-setup)
4. [Configuration](#configuration)
5. [Using the app](#using-the-app)
6. [How lab ingestion works](#how-lab-ingestion-works)
7. [Backup and restore](#backup-and-restore)
8. [Architecture](#architecture)
9. [HTTP API](#http-api)
10. [Security and privacy](#security-and-privacy)
11. [Development](#development)
12. [Testing](#testing)
13. [Troubleshooting](#troubleshooting)
14. [Roadmap](#roadmap)
15. [Documentation](#documentation)
16. [License](#license)

---

## What it does

- **Browse labs.** Every daily lab appears in a list (newest first) and in a viewer with previous/next buttons and keyboard arrows.
- **Pick up new labs automatically.** A new lab file dropped into the labs folder shows up within a few seconds, with a "New lab" toast and no page reload. A scheduled rescan (every 15 minutes, and daily at 09:20 ET) acts as a safety net.
- **Track progress.** Tick off steps in the lab itself or in the side panel (the two stay in sync). Progress persists across restarts. The first ticked step sets the lab to *In progress*, and ticking every step offers to mark it *Completed*.
- **Set a status** for each lab: Not started, In progress, Completed, or Skipped.
- **Keep a journal.** Write Markdown notes with a starter template (*What I did / What broke / How I fixed it / Commands that worked*), record time taken, difficulty (1-5), and confidence (1-5). Paste or drag in screenshots. Notes autosave.
- **See your stats.** The home page shows completed vs. total labs, current and longest streak, total time logged, average difficulty, coverage of the 12 rotation topics, today's lab, and your five most recent notes.
- **Back up and restore** everything as JSON, or export your notes as Markdown.
- **Light and dark themes**, keyboard shortcuts, and WCAG 2.1 AA accessibility checks.

## Quick start

You need **Node.js 22 or newer** and **npm 10 or newer**.

```bash
git clone https://github.com/jimjamscott22/Lab-Ledger.git
cd Lab-Ledger
npm install
npm run dev
```

Then open <http://localhost:5173>. The committed `labs/` directory is used by default.

## Installation and setup

### 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 22 or newer | Check with `node -v` |
| npm | 10 or newer | Ships with Node 22 |
| A C/C++ toolchain | Only if needed | `better-sqlite3` normally installs a prebuilt binary. If none exists for your platform, npm compiles it, which needs Python 3 and build tools (`build-essential` on Debian/Ubuntu, Xcode command line tools on macOS) |
| Chromium (for E2E tests only) | via Playwright | Installed by a separate command, see [Testing](#testing) |

### 2. Install dependencies

```bash
npm install
```

This installs all three workspaces (`shared`, `server`, `client`) in one step.

### 3. Prepare your labs folder

The app reads lab files from `LABS_DIR` (default `./labs`). The repository's `labs/` directory is the canonical home for lab content. It expects:

- Files named `YYYY-MM-DD-<slug>.html`, for example `2026-10-29-windows-wont-wake-from-sleep.html`.
- Optionally, a `lab-log.txt` index in the same folder, one lab per line:

  ```
  2026-10-23 | Lab 01 | AD users/groups | ad-user-onboarding
  YYYY-MM-DD | Lab NN | <topic label>   | <slug>
  ```

The lab files are treated as **read-only**. The app never modifies, renames, or deletes them.

To regenerate the committed sample labs and their isolated test-fixture copies:

```bash
npm run fixtures
```

They are written to both `labs/` and `tests/fixtures/labs`.

### 4. Configure (optional)

Copy `.env.example` for reference. The app reads **environment variables** (it does not load `.env` files by itself), so export them or prefix the command:

```bash
export LABS_DIR=/path/to/your/labs
export DATA_DIR=./data
npm run dev
```

See [Configuration](#configuration) for every option.

### 5. Run it

**Development** (hot reload; API on port 4317, client on port 5173):

```bash
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` (including the live-update event stream) to the API.

**Production-style** (one process serving the built client and the API on port 4317):

```bash
npm run build
npm start
```

Open <http://127.0.0.1:4317>.

### 6. Running on a Raspberry Pi or home server (optional)

The app runs on arm64. To reach it from other devices, set `HOST=0.0.0.0` and expose it **only** over a private network such as Tailscale. There is no authentication, so don't put it on the public internet. A reverse proxy such as Caddy (`reverse_proxy localhost:4317`) works well in front of it.

## Configuration

All settings are environment variables.

| Variable | Default | Description |
|---|---|---|
| `LABS_DIR` | `./labs` | Folder containing the lab HTML files and `lab-log.txt` (read-only at runtime) |
| `DATA_DIR` | `./data` | Where user data lives: `app.db` (SQLite) and `attachments/` (screenshots) |
| `PORT` | `4317` | API port. In production this also serves the client |
| `HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` only behind a private network |
| `WATCH_STABILITY_MS` | `2000` | How long a file must stay unchanged before the watcher reacts (guards against half-written files) |

Fixed behavior (not configurable): streaks and "today" use the `America/New_York` time zone, and the client dev server uses port `5173`.

## Using the app

### Pages

| Page | Path | What's there |
|---|---|---|
| Home | `/` | Stat cards, today's lab, 12-topic coverage grid, recent notes |
| Labs | `/labs` | All labs, newest first, with status chips, step counts, and a status filter |
| Viewer | `/labs/:slug` | The lab, plus **Steps**, **Journal**, and **Ticket** tabs |
| Settings | `/settings` | Backup download, Markdown export, restore, manual rescan |

On screens narrower than 768 px the side panel stacks under the lab.

### Keyboard shortcuts (in the viewer)

Shortcuts are disabled while you are typing in a text field.

| Key | Action |
|---|---|
| `←` / `→` | Previous / next lab |
| `j` / `k` | Move step focus down / up |
| `Space` | Toggle the focused step |
| `s` | Cycle the lab status |
| `n` | Open the Journal tab and focus the editor |

Key presses inside the lab itself are forwarded, so the shortcuts work wherever your focus is.

### Journal and screenshots

- Notes autosave 800 ms after you stop typing, and again when you leave the lab. A "Saved" message confirms it.
- Paste an image (or drag one onto the editor) to attach it. The editor inserts `![screenshot](/api/attachments/<id>)` at your cursor.
- Allowed images: PNG, JPEG, WebP, up to 10 MB. Files are checked by their actual bytes, not just the extension.
- A live preview renders below the editor.

### Ticket write-ups

The Ticket tab records the ticket number, requester, issue, impact, troubleshooting steps, root cause, resolution, time to resolve, and follow-up. New write-ups are prefilled from the lab's scenario and ticket template when available, autosave after 800 ms, and can be downloaded as Markdown. Ticket data is included in JSON backups.

### Streaks

A day counts if you checked a step or marked a lab completed. The current streak counts consecutive days ending today (or yesterday, if you haven't done anything yet today). A day on which you marked a lab *Skipped* and did nothing else neither breaks nor extends the streak.

## How lab ingestion works

1. **Scan** `LABS_DIR` on startup and on demand (`POST /api/labs/rescan` or Settings -> *Rescan now*). Only files matching `^(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)\.html$` are read. Anything else is ignored.
2. **Watch** the folder for added, changed, or removed files (`lab-log.txt` included), then rescan after a short debounce. A rescan also runs every 15 minutes and daily at 09:20 ET.
3. **Parse** each lab with cheerio:
   - Title, lab number, tags, scenario, prerequisites, and interview questions.
   - Sections, keyed off each `<h2>` heading, with variants such as "Skill & Scenario" / "The ticket" mapped to a canonical kind.
   - **Steps**: every checkbox in document order, each with a stable key (`<slug>#<index>`) and a hash of its text.
   - Time estimate from a "Time Estimate" section, a `⏱` tag, or the sum of "Phase N (~X min)" headings.
4. **Merge with `lab-log.txt`.** The log supplies the lab number and topic label. A file with no log line is still ingested. A log line with no file shows as "file missing".
5. **Classify topics** into the 12-topic rotation: `ad-gpo`, `m365-entra`, `intune`, `windows-troubleshooting`, `powershell`, `linux`, `networking`, `dns-dhcp`, `backups`, `security-hardening`, `ticket-writeups`, `docker`. A lab can belong to several.
6. **Fall back safely.** A broken or empty file never crashes ingestion. It is listed with a "parsed partially" badge (title taken from the filename) and still opens in the raw viewer.
7. **Skip unchanged files** using a SHA-256 of the file contents.

**Progress survives edits.** If a lab file is edited later, your ticked steps are re-matched by step text first, then by position, so small edits and reordering don't lose progress.

**Duplicate slugs:** if two files share a slug, the one with the newest modified time wins and a warning is logged.

## Backup and restore

All your data (step progress, statuses, journals, screenshots, activity history) is in `DATA_DIR`. To back it up:

- **In the app:** Settings -> **Download JSON backup** (complete and restorable, with screenshots embedded) or **Download Markdown notes** (human-readable).
- **From the command line:**

  ```bash
  curl -o lab-backup.json http://127.0.0.1:4317/api/backup
  curl -o lab-notes.md   http://127.0.0.1:4317/api/backup/markdown
  ```

To restore, go to Settings, choose a JSON backup file, and click **Restore** (or `POST` it to `/api/restore`). Restoring **replaces all user data**, so you are asked to confirm. A backup restored into a fresh database produces an identical backup.

You can also simply copy the whole `DATA_DIR` folder while the app is stopped.

## Architecture

An npm-workspaces monorepo:

```
Lab-Ledger/
├─ labs/              # Canonical, committed lab HTML and lab-log.txt
├─ shared/            # Types and zod schemas used by both sides
│  └─ src/index.ts
├─ server/            # Fastify + SQLite API
│  └─ src/
│     ├─ index.ts           # Bootstrap: config, DB, scan, watcher, scheduler
│     ├─ app.ts             # Fastify app, error handling, static client
│     ├─ config.ts
│     ├─ db/                # schema, migrations, repository
│     ├─ ingest/            # parse, lab-log, topics, step matching, scan, watch
│     ├─ routes/            # labs, progress, journal, attachments, stats, backup
│     ├─ stats.ts           # Streaks and home stats
│     └─ backup.ts          # JSON/Markdown backup and restore
├─ client/            # Vite + React + TypeScript UI
│  └─ src/{pages,components,lib,styles}
├─ scripts/           # Fixture generator, E2E sandbox setup
├─ tests/
│  ├─ fixtures/       # Generated sample labs (committed)
│  └─ e2e/            # Playwright specs
└─ docs/              # Design doc, spec, implementation plan
```

**Tech stack:** Node 22, TypeScript (strict, ESM), Fastify 5, better-sqlite3, chokidar, cheerio, zod, React 19, Vite 7, react-router, marked and DOMPurify (journal preview), Vitest, Playwright, and axe-core.

**How the pieces fit:**

- The server scans and watches the labs folder, stores parsed labs and your data in SQLite, and pushes `lab:added` / `lab:updated` / `lab:removed` events to the browser over Server-Sent Events.
- The client renders each lab in an `<iframe>` served from the API. Because the frame is same-origin, the page can read and drive the lab's checkboxes without running any script inside the lab, which keeps the frame sandboxed.
- User data tables deliberately have no foreign keys to the labs table, so a restore can load before labs are re-ingested.

**Data layout:**

```
data/app.db                              # SQLite database
data/attachments/<slug>/<uuid>.<ext>     # Pasted screenshots
```

## HTTP API

All routes are under `/api`. Invalid input returns `400`, an unknown lab returns `404`.

| Method and path | Purpose |
|---|---|
| `GET /labs?status=&topic=&q=` | List labs with status, step counts, and whether notes exist |
| `GET /labs/:slug` | Full lab, state, checked steps, journal, and prev/next neighbors |
| `GET /labs/:slug/raw` | The original lab HTML, with a strict CSP header |
| `POST /labs/rescan` | Force a rescan; returns `{added, updated, removed, warnings}` |
| `GET /events` | Server-Sent Events stream of lab changes |
| `PUT /labs/:slug/status` | Set status `{status}` |
| `GET` / `PUT /labs/:slug/steps` | Read checked steps / toggle `{index, checked}` |
| `GET` / `PUT /labs/:slug/journal` | Read / save the journal |
| `GET` / `PUT /labs/:slug/ticket` | Read / save the ticket write-up |
| `GET /labs/:slug/ticket/markdown` | Download the ticket write-up as Markdown |
| `POST /labs/:slug/attachments` | Upload an image (multipart field `file`) |
| `GET /attachments/:id` | Serve an uploaded image |
| `GET /stats` | Home stats, streaks, and topic coverage |
| `GET /backup` · `GET /backup/markdown` · `POST /restore` | Backup, Markdown notes, restore |

## Security and privacy

- **Sandboxed labs.** The iframe uses `sandbox="allow-same-origin"` and never `allow-scripts`. Raw lab responses carry `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:` and `X-Content-Type-Options: nosniff`.
- **No external requests.** No CDNs, web fonts, analytics, or third-party APIs. An E2E test fails if any page makes a request to another origin, and another test checks the built assets.
- **Local by default.** The server binds to `127.0.0.1`. There is no authentication, so keep it on localhost or a private network.
- **Safe file handling.** Only files matching the lab filename pattern inside `LABS_DIR` are read (no path traversal). Uploads are validated by magic bytes, renamed to UUIDs, size-limited to 10 MB, and served inline with `nosniff`. Restore validates every slug and id before writing any file.
- **Sanitized notes.** Journal Markdown is sanitized with DOMPurify before it is rendered.

## Development

| Command | What it does |
|---|---|
| `npm run dev` | API (4317) and client (5173) with hot reload |
| `npm run build` | Build the client, then bundle the server into `server/dist` |
| `npm start` | Run the built server (serves the built client too) |
| `npm run fixtures` | Regenerate the sample labs in `tests/fixtures` |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check for all three workspaces |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run e2e` | Build, then run the Playwright suite |

Conventions: TypeScript strict mode, ESM, Prettier (single quotes, 100 columns), and zod validation on every API body using the schemas in `shared`. The lab slug (from the filename) is the stable ID. Nothing is keyed on the title.

## Testing

```bash
npm test                               # 97 unit and integration tests
npx playwright install --with-deps chromium   # one-time, for E2E
npm run e2e                            # 20 browser tests
npm run lint && npm run typecheck
```

What is covered:

- **Parser:** all seven fixture labs (titles, numbers, step counts, time estimates, section variants), plus malformed, empty, and badly named files.
- **Ingestion:** scan, lab-log merge, topics, duplicate slugs, missing files, progress remapping after edits, and a check that source files are never modified.
- **Watcher:** add, change, and remove events arrive within 5 seconds.
- **API:** status and steps, journal, attachments (type and size limits), stats and streaks, and backup/restore round trips.
- **E2E (Playwright):** step sync between the lab and the side panel, persistence across reload, arrow-key navigation, journal autosave with a pasted screenshot, backup and restore, the new-lab toast, the iframe sandbox and CSP, zero external requests, and axe accessibility checks in light and dark themes.

The E2E suite runs against a throwaway copy of the fixtures on port 4318 (`.e2e/`, git-ignored), so it never touches your real labs or data.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm install` fails building `better-sqlite3` | Install build tools (Python 3 and a C/C++ compiler), then run `npm rebuild better-sqlite3` |
| The labs list is empty | Check that `LABS_DIR` points at the right folder and that filenames match `YYYY-MM-DD-<slug>.html` |
| A new lab doesn't appear | Wait a few seconds (the watcher waits for the file to settle), or use Settings -> *Rescan now*. On network or Docker volumes, file events can be unreliable, and the 15-minute rescan will still catch it |
| Port already in use | Set `PORT` to a free port. In dev, the client expects the API on 4317, so change the proxy target in `client/vite.config.ts` too |
| A lab shows "parsed partially" | The file is missing a title or checkboxes. It still opens in the viewer, and you can still journal on it |
| A lab shows "file missing" | It is listed in `lab-log.txt` but the HTML file isn't in `LABS_DIR` |
| Can't reach the app from another device | By default it listens on `127.0.0.1` only. Set `HOST=0.0.0.0` and use a private network such as Tailscale |
| E2E tests can't launch a browser | Run `npx playwright install --with-deps chromium` |

## Roadmap

**Phase 1 (done):** ingestion and live reload, list and viewer, step progress and status, journal with screenshots, home stats, JSON and Markdown backup.

**Phase 2 (underway):** ticket write-up editor (done); next are interview practice with spaced repetition (Leitner boxes), full-text search with Cmd/Ctrl+K, portfolio export (Markdown, static HTML, print-to-PDF) with a sensitive-data scan, richer filters and tags, a Sections reading view, a shortcut-help overlay, Docker and compose, and nightly automatic backups.

**Phase 3 (stretch):** Obsidian sync, a calendar heatmap, a Raspberry Pi deploy guide (Caddy and Tailscale), a PWA for offline phone use, a weekly review summary, and a skill-gap view.

## Documentation

- `docs/lab-dashboard-design-doc.md`: the original design document (goals, features, data model, all phases).
- `docs/superpowers/specs/2026-10-31-lab-dashboard-phase1-spec.md`: the Phase 1 build spec, with the decisions that resolve gaps in the design doc.
- `docs/superpowers/plans/2026-10-31-lab-dashboard-phase1.md`: the task-by-task implementation plan the build followed.

## License

See [LICENSE](LICENSE).
