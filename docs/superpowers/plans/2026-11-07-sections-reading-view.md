# Sections Reading View Implementation Plan

**Goal:** Complete the next project-status slice: a mobile-friendly reading view of parsed lab sections.

**Design:** Original/Sections tabs above the lab content leave the existing Steps/Journal/Ticket panel in place. Original remains the default; `view=sections` in the URL supports reload/history and adjacent lab navigation. Sections renders every parsed heading in source order with a table of contents, readable code/tables, and native interview answer disclosure. This is a reading view: source checkboxes are removed and a note points to the Steps panel for saved progress. The original iframe remains available, including for partial or missing section data.

**Architecture:** Reuse Section data from the lab API and DOMPurify with a reading-specific allowlist. Strip source styles, IDs, forms, embeds and active content. Only embedded PNG/JPEG/WebP data images may load; links retain their text. No schema, ingestion, or dependency changes.

**Approach:** Render in the app to share its theme and responsive styling. Another iframe would retain the original mobile limitations; a fourth side-panel tab would leave the original document taking most of the phone screen.

## Tasks

- [x] Add section sanitization and reading component; test markup preservation, active-content removal, source style isolation, and empty sections.
- [x] Add viewer mode tabs, URL persistence, keyboard access and neighbor-mode preservation; keep progress and editors intact.
- [x] Verify desktop/mobile, light/dark, table of contents, answer disclosure, original-view fallback, progress switching and malicious content.
- [x] Run unit tests, typecheck, lint, build and full Chromium suite; update README/status and commit locally.

## Review focus

- Source HTML must not style the app, request external resources, or introduce unsaved form controls.
- Empty/partially parsed labs must retain access to their original source and notes.
- Duplicate headings require distinct IDs; long commands/tables must not widen mobile pages.
- Tab keyboard controls must not trigger previous/next lab shortcuts.
- Switching modes must retain progress and unsaved journal/ticket content.

## Verification

- `npm test`: 163 tests in 29 files passed.
- `npm run lint`, `npm run typecheck`, and `npm run build`: passed.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/lab-ledger-playwright npm run e2e`: 54 Chromium tests passed, including all seven new Sections cases.
- Verified 390x844 mobile reading in light/dark themes, no serious/critical axe violations, contents initially in viewport, keyboard tabs/history, progress/editor retention, missing sections fallback, and hostile HTML/resource isolation. Reviewed the mobile screenshot.
- Browser plugin unavailable; used the repository's Playwright workflow. Firefox/WebKit were not run.
