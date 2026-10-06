# Where It All Is — completeness and polish audit

Audit date: 6 Oct 2026 · Build: v0.1.0 (commit `8408d30`) · No app code was changed for this audit.

**How this was done**

- Part 1: [SPEC.md](../SPEC.md) was read section by section against the code, the 243 unit tests and the 36 end-to-end tests. The spec only existed in our first chat, so I saved a copy to the repo root.
- Part 2: every screen and state was captured at 390 px (iPhone 13, WebKit), in light and dark, with empty data and with realistic data. That's 80 screenshots per theme, in [docs/screens/](screens/). The script is [audit/screens.audit.ts](../audit/screens.audit.ts). Rerun it with `npx playwright test -c playwright.audit.config.ts screens --project=webkit-iphone13-light --project=webkit-iphone13-dark`.
- "Realistic data" means: Sam sets up on 30 Sep with a 1,200 balance, pay of 1,500 every 2 weeks, rent 800, phone 45 and Netflix 15.49. Sam comes back on 16 Oct, which is payday after a 16-day gap, then imports a Chase-style CSV and logs four spends. Sam also adds four envelopes, a goal, two debts and a note, and opens a partner share.
- The automated layout checks (text under 14 px, tap targets under 44 px, clipping, overlaps, AA contrast, sideways scrolling) found **0 problems on all 160 screenshots**. So everything in Part 2 is about judgement, not things a script can catch.

---

## The 10 things that matter most

