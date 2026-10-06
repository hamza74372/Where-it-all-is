# SPEC — ADHD-Friendly Budget App ("Where It All Is" shop)

Version 1.0 · 6 Oct 2026 · Owner: Hamza
Hand this file to Claude Code. Build phase by phase. Do not start a phase until the previous one passes its checks.

---

## 1. Product in one paragraph

A calm, app-like budget planner for people with ADHD (and anyone overwhelmed by budgeting). It runs as an **offline web app** (single HTML file + optional hosted version), installs to a phone home screen, needs **no account, no subscription, no bank login**, and keeps all data on the user's device. The home screen answers one question: **"How much is safe to spend today?"** Its edge over competitors: **bank CSV import with auto-categorising rules** (less typing) and **household sharing** (partner can see bills and safe-to-spend) — without any server.

Sold on Etsy as a digital download (PDF with links + backup HTML file). Free demo hosted on GitHub Pages.

## 2. Users and jobs

- **Primary:** adults with ADHD (self-identified), 20–45, US/UK/CA/AU, paid weekly/bi-weekly/monthly, often irregular income, have tried spreadsheets and quit.
- **Jobs to be done:**
  1. "Tell me what I can spend today without doing maths."
  2. "Remind me what bills are coming before payday."
  3. "Let me log spending in 3 seconds — or not at all (import)."
  4. "Show me a debt-free date so I feel progress."
  5. "Let my partner see the same picture."
  6. "Don't shame me when I miss days or overspend."

## 3. Design principles (must hold on every screen)

1. **One primary number, one primary action per screen.**
2. **Max 3 taps** to log a spend from home.
3. **No shame:** no red "FAILED", no streaks that break. Overspend message: neutral ("You're 12 over in Groceries — want to move money from Fun?").
4. **Show the maths on demand:** tapping any number opens "How is this worked out?".
5. **Gentle return:** after a gap, a "While you were away" catch-up card (bills that passed, paydays that passed — confirm in one tap).
6. **Undo everywhere** (toast with Undo for 8s).
7. **Calm visuals:** two themes (light "Soft" / dark "Midnight"), large type, WCAG AA contrast, reduced-motion respected.
8. **Plain language:** no finance jargon without a one-line explanation.
9. **Wording:** "ADHD-friendly design". Never claim to treat, help, or diagnose ADHD. Never give financial advice.

## 4. Tech constraints

- **Stack:** Vite + Preact or vanilla TS (keep bundle small), built to **one self-contained `index.html`** (inline JS/CSS, inline SVG icons, no external requests, no CDN fonts — use system font stack).
- **Storage:** IndexedDB (via a tiny wrapper) with schema versioning + migrations. localStorage only for UI prefs.
- **PWA:** manifest + service worker for the hosted version (add to home screen, offline). The downloaded single file must also work offline when opened directly (`file://`) on desktop.
- **No network calls** in the product build. (Demo build may load nothing external either.)
- **Privacy:** zero analytics, zero trackers. State this in-app.
- **Size target:** < 1 MB. Loads < 1 s on a mid-range phone.
- **Browsers:** latest Chrome, Safari (iOS + macOS), Edge, Firefox. Test Android Chrome + iPhone Safari home-screen mode.
- **Currencies:** USD, GBP, EUR, CAD, AUD at launch (symbol + formatting via `Intl.NumberFormat`). Locale date formats.
- **Build variants:** `npm run build` → `dist/app.html` (full); `npm run build:demo` → `dist/demo.html` (same app, `DEMO=true`: 30-entry limit, banner "Demo — data resets", seeded example data, no export).

## 5. Data model (IndexedDB stores)

```
settings: { id:'main', name, currency, locale, theme, weekStart, createdAt, schemaVersion, lastOpenedAt, backupRemindDays }
accounts: { id, name, type:'checking'|'savings'|'cash'|'credit', openingBalance, includeInSafeToSpend:boolean, archived }
incomes:  { id, name, amount, accountId, schedule:Schedule, variable:boolean, active }
bills:    { id, name, amount, accountId, categoryId, schedule:Schedule, autopay:boolean, isDebtMinimum:boolean, debtId?, active }
categories:{ id, name, emoji, monthlyLimit?, color, order, archived }   // envelopes
transactions: { id, date, amount (signed), accountId, categoryId?, note, source:'manual'|'import'|'bill'|'income', importBatchId?, billId?, incomeId?, cleared:boolean }
debts:    { id, name, balance, apr, minPayment, accountId?, createdAt }
goals:    { id, name, target, saved, targetDate?, emoji }
rules:    { id, matchType:'contains'|'startsWith'|'regex', pattern, categoryId, renameTo?, priority }
importBatches: { id, fileName, importedAt, rowCount, accountId, mappingId }
csvMappings: { id, name, dateCol, amountCol | debitCol+creditCol, descCol, dateFormat, signConvention, headerRow }
notes:    { id, month:'YYYY-MM', text }          // brain dump / monthly notes
events:   { id, ts, type, payload }              // for undo + "while you were away"

Schedule = { kind:'once'|'weekly'|'biweekly'|'semimonthly'|'monthly'|'everyNMonths'|'yearly', anchorDate, dayOfMonth?, secondDayOfMonth?, n?, weekendShift:'none'|'before'|'after' }
```

