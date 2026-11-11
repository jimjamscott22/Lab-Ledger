# Visual review: Lab Ledger

_Reviewed 2026-11-10 against the running dev build (`npm run dev`). I screenshotted every route in light and dark themes at 1440×900 and 390×844 (phone)._

## Summary

The app is clean, readable, and clearly built with accessibility in mind. Focus rings, contrast, labelled controls, and the shortcut dialog are all solid. Right now, though, it looks like an **unstyled default**: system font, one blue accent (`#0b57d0`, close to Google's own blue), white cards with grey borders, and underlined links everywhere. Nothing on screen says "IT lab notebook".

The lab files themselves already have more personality than the app around them. They use navy headings (`#0f3d75`), slate neutrals, tinted chips, and red or amber callouts styled like tickets. The best way to a distinctive look is to **pull that language up into the shell and push it further**.

## Proposed direction: "Ops logbook"

Make the app feel like the tool a help-desk tech actually lives in: part ticket queue, part terminal, part field notebook.

| Element | Today | Proposed |
|---|---|---|
| Name | "Lab Dashboard" (tab title and brand) | **Lab Ledger**, matching the repo, with a small mark (for example a `>_` glyph inside a ledger tab) and a favicon |
| Type | `system-ui` for everything | A sans/mono pair: **IBM Plex Sans + IBM Plex Mono**, or **Inter + JetBrains Mono**. Use mono for lab numbers, ticket #s, dates, step counts, stat values, and kbd keys |
| Color | Single blue accent, used for everything | Ink navy base taken from the labs (`#0f3d75`), one signal accent (terminal green `#16a34a`, or amber `#f59e0b`), and slate neutrals (`#f8fafc` / `#e2e8f0` / `#64748b`) |
| Status | Plain grey chips | A status vocabulary borrowed from ticketing: `NEW`, `IN PROGRESS`, `RESOLVED`, `WON'T DO`, as small-caps mono badges with a colored left dot |
| Surfaces | Bordered white boxes | Fewer borders and more tonal fills; cards get a thin colored top or left rule tied to topic or status |

**Keep it offline.** The README promises no network calls at runtime, so self-host the fonts (for example `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`) rather than using a font CDN.

### Suggested tokens

```css
:root {
  --ink: #0f3d75;          /* headings, brand, selected nav */
  --signal: #16a34a;       /* progress, completed, streak */
  --amber: #b45309;        /* in progress, due questions (AA on white) */
  --danger: #b91c1c;
  --bg: #f6f8fb; --surface: #ffffff; --surface-2: #eef2f7;
  --line: #d6dde6; --muted: #5b6676; --fg: #111827;
  --font-sans: 'IBM Plex Sans', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
  --radius: 6px;           /* slightly squarer = more "tool", less "consumer app" */
}
:root[data-theme='dark'] {
  --ink: #9cc2ff; --signal: #4ade80; --amber: #fbbf24;
  --bg: #0b1220; --surface: #111a2b; --surface-2: #17223a;
  --line: #26334d; --muted: #9aa7bd; --fg: #e6edf6;
}
```

Use a navy-tinted dark theme instead of the current neutral grey (`#121418`). That alone makes dark mode feel intentional.

---

## Findings by priority

### High impact

1. **Dark mode puts a white slab in the middle of the viewer.** In dark theme the lab iframe keeps its light page (`.viewer iframe { background: #fff }`, plus the lab's own CSS), so about 60% of the screen glares. Options: inject a small dark stylesheet into the frame when `data-theme='dark'` (the frame is same-origin, since `LabFrame` already reaches into it), or default to the **Sections** reading view in dark mode, which already follows app tokens.
2. **Blue fills compete with each other.** The active nav pill, both tab bars in the viewer, and primary buttons all use the same solid accent fill. On the lab viewer that makes three blue blocks fighting for attention. Use an underline or ink-colored bottom bar for tabs and an ink text color with a subtle tint for the active nav item. Save solid fills for the one primary action on each screen (for example *Reveal answer* or *Mark completed*).
3. **Home has no focal point.** Five equal stat cards, then two mostly empty full-width cards. "Today's lab" is the main thing you come back for, but it's a sentence with an "Open" link. Suggestions:
   - Make **Today's lab** a hero card: big lab number in mono, title, topic chips, time estimate, step progress bar, and a solid **Start lab →** button.
   - Merge the five stats into one compact strip with mono numerals (`font-variant-numeric: tabular-nums`). Show the streak as a 7-day dot row or a small calendar heat strip (a GitHub-style grid of `labs/` dates would suit a portfolio well).
   - Put the Interview practice card next to Today's lab in a two-column layout instead of stacking a second full-width box.
4. **Empty states look broken.** `0 d`, `0.0 h`, `–`, and twelve `0/0 done (0%)` bars read like errors on first launch. Give zero states their own copy ("Start your first lab to begin a streak") and dim topics that have no labs yet (`0/0`) so they stop looking like failures.
5. **Underlined links everywhere on the Labs and Search lists.** Every row has two underlined links (number and title), so the list looks like a 1990s index page. Make the whole row a single link (or block link), with underline on hover/focus only. Put the lab number in a mono badge (`LAB 07`), and replace the `0/42` text with a thin progress bar.

### Medium impact

6. **Topic coverage uses raw slugs.** `ad-gpo`, `m365-entra`, and `windows-\ntroubleshooting` (which wraps at the hyphen) are internal IDs. Map them to display labels (`AD & Group Policy`, `M365 / Entra`, `Windows troubleshooting`), add a small icon or colored rule per topic, and reuse that topic color on lab cards and chips across the app. That color system would be the app's most recognizable trait.
7. **Viewer header is inconsistent.** The previous arrow is a bordered button and the next arrow is a bare underlined link, and they sit at opposite ends of the row. Group them as a pair (`← 01/07 →`) next to the title. The lab title also appears twice, in the app header and again as the iframe's own H1.
8. **Step list starts with a "selected" box.** The first step always shows a 2px accent outline (keyboard focus index), which reads like a validation error. Show the outline only after `j`/`k` is used, or use a soft background tint instead. Checkboxes could be larger, with `accent-color: var(--signal)` and a strike-through/dim on completed steps for a satisfying "ledger" feel.
9. **Journal panel.** Time / Difficulty / Confidence inputs have mismatched widths and wrap onto two rows. Replace the 1–5 number inputs with **five-pip segmented controls** (faster to use and very on-brand). The Markdown preview's H2s render bigger than the page title. Scale preview headings down and give the preview a tinted surface so it reads as "rendered output".
10. **Ticket tab could look like an actual ticket.** Right now it is a stack of identical textareas. Style it as a ticket form: mono ticket # field with a `#` prefix, a header strip (requester, priority, status), and section labels like an ITSM tool. This is a strong portfolio screenshot.
11. **Labs filter bar is heavy.** Seven always-visible controls push the list below the fold, and *Reset filters* sits alone on its own row. Keep the search box and Status visible, collapse the rest behind a **Filters (n)** toggle, and show active filters as removable chips. Also, the date inputs sit about 4px higher than the selects. Normalize control heights (for example `min-height: 38px` on all inputs and selects).
12. **Practice page is mostly empty space.** The card is small and floats in the middle of the screen. Make it a proper flashcard: larger question type, a visible **Leitner box track** (five boxes with the current one lit), the due count as a progress meter, and rating buttons colored Again→Easy (red→green). Show the shortcut hint as kbd chips under the card instead of a plain sentence.

### Polish

13. **Stacked `.card` sections touch.** "Today's lab" and "Interview practice" on Home, and both cards on Settings, have no gap between them. Add `section.card + section.card { margin-top: 12px }` or wrap them in a grid with `gap`.
14. **`kbd` is defined twice** in `client/src/styles/app.css` with different font rules. The later one wins. Keep one, using the mono font.
15. **Settings uses the native file input.** Style it as a drop zone ("Drop a backup JSON here or browse"). Turn the two download links into buttons with icons.
16. **Mobile top bar wraps awkwardly.** At 390px, Help and Dark sit next to the brand while "Settings" is left alone on a second row. On phones, use a compact bottom tab bar (Home / Labs / Practice / Search) or an overflow menu, and turn the theme toggle into an icon button.
17. **Mobile Home is about 2,300px tall.** Five full-width stat cards and twelve topic cards stack one per row. Use a 2-column stat grid and a compact topic list (label + inline bar) on small screens.
18. **Page titles.** Every route shows "Lab Dashboard" in the browser tab. Set `document.title` per route (for example `Lab 07 · Lab Ledger`).
19. **Micro-interactions.** A short check animation on steps, a progress bar that eases when it changes, and a subtle slide-in for the "New lab" toast would make the app feel alive. Keep the existing `prefers-reduced-motion` guard.
20. **Theme toggle label.** A text button reading "Dark"/"Light" is ambiguous (current state or action?). Use a sun/moon icon button with the existing `aria-label`.

---

## Bugs found along the way (not visual)

- **Practice question parsed from the wrong element.** The first due question for Lab 01 is *"Not built yet? Quick DC setup"*, which is the lab's Prerequisites `<details>` summary, not an interview question. The question parser appears to pick up `<details>` blocks outside the Interview Questions section.
- **Ticket "Issue" prefill runs text together.** The prefilled issue reads `…PowerShell module.Ticket #10423 – Priority: Normal"Hi IT…`. Block elements are joined without spaces or line breaks.

## Suggested order of work

1. Tokens + fonts + brand rename (one CSS file and `index.html`). This changes the whole app at once.
2. Dark-mode iframe fix.
3. Home hero card + stat strip + empty states.
4. Lab list rows and topic labels/colors.
5. Viewer polish (tabs, header nav, steps, journal pips, ticket form).
6. Practice flashcard, Settings, mobile nav.