1. **Importing a statement double-counts bills and paydays.** Bills you mark paid and paychecks you confirm are their own transactions. Import only matches rows against spends you logged by hand ([src/lib/csv/convert.ts:132](../src/lib/csv/convert.ts#L132)). The bank's copy of your rent and your pay is therefore added again. In the realistic run, the balance went from about 2,400 to **3,877**, and Insights shows "Home $1,870" ([filled-16-log](screens/light/filled-16-log.png), [filled-25-plan-insights](screens/light/filled-25-plan-insights.png)). This is a correctness bug, not polish, and buyers will hit it in their first week.
2. **On a return day, Today's big number is half a screen down.** It sits below up to four cards: the storage note, the backup reminder, the payday card and the away card ([filled-04](screens/light/filled-04-today-away-and-payday.png)). That breaks "one primary number per screen".
3. **A hidden account can never come back.** After the 8-second undo, there's no list of hidden accounts ([More.tsx:177](../src/screens/More.tsx#L177)). Categories have a "Hidden" section; accounts don't.
4. **The Log has no filters, no "cleared" marking, and search only covers the current month.** Spec §7.3 asks for account and category filters and for marking items cleared.
5. **Emoji are used as icons next to the line-drawn SVG icons.** Categories, chips, onboarding bills, "💰 Paycheck", "🎉" milestones and the calendar all use emoji, while the nav bar uses 24 px stroke icons. This is the biggest "AI-built" tell.
6. **Spacing bug in 4 places:** a button row sits directly against the next card with no gap (Envelopes, Rules, Debt, filled Envelopes).
7. **Today is five identical white cards in a stack.** The hero card looks the same as "Next bills", so nothing says "this one matters".
8. **The screen is completely blank while the app loads.** The first screenshot caught it before the data had opened. There's no loading state.
9. **Deleting works differently on different screens.** Bills ask for confirmation. Transactions, paychecks, goals and debts are deleted at once with only an undo toast. "Delete" is styled as a green underlined link, the same as navigation links.
10. **Spec gaps with no workaround:** no simple/full mode, no keyboard-navigation or 5,000-transaction performance testing, and end-to-end tests run in Chromium only.

---

# Part 1 — Feature completeness

Status: **Done** = built and proven by a test or screenshot · **Partial** = built, with a gap described · **Missing** = not built.

## §3 Design principles

| # | Principle | Status | Evidence / gap |
|---|---|---|---|
| 1 | One primary number, one primary action per screen | Partial | Holds on most screens. Fails on Today on return days (notices above the number), and on Bills (5 identical "Mark paid" buttons). [filled-04](screens/light/filled-04-today-away-and-payday.png), [filled-19](screens/light/filled-19-bills.png) |
| 2 | Max 3 taps to log a spend from Today | Done | Typing "12.50 coffee" and pressing Enter is one action; a chip is one tap. `e2e/phase2.spec.ts`, `audit/phase2.audit.ts` (counts taps) |
| 3 | No shame | Done | "You've gone $X past today's share — that's fine" ([Today.tsx:272](../src/screens/Today.tsx#L272)); the overspend message matches the spec wording ([Envelopes.tsx](../src/screens/plan/Envelopes.tsx)); no streaks |
| 4 | Tapping any number shows "How is this worked out?" | Partial | Only the Today number does. Envelope, goal, bill and Log totals don't. Debt has its own "How this is estimated" |
| 5 | Gentle return ("While you were away") | Done | [src/lib/away.ts](../src/lib/away.ts) (more than 2 days); `e2e/phase3.spec.ts`; [filled-04](screens/light/filled-04-today-away-and-payday.png) |
| 6 | Undo everywhere (toast for 8 s) | Partial | 8 s toast ([Toast.tsx:44](../src/ui/Toast.tsx#L44)) on logging, editing, deleting, marking paid, imports, merges and moves. No undo on: saving a chip, settings changes, envelope moves after the toast has gone, or hiding an account (permanent, see Top 10 #3) |
| 7 | Calm visuals: Soft and Midnight themes, AA contrast, reduced motion | Done | [styles.css:1-60](../src/styles.css#L1-L60), [styles.css:271](../src/styles.css#L271); audit contrast check is clean in both themes |
| 8 | Plain language | Partial | Mostly good. Jargon left: "APR" (explained), "CSV", the "Quick log" badge, and the stale share-code placeholder "WIAI1.…" |
| 9 | Wording: never treat, help or diagnose ADHD; no financial advice | Done | [src/copy.ts](../src/copy.ts) disclaimer; About; Help |

## §4 Tech constraints

| Item | Status | Evidence / gap |
|---|---|---|
| Vite + Preact, one self-contained HTML, system fonts, inline SVG | Done | `vite.config.ts` (singlefile); `dist/app.html` is 216 KB |
| IndexedDB with schema versions and migrations; localStorage only for UI prefs | Done | [src/db/schema.ts](../src/db/schema.ts) (v1→v3), `test/db.test.ts`, [src/lib/prefs.ts](../src/lib/prefs.ts) |
| PWA (manifest + service worker) for the hosted version | Done | `scripts/build-site.mjs`; `e2e/site.spec.ts` (works offline after reload) |
| Single file works offline from `file://` | Done | Every e2e test runs from `file://` |
| No network calls | Done | CSP `connect-src 'none'` (vite.config.ts); e2e guard fails on any request |
| Zero analytics, stated in the app | Done | About & privacy ([empty-37](screens/light/empty-37-more-about.png)) |
| Under 1 MB; loads in under 1 s on a mid-range phone | Partial | 216 KB. Load time has never been measured on a phone |
| Browsers: Chrome, Safari (iOS and macOS), Edge, Firefox | Partial | e2e: Chrome only. Audits: WebKit and Chromium. Firefox and Edge never run. Real devices are on the checklist, not yet done |
| USD, GBP, EUR, CAD, AUD; local date formats | Done | `src/lib/money.ts` CURRENCIES; `test/money.test.ts` |
| `build` and `build:demo` variants (30-entry limit, banner, seeded data, no export) | Done | `e2e/site.spec.ts` (demo test) |

## §5 Data model

| Item | Status | Evidence / gap |
|---|---|---|
| All stores, integer minor units, Schedule shape | Done | [src/db/types.ts](../src/db/types.ts) (plus extras: openingDate, payToAccountId, tombstones, partner) |
| `settings.mode: 'simple' \| 'full'` | Missing (UI) | The field exists but nothing reads or sets it |
| `events` store (for undo and "while you were away") | Partial | The store exists but nothing writes to it. Undo is in memory and away is worked out from dates. That's fine in practice, but the store is dead weight |
| `transactions.cleared` | Partial | Set automatically (imports are cleared). The user can't see or change it |

## §6 Safe to spend

| Item | Status | Evidence |
|---|---|---|
| Formula (available − bills − goals − buffer, ÷ days, − spent today) | Done | [src/lib/safeToSpend.ts](../src/lib/safeToSpend.ts) (rules documented at the top) |
| ≥ 20 unit-test cases | Done | 48 cases in `test/safeToSpend.test.ts` |
| Big number for today, small number for the period | Done | [filled-13](screens/light/filled-13-today.png) |
| "Tight until payday" state with the shortfall and one action | Done (not screenshotted) | [Today.tsx:279](../src/screens/Today.tsx#L279); unit tests. My cushion test didn't push the number below zero, so there's no screenshot |
| "How is this worked out?" lists every line | Done | [filled-14](screens/light/filled-14-today-explain.png) |
| Goal set-aside toggle, buffer | Done | Goals.tsx:74, Settings → Cushion |
| Credit cards: no double counting | Done | `test/safeToSpend.test.ts` (card cases) |

## §7 Screens

### 7.1 Onboarding
| Item | Status | Evidence |
|---|---|---|
| 4 steps, skippable, "Try with example numbers" | Done | [empty-01 … 07](screens/light/); `e2e/phase2.spec.ts` |
| Common bills with 2 fields each | Done | [empty-07](screens/light/empty-07-onboarding-4-bills.png) |
| Lands on Today; example mode labelled; "Clear examples" in one tap | Done | [demo-01](screens/light/demo-01-today.png) |

### 7.2 Today
| Item | Status | Evidence |
|---|---|---|
| Big number and "until payday" sub-line | Done | [filled-13](screens/light/filled-13-today.png) |
| Quick log with fuzzy category match; Enter saves | Done | `test/quickLog.test.ts` |
| 4–6 user-editable chips | Done | More → Quick-log chips ([empty-33](screens/light/empty-33-more-chips.png)) |
| Next 3 bills | Done | |
| "Right now — one thing" | Done | [Today.tsx:468](../src/screens/Today.tsx#L468) |
| "While you were away" | Done | see §3.5 |
| Focus mode | Done | [filled-15](screens/light/filled-15-today-focus.png) |

### 7.3 Log
| Item | Status | Evidence / gap |
|---|---|---|
| Grouped by day | Done | [filled-16](screens/light/filled-16-log.png) |
| Filter by month | Done | Month arrows |
| Filter by account or category | **Missing** | [Log.tsx](../src/screens/Log.tsx) has search and month only |
| Search | Partial | Notes and category names, **current month only** ([Log.tsx:42](../src/screens/Log.tsx#L42)). No amount search |
| Swipe or tap to edit category, mark cleared, delete with undo | Partial | Tapping opens an edit sheet with delete and undo. **No swipe, and no way to mark cleared** |
| Import statement button | Done | |

### 7.4 Bills
| Item | Status | Evidence |
|---|---|---|
| List and month calendar, colour-coded | Done | [filled-19](screens/light/filled-19-bills.png), [filled-20](screens/light/filled-20-bills-calendar.png) |
| Next due, schedule text, mark paid (creates a transaction), autopay | Done | `test/bills.test.ts`, `e2e/phase2.spec.ts` |
| "Big yearly bills" helper | Done | [Bills.tsx:104](../src/screens/Bills.tsx#L104) (only shows when a yearly bill exists, so not in the screenshots) |

### 7.5 Plan
| Item | Status | Evidence |
|---|---|---|
| Envelopes: limits, green→amber→coral bars, overspend suggestion, move money | Done | [filled-22](screens/light/filled-22-plan-envelopes.png), `test/phase3.test.ts` |
| Goals: progress, target date, amount per paycheck | Done | [Goals.tsx:33](../src/screens/plan/Goals.tsx#L33) |
| Debt: list, total, snowball vs avalanche, extra-payment slider, debt-free date, labelled "estimate" | Done | [filled-24](screens/light/filled-24-plan-debt.png); `test/debt.test.ts` checked against `docs/debt-check-*.csv` |

### 7.6 More
| Item | Status | Evidence / gap |
|---|---|---|
| Accounts | Partial | Add, edit, hide. **Hidden accounts can't be shown again**; there's no delete |
| Categories | Done | Add, edit, hide, show again ([empty-28](screens/light/empty-28-more-categories.png)) |
| Rules | Done | Add, edit, delete, plus 20 starter rules ([empty-29](screens/light/empty-29-more-rules.png)) |
| Notes per month | Done | [empty-30](screens/light/empty-30-more-notes.png) |
| Household sharing | Done | [empty-32](screens/light/empty-32-more-share.png) |
| Backup & restore | Done | [empty-31](screens/light/empty-31-more-backup.png) |
| Settings: theme, currency, buffer, week start | Done | [empty-34](screens/light/empty-34-more-settings.png) |
| Settings: simple/full mode | **Missing** | |
| Help (in-app guide) | Done | 8 articles; `e2e/help.spec.ts` |
| About & privacy, disclaimer | Done | |

### 7.7 Insights
| Item | Status | Evidence / gap |
|---|---|---|
| This month vs last month (bar list) | Done | [filled-25](screens/light/filled-25-plan-insights.png) |
| "Where it all went": top 5 merchants | Partial | Groups by the description with digits and punctuation removed ([insights.ts:43](../src/lib/insights.ts#L43)), so store numbers merge. But different wording for the same merchant ("AMZN Mktp US" vs "Amazon", or two Starbucks locations) stays separate, and bill payments ("Rent or mortgage") count as merchants |
| Milestones, no streaks | Done | [src/lib/insights.ts](../src/lib/insights.ts) |

### 7.8 CSV import
| Item | Status | Evidence / gap |
|---|---|---|
| Pick file or drag and drop; parsed on the device | Done | [empty-13](screens/light/empty-13-import-pick.png) |
| Auto-detect columns, date format, sign, header row | Done | `src/lib/csv/detect.ts`; `test/csvImport.test.ts` (11 bank-style fixtures) |
| Preview of the first 10 rows; fix with dropdowns | Partial | Shows **8** rows plus "…and N more" ([Import.tsx:318](../src/screens/Import.tsx#L318)); dropdowns are Done |
| Save the mapping by name | Done | "Remember these settings as"; recognised next time (`e2e/phase4.spec.ts`) |
| Choose the account | Done | |
| Duplicate detection (within the file and against earlier imports) | Done | `test/importActions.test.ts`; "Already imported before — skipped" |
| Rules engine, then a fast sort screen with "always do this" | Done | [filled-08](screens/light/filled-08-import-sort.png); `e2e/phase4c.spec.ts` |
| Summary: imported N, skipped M, K need sorting | Partial | The counts are on the review step. The final screen only says "Imported 10 transactions" ([filled-10](screens/light/filled-10-import-done.png)) |
| Undo the whole batch | Done | "Undo this import" |
| Preset mappings for common banks | Partial | Auto-detect is used instead of named presets. Arguably better, but not what the spec says |
| 20 starter rules | Done | `src/data/defaults.ts` |

### 7.9 Household sharing
| Item | Status | Evidence |
|---|---|---|
| Encrypted `.wiai` snapshot, choice to include transactions, read-only Partner tab | Done | [filled-27](screens/light/filled-27-partner.png); `e2e/phase5.spec.ts` |
| Full device move: Replace or Merge (by id and updatedAt) | Done | Backup → restore; `test/backup.test.ts` (tombstones) |
| QR when small | Done | `test/qrfit.test.ts` |
| "No account, no cloud…" wording | Done | |

### 7.10 Backup & restore
| Item | Status | Evidence |
|---|---|---|
| One-tap export, optionally encrypted | Done | `e2e/phase5.spec.ts` |
| Reminder every N days (default 7) | Done | [filled-13](screens/light/filled-13-today.png) |
| iOS: explains Safari can clear data | Done | Today storage note, Backup, About, Help |
| Restore with a preview | Done | `e2e/phase5.spec.ts` |
| CSV export | Done | `src/lib/backup/csvExport.ts` |

## §8 Content
| Item | Status | Evidence / gap |
|---|---|---|
| Warm, short, second person | Done | |
| Empty states always give one next action | Partial | Log, Bills and Insights empty states are text only; their action is somewhere else on the screen or on another screen ([empty-11](screens/light/empty-11-log.png), [empty-15](screens/light/empty-15-bills.png), [empty-21](screens/light/empty-21-plan-insights.png)) |
| 8 Help articles | Done | `e2e/help.spec.ts` |
| Footer disclaimer | Done | |

## §9 Deliverables
| Item | Status | Evidence |
|---|---|---|
| Start-Here PDF, 2 pages | Done | `dist/Start-Here-Letter.pdf`, `dist/Start-Here-A4.pdf`; `e2e/pdf.spec.ts` |
| Offline single HTML file | Done | `dist/Where-It-All-Is-Budget-App.html` (renamed at your request) |
| Hosted link | Done | Cloudflare Pages instead of GitHub Pages (your change); `e2e/site.spec.ts` |
| "Etsy's app can't download files" note | Done | PDF page 1 |
| Licence in the PDF and About | Done | |

## §10 Testing and acceptance
| Item | Status | Evidence / gap |
|---|---|---|
| Unit: schedules, safe to spend, debt vs spreadsheet, CSV (10+ samples), duplicates, merge, encryption | Done | 243 unit tests in `test/` |
| E2E: onboarding → log → import → mark paid → backup → restore, in **Chromium + WebKit** | Partial | Every step is covered across the specs, but there's no single end-to-end run, and e2e runs in **Chromium only** (`playwright.config.ts`, channel `chrome`) |
| Manual device checklist | Partial | Written ([docs/device-checklist.md](device-checklist.md)), not yet done |
| Accessibility: keyboard navigation | **Missing** | No keyboard test exists |
| Accessibility: screen-reader labels on every button | Partial | Labels are set throughout; never checked with VoiceOver or TalkBack |
| Accessibility: AA contrast in both themes | Done | Audit `lowContrast` check |
| Performance: 5,000 transactions under 100 ms, virtualised list | **Missing** | No virtualisation and never measured. The Log renders the whole month |
| Definition of done: no console errors, no network requests | Done | Audits log console errors (0); e2e network guard |

## §11–12
Phases 0–6 are done; Phase 7 (polish) is next. Everything out of scope stays out of scope.

---

## What a paying buyer will expect that's missing (from both the spec and the app)

| # | Expectation | Today | Suggested fix |
|---|---|---|---|
| 1 | **An import shouldn't double-count bills I marked paid or pay I confirmed** | It does (Top 10 #1) | Extend import matching to rows with source `bill` and `income` (same amount, ±3 days, same account), the same way manual logs are matched. Show "matched to Rent (marked paid Oct 1)" in the review step |
| 2 | **Edit and delete for every item** | Transactions, bills, paychecks, goals, debts, rules, chips and notes can all be edited and deleted. **Accounts**: hide only, and can't be un-hidden. **Categories**: hide only (no delete or merge). **Envelope moves**: can't be seen or undone once the toast has gone. **Imports**: undo only on the done screen, no import history | Add a "Hidden" section to Accounts like Categories has. Add an "Import history" list (More → Backup or Log) with "Undo this import". Add a moves list on the envelope sheet |
| 3 | **The same confirm step before every delete** | Bills confirm; everything else deletes at once and relies on the toast | One rule: anything with history (accounts, paychecks, debts with a linked bill, categories in use) gets a confirm with the consequence spelled out. Single transactions keep the undo toast. Show delete as coral text, not a green link |
| 4 | **Undo** | 8-second toast only | Keep it. Add the import history above; that's the undo buyers actually miss |
| 5 | **Search in Log** | Current month only; notes and categories only | Search across all months, including amounts ("45", "45.00"). Add filter chips for account and category |
| 6 | **Recurring income** | Done: several paychecks with schedules, a "varies" option and a pause switch | — |
| 7 | **A clear "what is this number?" on Today** | Tap or link opens the explain sheet | For the first 7 days, show one line under the number: "What you can spend today and still cover your bills until payday." |
| 8 | **Transfers between my own accounts** (savings ↔ everyday) | Only card-bill payments are transfers. Moving money to savings shows up as spending | Add "Transfer" to the Log add sheet (from, to, amount); it doesn't count as spending |
| 9 | **Erase all my data** (before selling a phone, or to start over) | No such option (only "Clear examples") | Settings → "Erase everything on this device", with a typed confirm and a "back up first" prompt |
| 10 | **A loading state** | Blank screen until IndexedDB opens | Show the logo and the app name in the HTML itself, so it appears before JavaScript runs |
| 11 | **Turn repeated imports into bills** | Not offered | After an import, suggest "Netflix every month on the 8th: add as a bill?" when the same description repeats monthly |
| 12 | **Split one transaction** (supermarket shop: groceries plus household) | Not possible | Nice to have; consider after v1 |
| 13 | **App lock on a shared phone** | None | A device-only PIN is a common request for budget apps. Consider for v1.1; don't block launch |

---

# Part 2 — Design polish

## A. The "AI-built" tells, one by one

| Tell | Found? | Where | Fix |
|---|---|---|---|
| **Emoji as icons / mixed icon styles** | **Yes, everywhere** | Nav and buttons use 24 px stroke SVGs. Categories, chips, onboarding bills, sort tiles, the emoji picker, "💰 Paycheck" (Today away card, calendar), "🎉" milestones and the goal "⭐" are all emoji. Month arrows are text characters ‹ › in boxes. The welcome logo is the text character "◎" | Draw one set of 16 category icons in the same 1.75-stroke style as the nav icons, in a small tinted circle using the category colour. Keep emoji as an optional "personal" choice for custom categories only. Replace ‹ › and ◎ with SVGs (chevron icon; the real logo) |
| **Default or mixed fonts** | Partly | Body uses the system font stack (good, as the spec says). Amounts use `ui-monospace`, which looks like code, not money | Use the system font with `font-variant-numeric: tabular-nums` for all amounts. Drop monospace except the share-code box |
| **Inconsistent spacing / radius / shadow / buttons** | **Yes** | 12 font sizes, 12 corner radii (3, 4, 5, 6, 10, 12, 14, 16, 18, 22 px…), about 25 different paddings, 11 gaps, 7 font weights in the CSS. Button rows touch the next card in 4 places. Link styles vary: underlined green ("How is this worked out?"), plain green ("Where do I find my bank's CSV?", "How this is estimated"), plain grey ("Skip this one", "Not now") | Adopt the token set below. Add a single `.stack` gap rule so siblings never touch. Have exactly two link styles: inline (underlined accent) and quiet action (muted, no underline) |
| **Gradients or effects with no purpose** | No | The only gradients draw the dropdown arrow. One shadow token | — |
| **Placeholder or generic text** | Minor | The share-code placeholder still says "WIAI1.…" (codes are now WIAI2). The log uses "•" when there's no category. "1 rows" / "We read 1 rows" grammar. Sheet title is just "Edit". Settings "Your name" field is empty with no placeholder | "Paste the code your partner sent". A neutral category icon. Proper plurals. "Edit spend" / "Edit pay". Placeholder "Optional" |
| **Missing empty, loading or error states** | Partly | Empty states exist on every screen (good) but several have no button. **No loading state.** A non-CSV file gives a red line inside a column-mapping form instead of a clear "this isn't a statement" state ([empty-14](screens/light/empty-14-import-bad-file.png)) | Put the primary action inside each empty card. Add the HTML loading splash. Add an import error state: "This file doesn't look like a bank statement" + "Choose a different file" + "Where do I find my bank's CSV?" |
| **Inconsistent capitalisation / punctuation** | Yes (punctuation) | Capitalisation is consistently sentence case (good). Apostrophes and quotes are mixed: straight `'` and `"` on most screens, curly `’` and `“ ”` in Help, the Today storage note and the PDF. "safe to spend" vs "safe-to-spend" | Curly quotes everywhere (one find-and-replace pass in copy, plus a lint test). Always write "safe to spend" without hyphens |
| **Text too small, or tap targets under 44 px** | No | Audit: 0 problems | — |
| **Misaligned edges** | Minor | Welcome screen: left-aligned heading with a centred link at the bottom. Import pick box: centred text, while every other card is left-aligned. Bills list: the amount sits above "Mark paid" instead of aligning with the bill name | Left-align everything except the Today hero. Put each bill's amount on the first line, aligned with the name |
| **List of cards with no hierarchy** | **Yes** | Today (5 equal white cards), Insights (3 equal cards, even when all are empty), More (11 rows in one card), Log (one card per day) | See per-screen fixes: Today hero without a card frame; group More into sections; Log as one list with day headers; Insights shows a single empty state until there's data |

## B. Screen by screen

### Onboarding
| Screen | Issue | Fix |
|---|---|---|
| Welcome ([empty-01](screens/light/empty-01-onboarding-welcome.png)) | Logo is a text character "◎"; heading left, link centred | Use the real logo SVG; left-align the link, or centre the whole block |
| Step 1 ([empty-03](screens/light/empty-03-onboarding-1-name.png)) | "Let's" uses a straight apostrophe | Curly quotes pass |
| Step 2 error ([empty-05](screens/light/empty-05-onboarding-2-balance-error.png)) | Good. Error then hint order is right | — |
| Step 3 ([empty-06](screens/light/empty-06-onboarding-3-pay.png)) | Toggle off-state has a dark grey knob on a light track, which reads as "disabled" | Toggle off: white knob with a `--border` ring on a `--surface-2` track |
| Step 4 ([empty-07](screens/light/empty-07-onboarding-4-bills.png)) | 6 rows each repeat the "Amount / Day of month" labels, which makes it long and visually noisy; emoji per bill | Show the column labels once above the list; keep the per-row aria-labels; category icons instead of emoji |

### Today
| Screen | Issue | Fix |
|---|---|---|
| Today, return day ([filled-04](screens/light/filled-04-today-away-and-payday.png)) | The number is below 4 cards; payday card and away card both use the accent border and both mention pay | Order: greeting → **number** → payday confirm (inline under the number) → log box → one "Right now" card that absorbs the away list, backup reminder and storage note as items, one at a time |
| Today ([filled-13](screens/light/filled-13-today.png), [empty-08](screens/light/empty-08-today.png)) | Hero card looks identical to the other cards; 40 px dead gap between the log input and the chips (reserved preview line); disabled Save looks like a pale "enabled" button | Hero: no card frame, larger number (56–64 px), label above, period line below. Collapse the preview line when empty. Disabled buttons: `--surface-2` fill + `--text-muted` text |
| Explain sheet ([filled-14](screens/light/filled-14-today-explain.png)) | "Spent today (counted separately below) + $51.35" then "− $51.35" reads as a contradiction; the close button gets a blue focus ring on open (shows on touch) | Drop the "+ spent today" line and explain in a footnote; only show the focus ring for keyboard focus (focus-visible), or focus the sheet title instead |
| Did-you-mean ([filled-11](screens/light/filled-11-today-did-you-mean.png)) | Works; the box is the same tint as the storage note | Fine. Use the amber "check this" tint so it differs from information notes |
| Toast ([filled-05](screens/light/filled-05-today-toast-undo.png), [filled-12](screens/light/filled-12-more-share-made.png)) | The toast with Undo is full-width; the one without is centred and narrow | One toast width (full gutter-to-gutter) |

### Log and import
| Screen | Issue | Fix |
|---|---|---|
| Log empty ([empty-11](screens/light/empty-11-log.png)) | Empty card has no button; two header buttons crowd the title | Empty card with buttons "Log a spend" (to Today) and "Import a statement". Header: one "+" icon button; move "Import statement" into the empty state and the list footer |
| Log filled ([filled-16](screens/light/filled-16-log.png)) | One card per day makes a long stack of cards; raw bank text ("Zelle payment to JOHN LANDLORD JPM99abc123"); "•" in place of an icon; "Imported" tags on every row | One continuous list with sticky day headers. Tidy imported descriptions (title case, strip store numbers and reference codes; keep the original in the edit sheet). A neutral icon. Show the source tag only in the edit sheet |
| Edit sheet ([filled-18](screens/light/filled-18-log-edit-sheet.png)) | "Delete" is a green underlined link; title "Edit" | Coral "Delete this spend" text button at the bottom; title "Edit spend" |
| Import pick ([empty-13](screens/light/empty-13-import-pick.png)) | Centred text; the help link has no underline (different link style) | Left-align; standard inline link style |
| Import bad file ([empty-14](screens/light/empty-14-import-bad-file.png)) | "We read 1 rows", "1 rows will be left out"; mapping form shown for a non-statement | Plurals; dedicated error state (Part 2A) |
| Import map ([filled-06](screens/light/filled-06-import-map.png)) | "Change how columns are read" is a closed card with no chevron, so it looks empty | Add a chevron and "Optional" hint |
| Sort ([filled-08](screens/light/filled-08-import-sort.png)) | 14 emoji tiles; "Skip this one" / "Finish later" in grey text | Category icon tiles; quiet-action link style |
| Done ([filled-10](screens/light/filled-10-import-done.png)) | Only "Imported 10" | "Imported 10 · 2 already there · 1 sorted by you", then the new balance |

### Bills
| Screen | Issue | Fix |
|---|---|---|
| Bills empty ([empty-15](screens/light/empty-15-bills.png)) | Empty card has no button | Primary "Add your first bill" inside the card |
| Bills list ([filled-19](screens/light/filled-19-bills.png)) | 5 identical "Mark paid" buttons; amount stacked above the button | Show "Mark paid" only for bills due within 7 days or overdue; others show the amount on the name line |
| Calendar ([filled-20](screens/light/filled-20-bills-calendar.png)) | Payday dot and today's highlight are the same green; "💰" in the day list; ‹ › text arrows | Payday dot in a distinct "income" colour (see tokens); SVG icons |
| Bill sheet ([empty-17](screens/light/empty-17-bill-add-sheet.png)) | Fine. Native date input shows ISO in this test browser (iOS shows its own picker; the helper line covers it) | Check on a real iPhone (device checklist) |

### Plan
| Screen | Issue | Fix |
|---|---|---|
| Plan tabs (all) | 4 segments at 390 px: "Envelopes" fills its pill edge to edge | Smaller label (15 px) and 4 px inner padding, or icons above labels |
| Envelopes empty ([empty-18](screens/light/empty-18-plan-envelopes.png)) | "New envelope" button touches the card below; 16 emoji chips | `.stack` gap; icon chips; limit to the 6 most common with "Show all" |
| Envelopes filled ([filled-22](screens/light/filled-22-plan-envelopes.png)) | Same touching-button bug; the month summary is plain grey text | Gap fix; turn the summary into a small header row: "$208 of $710 spent · Oct" |
| Goals ([empty-19](screens/light/empty-19-plan-goals.png), [filled-23](screens/light/filled-23-plan-goals.png)) | Goal bar is dark accent while envelope bars are light green (two progress styles); goal money is whole ("$350 of $1,200") while envelopes show cents; emoji picked from a free-text field (envelopes use a grid) | One progress component; one money format rule (see tokens); the same icon picker everywhere |
| Debt ([filled-24](screens/light/filled-24-plan-debt.png)) | "Add a debt" touches the plan card; slider thumb is a thin white circle; "How this is estimated" uses a different link style | Gap fix; styled slider (accent track fill, 28 px thumb); standard disclosure style with a chevron |
| Insights empty ([empty-21](screens/light/empty-21-plan-insights.png)) | 3 cards that each say "nothing yet" | One empty state: "Insights appear after your first week of logging." |
| Insights filled ([filled-25](screens/light/filled-25-plan-insights.png)) | "was $0" repeated on every row in the first month; raw bank wording shown as the merchant name ("Zelle payment to JOHN LANDLORD JPM99abc123"); bill payments listed as merchants | Hide "was" when last month has no data; show the tidied name; leave bill payments out of "Where it all went" (they already have the Bills tab) |

### More
| Screen | Issue | Fix |
|---|---|---|
| More menu ([empty-25](screens/light/empty-25-more-menu.png)) | 11 rows with no icons and no grouping | 3 groups with headers: **Your money** (Accounts, Paychecks, Categories, Quick-log chips, Rules) · **Keep it safe** (Backup & restore, Share with partner) · **App** (Settings, Help, About & privacy). Small icon per row |
| Accounts ([filled-30](screens/light/filled-30-more-accounts.png)) | "Quick log" badge is jargon; no hidden-accounts list | Badge "Default"; "Hidden" section like Categories |
| Categories ([empty-28](screens/light/empty-28-more-categories.png)) | 14 rows all saying "No monthly amount" | Leave the second line blank when there's no amount |
| Rules ([empty-29](screens/light/empty-29-more-rules.png)) | "Add a rule" touches "Starter rules (20)"; the closed disclosure looks like an empty card | Gap fix; chevron + "Tap to see them" |
| Notes ([empty-30](screens/light/empty-30-more-notes.png)) | Extra padding under the textarea | Standard card padding |
| Backup ([empty-31](screens/light/empty-31-more-backup.png)) | Two paragraphs of warning above the action; a card titled "More" on the More page; "Back up now" used as both heading and button | Lead with a status line ("No backup yet") + primary button; move the explanation into a short note under it; rename "More" to "Reminders and export" |
| Share ([empty-32](screens/light/empty-32-more-share.png)) | Card title repeats the page title; hint text touches the button; "…or paste a share code" label sits tight under a button; stale "WIAI1" placeholder | Card title "Make a share file"; standard field spacing; new placeholder |
| Chips ([empty-33](screens/light/empty-33-more-chips.png)) | "Coffee / Coffee" (label repeats the category) | Hide the category when it matches the label |
| Settings ([empty-34](screens/light/empty-34-more-settings.png)) | "Match device" wraps to 2 lines in its segment; no grouping | "Auto" / "Light" / "Dark" labels (keep Soft/Midnight names as sub-text if wanted); group into Display, Money, Safe to spend |
| About ([empty-37](screens/light/empty-37-more-about.png)) | One card of dense text; "No backup yet." stuck to the end of a paragraph | Short sections with headings; backup status as its own line with a link |
| Onboarding restore ([empty-02](screens/light/empty-02-onboarding-restore.png)) | The page intro and the card text say the same thing | Drop the card heading and intro duplication |

### Partner tab and demo
| Screen | Issue | Fix |
|---|---|---|
| Partner ([filled-27](screens/light/filled-27-partner.png)) | Best hierarchy in the app: clear hero, then sections. Minor: "Remove partner view" is a plain secondary button | Keep as the model for Today. Coral text for "Remove" |
| Demo ([demo-01](screens/light/demo-01-today.png)) | Demo banner + example banner + title stack before the number | Merge into one banner in demo mode |

### Dark mode (Midnight)
All 80 dark screenshots pass the contrast check. Specific notes:
- Primary buttons (mint with dark text) look good. Disabled buttons look like muted enabled ones, as in light mode.
- The storage note's dark green fill is fine, but the hero card, notes and lists all share one surface colour, so the hierarchy problem is the same as in light mode.
- The progress-bar green (`--green-fill`) is darker than the accent; envelope bars look dull next to mint buttons. Use the token set below.

---

# Proposed design tokens (one set for the whole app)

Designed to drop in when the new logo and brand colours arrive. Only the **brand** block below changes per brand; everything else stays.

### Spacing (4 px base)
| Token | Value | Use |
|---|---|---|
| `--space-1` | 4 px | icon–text gap, tight inline |
| `--space-2` | 8 px | between label and field, chip gap |
| `--space-3` | 12 px | between fields in a form, list row padding (vertical) |
| `--space-4` | 16 px | card padding, page gutter, gap between cards |
| `--space-5` | 24 px | between sections on a screen |
| `--space-6` | 32 px | above a screen title, hero padding |
| `--space-7` | 48 px | empty-state and hero breathing room |

Rule: every vertical stack uses `gap`, never margins on children. That fixes the touching-buttons bug for good.

### Type scale (system font; 17 px base for iOS-native feel)
| Token | Size / line-height / weight | Use |
|---|---|---|
| `--text-hero` | clamp(48px, 15vw, 64px) / 1.0 / 750, tabular | the Today number only |
| `--text-title` | 28 / 1.15 / 700 | screen titles |
| `--text-heading` | 20 / 1.25 / 650 | card and section titles |
| `--text-body` | 17 / 1.45 / 400 | body, list primary line |
| `--text-small` | 15 / 1.4 / 400 | list second line, hints, captions |
| `--text-label` | 14 / 1.3 / 600 | field labels, badges, section headers (uppercase off) |

Three weights only: 400, 600, 700 (750 for the hero). Money: always `tabular-nums` in the body font. Money format rule: **whole amounts for the hero and for targets the user typed as whole numbers; cents everywhere else**, including goals.

### Radius
| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 8 px | badges, small chips, inputs' inner elements |
| `--radius-md` | 12 px | inputs, buttons, segmented control |
| `--radius-lg` | 18 px | cards, sheets (top corners) |
| `--radius-full` | 999 px | pills, toggles, avatars, dots |

(Replaces 12 values with 4.)

### Shadows
| Token | Value | Use |
|---|---|---|
| `--shadow-0` | none | cards on the page (separate them with `--border` and `--surface` contrast) |
| `--shadow-1` | 0 1px 2px rgb(0 0 0 / 6%) | raised controls (selected segment) |
| `--shadow-2` | 0 8px 24px rgb(0 0 0 / 12%) | sheets and toasts only |

Flat cards with a 1 px border look calmer than the current shadow on every card, and leave the shadow to mean "this floats".

### Colour (semantic roles; light / dark)
| Role | Light (Soft) | Dark (Midnight) | Notes |
|---|---|---|---|
| `--bg` | #F6F4EF | #11151D | unchanged |
| `--surface` | #FFFFFF | #1A202B | cards |
| `--surface-2` | #EFECE5 | #232A37 | tracks, disabled fills, quiet cards |
| `--border` | #DCD8CE | #2F3746 | |
| `--text` | #1F2430 | #E9EBF1 | |
| `--text-muted` | #5A6070 | #A6ADBD | ≥ 5.9:1 |
| **brand** `--accent` | #2F6F62 | #7CC7B5 | ← swap for the new brand colour |
| **brand** `--accent-text` | #FFFFFF | #0D1A17 | text on accent |
| **brand** `--accent-soft` | #DCECE7 | #1F3A34 | selected tints, notes |
| `--income` | #2F7D4F | #86D1A3 | money in, payday dots (distinct from accent) |
| `--progress-ok` | = `--accent` | = `--accent` | one progress style everywhere |
| `--progress-warn` | #E8B54A | #C99536 | amber, ≥ 80% used |
| `--progress-over` | #E48A72 | #C46A54 | coral, over the limit |
| `--warn-text` | #8A5A00 | #F0C36A | "check this" text (did you mean, future dates) |
| `--danger-text` | #A8432B | #F2A28D | delete actions only, never errors about money |
| `--focus` | #1D5FD1 | #8AB4FF | keyboard focus only (`:focus-visible`) |

Category colours: 8 muted tints derived from the brand hue (used as the icon circle background), replacing the unused `#c4c4c4` default.

### Components (built only from the tokens)
- **Button**: height 48 px (small: 44 px), `--radius-md`, label `--text-body` 600. Exactly three variants: primary (accent), secondary (surface + border), quiet (text only, muted). Disabled: `--surface-2` with `--text-muted`.
- **Link**: inline = accent + underline; quiet action = `--text-muted`, no underline. Nothing else.
- **Card**: `--surface`, 1 px `--border`, `--radius-lg`, padding `--space-4`, `--shadow-0`. The Today hero is **not** a card.
- **List row**: min-height 56 px, padding `--space-3` `--space-4`, primary `--text-body`, secondary `--text-small` muted, trailing amount top-aligned with the primary line.
- **Icon**: 24 px stroke 1.75 SVG; category icons are 20 px glyphs in a 36 px tinted circle.
- **Sheet**: `--radius-lg` top corners, `--shadow-2`, close button 44 px with no border.

---

## Screenshot index

`docs/screens/light/` and `docs/screens/dark/` each contain:
- `empty-01 … empty-37`: onboarding (welcome, restore, steps 1–4, error), Today, explain, focus, Log, add sheet, import pick, bad file, Bills, calendar, bill sheet, Plan × 4, goal, debt and envelope sheets, More menu and all 11 More pages, a Help article.
- `filled-01 … filled-41`: onboarding with data, first day, return day (away + payday), undo toast, the import flow (map, review, sort, balance check, done), did-you-mean, share made, Today, explain, focus, Log, search with no results, edit sheet, Bills, calendar, bill edit, Plan × 4, move money, Partner tab, Today with a cushion, More menu and all More pages.
- `demo-01, demo-02`: demo Today and backup turned off.
- `*-report.json`: the layout-check results per screenshot (all clean).
