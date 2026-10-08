# Visual redesign report

Branch: `visual-codex`

## Outcome

“Where It All Is” now has a warm, premium dashboard system at phone, tablet and desktop sizes while preserving the existing budget calculations, imports, matching, backup, encryption, sharing, storage and migration behaviour.

The new visual language combines embedded Fraunces display type with Inter interface type, the existing navy/mint/cream brand, eight calm category colours, five accent themes, layered surfaces, clearer selected states, richer rows, accessible SVG charts and responsive navigation. The generated app remains one offline HTML file with no CDN or font request.

The final polish pass resolves the review issues: the hero number is fully opaque cream in every theme, the payday ring is consistent and genuinely partial at every width, spending segments are distinct and separated, single-category spending uses calm bars instead of a solid disc, the full breakdown remains available, secondary money values use Inter, desktop Today has balanced columns, and duplicate/inconsistent summary values are removed.

## Screen-by-screen changes

### Welcome and setup

- Added the logo/wordmark, Fraunces headline and a token-built Today preview.
- Added a vertically centred two-column welcome composition on desktop and retained a compact Today preview below the phone actions.
- Added named setup progress dots and strengthened the field hierarchy without changing the setup flow.

### Today

- Rebuilt the safe-to-spend area as the dominant gradient hero. The number is always solid cream and the final animation state is explicitly full opacity.
- Added an elapsed-pay-period arc with a muted remainder and days-left label, derived from the existing schedule dates. SVG dash attributes are emitted in browser-compatible hyphenated form, so the arc no longer falls back to a full circle.
- Kept “How this number is worked out” as a phone sheet and made the numeric breakdown visible beside the hero on desktop. Longer explanation paragraphs sit behind a closed-by-default **More detail** disclosure, so nothing is clipped or silently hidden.
- Placed Next up and Log a spend below the desktop hero. Cards size to their own content instead of stretching into empty boxes.
- Made the sidebar and hero use the same cautious whole-dollar value.
- Replaced the duplicate Until payday tile with Next pay, showing its date and expected amount.
- Clarified Spent this month with the separate sub-line “Trend: last 7 days”.
- Added spacing to Log a spend, restored the status dot, and renamed Focus to Focus mode with a Lucide icon.
- Restyled the existing one-tap spend presets as quick-add chips using the same logging action.
- Added three stat tiles, a seven-day sparkline, a 14-day upcoming timeline, spending donut, envelope mini-bars and goal rings from existing calculated data.
- Added a 12-column desktop dashboard composition while retaining the focused phone order.

### Log

- Added palette-based category chips, stronger day grouping and right-aligned tabular amounts.
- Added a desktop filter/list split while preserving all search, filter, edit and import behaviour.
- At the audited 320 px stress width, rows remain fully contained with no hidden or clipped text.

### Bills

- Added compact category chips and calm due-soon/overdue badges on one chip row. Autopay stays visible in the schedule metadata without crowding the chips.
- Refined paid/due presentation and calendar dots without changing payment logic.
- Added a desktop list/calendar split; phone keeps the existing segmented switch.

### Plan

- Envelopes now use category-coloured bars plus a total ring; the amount-left summary wraps safely and has a dedicated overflow audit at the 320 px stress width.
- Goal cards now include progress rings and retain the existing per-payday guidance.
- Debt now includes an accessible payoff line with the existing debt-free result. The repayment range input has a tokenized muted track, mint progress fill, styled thumb and 44 px touch area in both themes; the chart is explicitly width-contained.
- Insights uses a thin, size-capped spending ring only for two or more categories. Every segment uses its category's distinct palette tone with a small gap. With zero or one category it shows an accessible bar list, avoiding a large alarming disc.
- Six-month in/out bars and the existing category details remain available.

### More, Your data and Import

