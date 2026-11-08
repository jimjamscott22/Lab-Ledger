# Project status

**Snapshot date:** 2026-11-07

**Product stage:** Phase 1 complete; Phase 2 in progress

This document records the repository state at the current pause point. The README remains the operational guide; the original design document remains the product source of truth.

## Implemented

### Repository-owned labs

- `labs/` is the canonical, committed lab source.
- The default `LABS_DIR` is `./labs` (resolved relative to the repository root); an environment override is still supported.
- Seven labs and `lab-log.txt` are committed.
- `npm run fixtures` regenerates isolated test copies in `tests/fixtures/labs` (and only resets `labs/` when passed `-- --canonical`).

### Phase 1

- HTML ingestion, parsing, topic classification, file watching, scheduled rescans, and SSE updates.
- Lab list and sandboxed viewer with previous/next navigation and keyboard controls.
- Persisted step progress and lab statuses.
- Markdown journals with structured fields, autosave, and screenshot attachments.
- Dashboard stats, streaks, topic coverage, recent notes, and today’s lab.
- JSON backup/restore and Markdown note export.
- Light/dark themes, responsive layouts, offline runtime behavior, and accessibility coverage.

### Phase 2 completed so far

- Ticket write-ups:
  - Structured ticket fields with scenario/template prefilling.
  - Debounced autosave and reload persistence.
  - Per-ticket Markdown download.
  - JSON backup/restore coverage.
- Interview practice:
  - Due-question deck with topic filtering.
  - Answer reveal and Again / Hard / Good / Easy ratings.
  - Keyboard shortcuts: `R` to reveal and `1`–`4` to rate.
  - Leitner boxes 1–5 with intervals of 1, 2, 4, 8, and 16 days.
  - Dashboard due count.
  - JSON backup/restore coverage.

- Full-text search:
  - SQLite FTS5 index (`search_idx`, Porter stemming) over lab text, journals, and ticket write-ups.
  - The index is updated on every lab ingest, journal save, and ticket save, rebuilt after a restore, and backfilled by the version 4 migration.
  - `GET /api/search?q=&limit=` sanitises input into quoted terms (the last one a prefix match) and returns structured snippet parts, so the client never renders HTML from search results.
  - Search page with highlighted snippets; results deep-link to the Journal or Ticket tab.
  - Global `Ctrl/Cmd+K` shortcut.
  - Rapid submissions preserve newer input while the URL updates.

- Keyboard help:
  - `?` opens a modal shortcut reference outside text fields; a visible Help button is also available.
  - Lists global search, lab viewer, and practice shortcuts; Escape or Close dismisses it.
  - Contains keyboard focus, restores focus (including inside the lab iframe), and pauses underlying shortcuts.
- Richer lab filters and tags:
  - Labs combines status, topic, ingested tag, inclusive date range, notes presence, and debounced full-text search across labs, journals, and tickets.
  - Filters persist in the URL, support back/forward and reload, and include counts, reset, empty, loading, and error states.
  - Tags appear on lab cards; all matching labs are included without the ranked search endpoint's result cap.

- Sections reading view:
  - Original / Sections tabs above lab content; Original remains the default.
  - Sanitized, theme-aware parsed sections in source order, with a table of contents, readable commands/tables, and expandable interview answers.
  - `view=sections` persists across reload, history, and adjacent-lab navigation.
  - Source controls are removed; the existing Steps panel remains the saved-progress interface. Switching modes retains progress and editor drafts.
  - Empty sections explain the Original-view fallback; source styles, active content, and external image resources are excluded.
  - Opening a lab no longer scrolls the mobile page to the checklist automatically.

## Persistence and migrations

- SQLite schema version: 4.
- Version 2 adds `tickets`.
- Version 3 adds `question_reviews`.
- Version 4 adds the `search_idx` FTS5 table and indexes existing data.
- Existing version-1 backups remain accepted; missing Phase 2 collections default to empty arrays.
- Runtime user data remains under `DATA_DIR` and is not committed.

## Verification baseline

At this snapshot:

- `npm test`: 163 tests passing across 29 test files.
- `npm run lint`: passing.
- `npm run typecheck`: passing.
- `npm run build`: passing.
- `npm run e2e`: 54 browser tests passing.
- Browser coverage includes Practice, Search, combined Labs filters, filter history/reset, shortcut help, focus restoration, Sections reading and sanitization, and serious/critical accessibility checks in light and dark themes.

## Not implemented yet

Remaining Phase 2 work:

1. Portfolio export with Markdown, static HTML, print-to-PDF, and sensitive-data scanning.
2. Docker and Compose support.
3. Nightly automatic backups.

Phase 3 remains unchanged: Obsidian sync, activity heatmap, Raspberry Pi deployment guide, PWA support, weekly review summaries, and skill-gap analysis.

## Resume point

Suggested next slices, in order:

1. Portfolio export with the sensitive-data scan.
2. Nightly backups, then Docker and Compose.