All money stored as **integer minor units** (cents/pence). Never floats.

## 6. Core calculation — Safe to Spend (must be exact and explainable)

For the period **today → next payday** (earliest next income date across active incomes; if none, end of month):

```
available      = sum(balances of accounts where includeInSafeToSpend)
upcomingBills  = sum(bills due between tomorrow and next payday, not yet paid)
goalSetAside   = sum(planned goal contributions due before next payday)  // optional, user toggle
buffer         = user setting (default 0)
safeToSpendPeriod = available − upcomingBills − goalSetAside − buffer
daysLeft       = days from today to day before next payday (min 1)
safeToSpendToday = floor(safeToSpendPeriod / daysLeft) − spentToday(discretionary)
```

- Show **today's number** big; show period number small.
- If negative: show "Tight until payday" state with the shortfall and one suggested action (no red alarm).
- "How is this worked out?" sheet lists every line above with the actual figures.
- Unit-test this with ≥ 20 cases (weekends, multiple paychecks, credit card accounts excluded, bill due today, payday today, leap years, month-end 31st → 30th).

**Credit cards:** spending on a credit account doesn't reduce `available` immediately but adds to a "card to pay" figure; the card payment bill reduces it — avoid double counting (test explicitly).

## 7. Screens (bottom nav: Today · Log · Bills · Plan · More)

### 7.1 Onboarding (≤ 4 steps, skippable, "Try with example numbers" button)
1. Name + currency.
2. Main account balance.
3. Paychecks (amount + schedule; "my pay varies" toggle → use average).
4. Top bills (quick-add list of common ones: rent, phone, electric, internet, car, subscriptions; each 2 fields).
→ Lands on Today. Example-data mode clearly labelled; "Clear examples" one tap.

### 7.2 Today
- Big **Safe to spend today**, sub-line "until payday Fri 10 Oct: 214".
- Quick log box: type `25 groceries` or `12.50 coffee` → parses amount + fuzzy-matches category; Enter to save. Plus 4–6 one-tap preset chips (user-editable).
- "Next 3 bills" card with due dates.
- "Right now — one thing" card (single suggested action: confirm a bill paid / log yesterday / import statement / back up).
- "While you were away" card when lastOpenedAt > 2 days.
- Focus mode toggle (hides everything except the number + log box).

### 7.3 Log (transactions)
- List grouped by day; filter by account/category/month; search.
- Swipe/tap to edit category, mark cleared, delete (undo).
- **Import statement** button → Import flow (7.8).

### 7.4 Bills
- List + month calendar (paydays and bills on the calendar, colour-coded).
- Each bill: next due, schedule text ("every 2nd Friday"), mark paid (creates transaction), autopay flag.
- "Big yearly bills" helper: shows monthly set-aside amount.

### 7.5 Plan (envelopes + goals + debt, tabs)
- **Envelopes:** category limits, progress bars with soft green → amber → coral; overspend → suggestion to move money; "move money" action.
- **Goals:** progress, target date, required per-paycheck amount.
- **Debt:** list, total, **snowball vs avalanche comparison** (months to debt-free, total interest), extra payment slider, debt-free date. Show assumptions; label "estimate".

### 7.6 More
- Accounts, Categories, Rules, Notes (brain dump per month), Household sharing, Backup & Restore, Settings (theme, currency, buffer, week start), Help (in-app guide), About & privacy, Disclaimer.

### 7.7 Insights (inside More or Plan)
- This month vs last month by category (simple bar list, no complex charts).
- "Where it all went" top 5 merchants.
- Milestones (first month in the black, debt paid, goal reached) — celebratory but no streaks.

### 7.8 Bank CSV import (DIFFERENTIATOR #1)
1. Pick file (or drag-drop). Parse locally (Papaparse-like code inlined, or own parser).
2. **Auto-detect** columns (date, description, amount OR debit/credit), date format, sign convention, header row. Show preview of first 10 rows with detected mapping; user can fix with dropdowns. Save mapping by name ("Chase checking").
3. Choose target account.
4. **Duplicate detection:** same date + amount + normalised description within account, and against previous batches → skip by default, show count.
5. **Rules engine:** apply rules in priority order to set category/rename; uncategorised rows shown in a fast "sort these" screen (one row at a time, big category buttons, "always do this" checkbox creates a rule).
6. Summary: imported N, skipped M duplicates, K need sorting. Undo whole batch.
- Ship **preset mappings** for common export formats (generic, plus test with sample CSVs styled like major US/UK banks — do not claim official bank support).
- Ship **20 starter rules** (e.g. contains "UBER" → Transport, "TESCO|WALMART|ALDI" → Groceries, "NETFLIX|SPOTIFY" → Subscriptions).