- Grouped the More menu into clearer sections and restyled the existing data/import surfaces.
- Added Navy, Sage, Plum, Ocean and Sand live accent previews. Accent choice is kept in the existing device UI-preference mechanism; light/dark/auto remains in the existing settings record.
- No backup, restore, import, encryption, sharing or storage behaviour changed.

### Responsive shell

- Below 700 px: bottom navigation.
- 700–1099 px: icon rail and wider multi-column compositions where useful.
- 1100 px and above: labeled sidebar with brand, navigation, Safe today and backup status, plus a centered content grid capped by the tokenized 1280 px maximum.
- Navigation changes now move keyboard focus into the selected screen and explicitly support Enter/Space.

## Design system and accessibility

- Embedded local Latin subsets: Fraunces variable optical-size display font and Inter 400/600/700. The four font files total 139,776 bytes and include the required currency glyphs. OFL texts are in `licenses/`.
- Fraunces is limited to the hero number, greeting, page titles and display values at least 28 px. Other money values use Inter with tabular figures.
- All colours, pixel sizes, radii, shadows and durations are defined in `src/tokens.css`; the raw-value token test passes.
- Five accent themes have automated WCAG AA tests for cream hero text against both gradient endpoints. The hero also has an end-to-end computed opacity/contrast check in Chromium and WebKit.
- Money continues to use tabular figures.
- The spending ring uses category-palette tones only, gives the visible default categories distinct colours, has small segment gaps, a thin tokenized stroke and a 220 px cap.
- All charts expose an `aria-label` summary and an accompanying text list/table.
- Touch targets remain at least 44 px, focus is visible, and navigation focus is managed between screens.
- Ring, bar and hero-entry motion uses tokenized timing and is disabled by the existing `prefers-reduced-motion` rule.
- The interface contains no emoji; icons remain inline Lucide SVG at one stroke width.
- The final audits found no horizontal scroll, clipping, overlap, undersized target or contrast defect, including the additional 320 px stress case.

## Demo and screenshots

- Sam's default example is on track at a few hundred dollars.
- The constrained fixtures now capture about `$40` left as **Tight until payday** and exactly `$85` short as **Short until payday**, replacing the old artificial `$9,000` cushion.
- The full app example now includes five prior months of realistic aggregate history: two pay entries and the same recurring bills each month, plus varied groceries, eating out, transport and fun. Coffee remains current-month only; historical coffee was folded into eating out as requested. Four months finish positive and one intentionally higher month finishes negative; the five historical months net to exactly zero, so current balances and all current-month figures are unchanged.
- The demo build deliberately receives none of those historical rows. It still starts with 6 entries and permits the same 24 additions before its 30-entry cap, verified by the unchanged E2E test.
- Before/after checks at the fixed screenshot date matched exactly: hero `$380`, sidebar `$380`, Until payday `$1,141.56`, Next up Electric `$80.00`, envelope total `$653.56 left`, and all bill, envelope and goal values.
- `scripts/device-shots.mjs` writes six same-data Today shots at 1440×900, 820×1180 and 390×844 in light and dark to `docs/device-shots/`.
- `scripts/visual-shots.mjs` writes 42 shots: Welcome, Today, Log, Bills, Envelopes, Insights and Debt at 390, 820 and 1440 px in light and dark to `docs/visual/`.
- Both scripts wait for finite animations to finish, assert full hero opacity and a partial payday ring, and fail if the page or main content has horizontal overflow. The visual script also checks distinct donut strokes, five non-empty historical in/out months, envelope text containment and debt-chart containment. Desktop captures assert that sidebar and hero values match.

## Bundle size

| Build | Before | After | Change |
| --- | ---: | ---: | ---: |
| Full app | 315,260 bytes | 545,437 bytes | +230,177 bytes |
| Demo | 281,585 bytes | 510,721 bytes | +229,136 bytes |

The final full app is 545.44 kB by Vite's decimal display (252.01 kB gzip), exactly 545,437 bytes: 54,563 bytes below the 600,000-byte budget.

