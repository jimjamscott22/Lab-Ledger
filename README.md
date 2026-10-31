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
