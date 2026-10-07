# Visual redesign report

Branch: `visual-codex`

## Outcome

“Where It All Is” now has a warm, premium dashboard system at phone, tablet and desktop sizes while preserving the existing budget calculations, imports, matching, backup, encryption, sharing, storage and migration behaviour.

The new visual language combines embedded Fraunces display type with Inter interface type, the existing navy/mint/cream brand, eight calm category colours, five accent themes, layered surfaces, clearer selected states, richer rows, accessible SVG charts and responsive navigation. The generated app remains one offline HTML file with no CDN or font request.

## Screen-by-screen changes

### Welcome and setup

- Added the logo/wordmark, Fraunces headline and a token-built Today preview.
- Added a two-column welcome composition on desktop.
- Added named setup progress dots and strengthened the field hierarchy without changing the setup flow.

### Today

- Rebuilt the safe-to-spend area as the dominant gradient hero with a payday progress ring and stronger on-track/tight/short states.
- Kept “How this number is worked out” as a phone sheet and made the same existing breakdown persistently visible beside the hero on desktop.
- Restyled the existing one-tap spend presets as quick-add chips using the same logging action.
- Added three stat tiles, a seven-day sparkline, a 14-day upcoming timeline, spending donut, envelope mini-bars and goal rings from existing calculated data.
- Added a 12-column desktop dashboard composition while retaining the focused phone order.

### Log

- Added palette-based category chips, stronger day grouping and right-aligned tabular amounts.
- Added a desktop filter/list split while preserving all search, filter, edit and import behaviour.
- At the audited 320 px stress width, compact chips show their coloured icon and keep the full category name as an accessible label; names remain visible at the requested 390 px width.

### Bills

- Added category chips and calm due-soon/overdue badges.
- Refined paid/due presentation and calendar dots without changing payment logic.
- Added a desktop list/calendar split; phone keeps the existing segmented switch.

### Plan

- Envelopes now use category-coloured bars plus a total ring.
- Goal cards now include progress rings and retain the existing per-payday guidance.
- Debt now includes an accessible payoff line with the existing debt-free result.
- Insights now includes an accessible spending donut and six-month in/out bars while retaining the existing category details.

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
- All colours, pixel sizes, radii, shadows and durations are defined in `src/tokens.css`; the raw-value token test passes.
- Five accent themes have automated WCAG AA tests for their primary and both hero-gradient endpoints. The lowest tested pair is 4.68:1.
- Money continues to use tabular figures.
- All charts expose an `aria-label` summary and an accompanying text list/table.
- Touch targets remain at least 44 px, focus is visible, and navigation focus is managed between screens.
- Ring, bar and hero-entry motion uses tokenized timing and is disabled by the existing `prefers-reduced-motion` rule.
- The interface contains no emoji; icons remain inline Lucide SVG at one stroke width.
- The final audits found no horizontal scroll, clipping, overlap, undersized target or contrast defect, including the additional 320 px stress case.

## Demo and screenshots

- Sam's default example is on track at a few hundred dollars.
- The constrained fixtures now capture about `$40` left as **Tight until payday** and exactly `$85` short as **Short until payday**, replacing the old artificial `$9,000` cushion.
- `scripts/device-shots.mjs` writes six same-data Today shots at 1440×900, 820×1180 and 390×844 in light and dark to `docs/device-shots/`.
- `scripts/visual-shots.mjs` writes 42 shots: Welcome, Today, Log, Bills, Envelopes, Insights and Debt at 390, 820 and 1440 px in light and dark to `docs/visual/`.
- Both scripts fail if the page or main content has horizontal overflow.

## Bundle size

| Build | Before | After | Change |
| --- | ---: | ---: | ---: |
| Full app | 315,260 bytes | 537,712 bytes | +222,452 bytes |
| Demo | 281,585 bytes | 504,037 bytes | +222,452 bytes |

The final full app is 537.71 kB (250.19 kB gzip), 62,288 bytes below the 600,000-byte budget.

## Verification

- TypeScript: passed (`tsc --noEmit`).
- Unit tests: **283/283 passed** across 19 files (baseline: 276/276 across 17 files).
- End to end: **112/112 passed** in Chromium and WebKit.
- Layout/accessibility audit: **23 passed, 21 intentional project-specific skips, 0 failed** across WebKit/Chromium and light/dark.
- Post-fixture visual regeneration: **12 passed, 12 intentional cross-project skips**; the `$40` tight test also passed in both Chromium and WebKit.
- Token, icon, visual-component and five-theme contrast tests: passed.
- Screenshot overflow checks: passed at 390, 820 and 1440 px in light and dark.
- Offline/PWA and no-network behaviour remains covered by the passing end-to-end suite.

## Test changes

- Added `test/visual.test.ts` for progress clamping and stable category-palette cycling.
- Added `test/themeContrast.test.ts` for WCAG AA across all five accents and hero endpoints.
- Updated `audit/checks.ts` to recognize the deliberately renamed `.app-nav` in place of the old `.bottom-nav` selector.
- Updated the screenshot fixtures to calculate realistic `$40` tight and `$85` short states instead of hard-coding an implausible cushion.
- Updated `e2e/tight.spec.ts` fixture values from `$50` to the requested `$40`; the status/calculation expectations are unchanged.
- No existing test was weakened or removed, and no test assertion for budget, import, storage, backup, encryption, sharing or migration logic changed.

## Protected-code proof

`git diff --shortstat main...visual-codex`:

```text
308 files changed, 2522 insertions(+), 292 deletions(-)
```

The large file count is primarily regenerated PNG references (283 files in the screenshot/audit commit). Source/test/script changes are 30 files with 2,160 insertions and 171 deletions.

This protected-path check returns no files:

```powershell
git diff --name-only main...visual-codex | Select-String -Pattern '^(src/(lib|state|db|data)/)'
```

Therefore no calculation, storage, database, migration or seed-data module changed.

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
6. Final documentation commit — this report