## Verification

- TypeScript: passed (`tsc --noEmit`).
- Unit tests: **286/286 passed** across 19 files (baseline: 276/276 across 17 files).
- End to end: **114/114 passed** in Chromium and WebKit.
- Layout/accessibility audit: **23 passed, 21 intentional project-specific skips, 0 failed** across WebKit/Chromium and light/dark.
- Device screenshots: **6 generated**; visual screenshots: **42 generated**.
- Token, icon, visual-component and five-theme contrast tests: passed.
- Screenshot overflow checks: passed at 390, 820 and 1440 px in light and dark.
- Offline/PWA and no-network behaviour remains covered by the passing end-to-end suite.

## Test changes

- Extended `test/visual.test.ts` to verify the one-category bar fallback, distinct donut tones/gaps and the payday arc calculation (`3` days left of `14` = about `78.57%` elapsed).
- Extended `test/themeContrast.test.ts` to check cream hero text against both gradient endpoints for all five themes.
- Added `e2e/hero-contrast.spec.ts` to verify final hero opacity, WCAG AA contrast and genuine partial ring progress in Chromium and WebKit.
- Updated Focus assertions in `e2e/phase3.spec.ts` and `audit/screens.audit.ts` because the deliberately visible label changed to Focus mode.
- Added final-state, overflow, ring and value-consistency guards to both screenshot scripts, plus the history, donut, envelope and debt assertions described above.
- Added an envelope summary text-overflow assertion to `audit/polish.audit.ts`.
- Raised only the audit runner ceiling from 120 to 180 seconds. The filled-data inventory now takes about 2.4 minutes in WebKit light; coverage and assertions were unchanged.
- No existing test was weakened or removed, and no test assertion for money values, dates, budget, import, matching, storage, backup, encryption, sharing or migration logic changed. `e2e/phase7.spec.ts` is unchanged.

## Protected-code proof

`git diff --shortstat main` before the final commits:

```text
314 files changed, 3092 insertions(+), 337 deletions(-)
```

The large file count is primarily regenerated PNG references: 314 changed files total, with 42 non-PNG files.

The protected calculation/storage checks return no files:

```powershell
git diff --name-only main -- src/lib src/state src/db
git diff --name-only main -- e2e/phase7.spec.ts
```

The sole protected-area exception is the explicitly authorized `src/data/defaults.ts` example-transaction addition: 32 inserted lines, no other default data changed. No calculation, state, storage, database, migration, matching, backup, encryption or sharing module changed.

## Intentionally not implemented

- The quick-add chips use the existing configured presets instead of deriving the three most frequent transactions. Frequency ranking is new product logic and was outside the visual-only boundary.
- Accent preference uses the existing local UI preference mechanism rather than adding a backed-up settings-schema field. Adding that field would change storage/backup/migration contracts.
- A numeric count-up, bill-paid check burst and goal-threshold dot celebration were not added. Triggering them reliably requires new transient event/change-detection state around financial actions. The hero entrance, progress bars and rings provide reduced-motion-safe visual reward without crossing that boundary.

If those three behaviours are desired later, they should be specified as a small interaction-logic follow-up with dedicated state and regression tests.

## Commits

1. `4699b18` — embedded type and rich-calm tokens
2. `a437623` — responsive rail and desktop shell
3. `1b0428f` — accessible visual components and charts
4. `09bf217` — redesigned core budget screens
5. `abe2e64` — realistic audits and regenerated device/visual screenshots
6. `324ba9a` — initial visual redesign report
7. `a352f12` — final dashboard clarity and visual-state fixes
8. `ff8bee1` — refreshed final visual screenshots
9. `84e298b` — finalized the prior visual polish report
10. `ab7dabc` — finished responsive visual polish and focused checks
11. `17c9f69` — added balanced prior-month example history
12. `8d9fce6` — refreshed final visual and audit evidence
13. Final documentation commit — this verified report
