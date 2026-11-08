# Shortcut Help and Lab Filters Implementation Plan

**Goal:** Complete the first resume item in project-status.md.

**Design:** Add a native modal dialog opened by `?` outside text fields or by a visible Help button. List global, viewer and practice keys. Escape/Close dismiss it, restore focus, and suppress underlying shortcuts. Forward help from the sandboxed lab frame as search is forwarded today.

Labs combines status, topic, ingested tag, inclusive date range, notes presence and debounced full-text search. Persist filters in URL parameters, show result counts, reset and empty/error/loading states. Reuse FTS query sanitization in the labs endpoint without the search-result cap. No schema migration or new dependencies.

**Architecture:** React components and existing hotkey hook; Zod query validation; SQLite FTS5; existing CSS tokens. Preserve chronological ordering and existing API text matching of title/slug/topic label alongside FTS matches.

## Tasks

- [x] Add shortcut dialog, global and iframe key handling, and modal shortcut suppression. Test typing, modifiers, Escape, focus return and practice/viewer isolation.
- [x] Add validated API filters and complete FTS slug matching. Test combined filters, inclusive dates, notes, invalid query values and matches beyond the search cap.
- [x] Add URL-backed Labs controls, tags, debounce and result states. Test combined/reset filters, reload, browser history and search errors.
- [x] Run tests, typecheck, lint, build and browser coverage; update status and README; inspect diff and commit.

## Review focus

- Dialog must work from the iframe and must not mutate progress while open.
- Search must never truncate matches or show stale query results as current.
- Back/forward and reset must cancel pending debounces.
- Date boundaries are inclusive; reversed ranges produce a clear error.
- Existing unfiltered labs API and search page behavior remain compatible.

## Verification notes

The full browser suite exposed a Search-page synchronization race during rapid submissions. Own REPLACE navigation now preserves newer input while POP navigation still restores history. This small adjacent correction keeps the existing Search workflow reliable.

Verification: 158 Vitest tests; lint; typecheck; production build; 47 Chromium browser tests, including mobile help and light/dark accessibility. Playwright browser binaries were installed under `/tmp/lab-ledger-playwright` because the default browser cache was absent.