### 7.9 Household sharing (DIFFERENTIATOR #2, no server)
- **Share snapshot:** export an encrypted `.wiai` file (AES-GCM via WebCrypto, passphrase) containing bills, upcoming paydays, safe-to-spend, envelopes (option: include/exclude transactions). Partner opens their copy of the app → Import shared snapshot → read-only "Partner view" tab.
- **Full device move/sync:** same mechanism with all data, "Replace my data" vs "Merge" (merge by id + updatedAt; last-write-wins per record).
- QR option: if payload is small (< ~2 KB, e.g. summary view), show QR to scan; else file.
- Clear copy: "No account, no cloud. You send the file however you like (AirDrop, WhatsApp, email)."

### 7.10 Backup & restore (data-loss protection)
- One-tap **Export backup** (JSON, optionally encrypted).
- Reminder banner every N days (default 7) if no backup.
- On iOS, explain that clearing Safari data deletes app data; recommend weekly backup.
- Restore with preview ("This backup has 214 transactions from 1 Sep to 5 Oct").
- CSV export of transactions.

## 8. Content & copy

- Tone: warm, short, second person, no exclamation-mark overload.
- Empty states always give one next action.
- In-app Help: 8 short articles (Setup in 4 steps, Safe-to-spend explained, Logging fast, Importing your bank CSV, Bills & paydays, Debt payoff, Sharing with a partner, Backups).
- Footer disclaimer: "A budgeting and organising tool. Not financial advice. ADHD-friendly design; not a medical product."

## 9. Deliverables to customers (Etsy files)

1. `Start-Here.pdf` — 2 pages: open link / add to home screen (iPhone, Android, Windows, Mac) with screenshots; where data lives; backups; support contact via Etsy messages.
2. `WhereItAllIs-Budget-App.html` — offline single file.
3. Hosted link (GitHub Pages, unlisted path) for phone install.
4. Note in listing + PDF: "Etsy's mobile app can't download digital files — use a browser."

Licensing: personal/household use; no resale (in PDF + About screen).

## 10. Testing & acceptance

- Unit tests: schedule engine (all kinds, weekend shift, 29–31 day months), safe-to-spend (≥ 20 cases), debt payoff maths (verify against a spreadsheet), CSV parser (10 sample files incl. debit/credit columns, DD/MM vs MM/DD, quoted commas, negative in parentheses), duplicate detection, merge logic, encryption round-trip.
- E2E (Playwright, Chromium + WebKit): onboarding → log spend → import CSV → mark bill paid → backup → restore.
- Manual device checklist: iPhone Safari home screen, Android Chrome home screen, Windows Chrome file:// open, Mac Safari.
- Accessibility: keyboard navigation, screen-reader labels on all buttons, AA contrast both themes.
- Performance: 5,000 transactions still smooth (< 100 ms list render with virtualisation).

**Definition of done (v1):** all above pass; demo build works on GitHub Pages; no console errors; no network requests in either build (verify in devtools).

## 11. Build phases (do in order)

| Phase | Scope | Check before moving on |
|---|---|---|
| 0 | Repo, Vite single-file build, themes, nav shell, IndexedDB wrapper + migrations, money utils | Builds to one HTML < 300 KB; opens via file:// |
| 1 | Schedule engine + Safe-to-spend + tests | All calc tests pass |
| 2 | Onboarding, Today, quick log, accounts, incomes, bills, calendar | Real setup in < 2 min on phone |
| 3 | Envelopes, goals, debt payoff, insights, notes, focus mode, while-you-were-away, undo | Debt maths matches spreadsheet |
| 4 | CSV import + mapping + rules + duplicate detection + sort screen | 10 sample CSVs import correctly |
| 5 | Backup/restore, encrypted share, partner view, merge | Round-trip on two browsers |
| 6 | PWA hosted build, demo build, help articles, disclaimer, Start-Here PDF | Device checklist passes |
| 7 | Polish: accessibility, performance, copy review, screenshots for listing | DoD met |

## 12. Explicitly out of scope (v1)

Live bank connections · accounts/login · cloud server · AI features · multiple languages · push notifications · native app stores · investment tracking (later product) · simple/full mode (dropped from v1 on 7 Oct 2026: it adds settings without adding much value).

## 13. Later product family (same buyer)

Debt payoff app (standalone, lower price) · Bill & subscription tracker · Paycheck planner · Couples budget edition · Sinking funds / irregular expenses · Investment & net worth tracker · Bundle.
