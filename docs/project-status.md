# Project status

**Snapshot date:** 2026-11-01  
**Product stage:** Phase 1 complete; Phase 2 in progress

This document records the repository state at the current pause point. The README remains the operational guide; the original design document remains the product source of truth.

## Implemented

### Repository-owned labs

- `labs/` is the canonical, committed lab source.
- The default `LABS_DIR` is `./labs`; an environment override is still supported.
- Seven labs and `lab-log.txt` are committed.
- `npm run fixtures` regenerates both the canonical labs and isolated test copies.

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

## Persistence and migrations

- SQLite schema version: 3.
- Version 2 adds `tickets`.
- Version 3 adds `question_reviews`.
- Existing version-1 backups remain accepted; missing Phase 2 collections default to empty arrays.
- Runtime user data remains under `DATA_DIR` and is not committed.

## Verification baseline

At this snapshot:

- `npm test`: 109 tests passing across 21 test files.
- `npm run lint`: passing.
- `npm run typecheck`: passing.
- `npm run build`: passing.
- `npm run e2e`: 25 browser tests passing.
- Browser coverage includes the Practice workflow and serious/critical accessibility checks in light and dark themes.

## Not implemented yet

Remaining Phase 2 work:

1. Full-text search with `Cmd/Ctrl+K`.
2. Portfolio export with Markdown, static HTML, print-to-PDF, and sensitive-data scanning.
3. Richer lab filters and tags.
4. Sections reading view.
5. Shortcut-help overlay.
6. Docker and Compose support.
7. Nightly automatic backups.

Phase 3 remains unchanged: Obsidian sync, activity heatmap, Raspberry Pi deployment guide, PWA support, weekly review summaries, and skill-gap analysis.

## Resume point

The next cohesive vertical slice is full-text search:

- Add the FTS migration and indexing for lab content, journals, and ticket write-ups.
- Add `GET /api/search?q=`.
- Add a Search page with highlighted snippets.
- Wire global `Cmd/Ctrl+K`.
- Include unit, API, browser, security, and accessibility coverage.

