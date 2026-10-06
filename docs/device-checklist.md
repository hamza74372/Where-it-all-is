# Real-device checklist

Automated tests run in desktop Chromium and WebKit with phone-sized windows. They can't press real
share sheets, install to a home screen, or survive a phone going into airplane mode. Do these by hand
before each release, on real devices.

**Devices (minimum):** one iPhone on current iOS (Safari), one older/smaller iPhone (SE-size, ≤ 375 px
wide), one Android phone (Chrome), one Windows PC (Chrome or Edge), one Mac (Safari).

**Setup:** `npm run package`, then deploy `site/` to Cloudflare Pages. Open the private app link
(`siteUrl/appPath/` from `site.config.json`) and `/demo/`. Mark each box ✅ / ❌ and write the device + OS next to any ❌.

---

## 1. Opening the app

- [ ] iPhone Safari: the app link opens and shows the welcome screen within ~2 s on mobile data.
- [ ] Android Chrome: same.
- [ ] Windows: double-click `Where-It-All-Is-Budget-App.html` → opens in the default browser from `file://`, welcome screen shows, no blank page.
- [ ] Mac: double-click the .html file → opens in Safari from `file://`; set up a budget; close and reopen the file → data is still there.
- [ ] Windows/Mac: open the .html file **with Wi-Fi off** → works the same.
- [ ] iPhone: open the .html file from the Files app → note what happens (iOS often shows a preview, not a real browser). If it doesn't work, the Start-Here PDF steering phones to the link is correct.
- [ ] Etsy app on iPhone/Android: confirm you can't download the files there (matches the PDF warning), and that Etsy in Safari/Chrome → Purchases → Download works.
- [ ] The private app path doesn't show up in search: search the site name on Google after a few days; only `/` and `/demo/` should appear.

## 2. Add to Home Screen / install

- [ ] **iPhone Safari:** Share → Add to Home Screen → Add. The icon shows the app logo (not a page screenshot) and the label reads "Where It All Is" (or the configured short name).
- [ ] iPhone: opening from the icon gives a full-screen app with no Safari address bar; the status bar is readable in light and dark mode.
- [ ] iPhone: the bottom tab bar sits clear of the home indicator (safe area), and nothing is hidden under the notch or Dynamic Island.
- [ ] **Android Chrome:** ⋮ → Install app (or the install prompt) → the icon looks right on the launcher; the maskable icon isn't cropped badly in circle/squircle shapes.
- [ ] Android: opens standalone; the splash colour matches the background colour.
- [ ] **Windows Chrome/Edge:** the install icon shows in the address bar → install → the app opens in its own window with the right icon in the taskbar.
- [ ] **Mac Safari:** File → Add to Dock → opens as its own app.
- [ ] Demo: installing `/demo/` gives a separate icon ("Budget demo") and doesn't replace the full app.

## 3. Offline use

- [ ] iPhone (home-screen icon): open once online, close fully, turn on airplane mode, open from the icon → the app loads with your data.
- [ ] iPhone (Safari tab, not installed): same test in a normal tab.
- [ ] Android (installed): airplane mode → opens with data.
- [ ] Desktop installed app: Wi-Fi off → opens.
- [ ] Offline: log a spend, mark a bill paid, change a setting → all saved after reconnecting and reopening.
- [ ] Update path: deploy a new build (change a word), open the app online, close it, reopen → the new version shows (it may take one extra open). No blank screen while updating.
- [ ] Settings → About shows the version number you expect after the update.

## 4. Storage and the Safari 7-day rule

- [ ] iPhone Safari tab (not installed): the one-time "Safari may delete data after 7 days" note shows once and doesn't come back after dismissing.
- [ ] Installed to the home screen: that note doesn't show, or reads correctly for an installed app.
- [ ] Android/desktop Chrome: check `navigator.storage.persisted()` in remote DevTools → `true` after setup (or note if the browser refused).
- [ ] Private/Incognito window: the app works and warns if storage isn't available, or at least doesn't crash.
- [ ] Data survives: restart the phone, open the app → data still there.

## 5. Backups and the iOS share sheet

- [ ] **iPhone:** More → Backup & restore → Back up now → the iOS share sheet opens.
  - [ ] **Save to Files** → the file appears in Files with a sensible name (`where-it-all-is-backup-YYYY-MM-DD.json`, or `…-locked.json` with a passphrase).
  - [ ] **AirDrop** to a Mac → the file arrives intact.
  - [ ] **Mail / Messages** attachment → the file is attached (not pasted as text).
  - [ ] Cancelling the share sheet → no error and no "backup saved" message.
- [ ] Locked backup (passphrase ≥ 8 characters): save, then restore on the same phone → asks for the passphrase; a wrong one says "wrong passphrase", the right one shows the preview.
- [ ] **Restore on a different device:** back up on iPhone → AirDrop/email → restore on Android or desktop → preview counts match → Replace → safe-to-spend matches the iPhone.
- [ ] Merge across two devices: log a different spend on each, back up one, Merge into the other → both spends present, nothing doubled; Undo restores the earlier state.
- [ ] Different currency: restore a £ backup on a $ device → you're warned, with "Switch to £" / "Cancel".
- [ ] Android Chrome: Back up now → the file downloads (or the share sheet appears on touch) and shows in Downloads.
- [ ] Desktop: the backup downloads to Downloads.
- [ ] Choose backup file: the iPhone picker can reach Files / iCloud Drive; the Android picker can reach Downloads / Drive.
- [ ] Backup reminder: set it to "Every day", change the device date forward a day (or wait) → the reminder shows on Today.
- [ ] CSV export: opens in Numbers (iPhone), Google Sheets (Android) and Excel (Windows) with correct amounts and dates; no garbled £/€ symbols.

## 6. Partner share

- [ ] iPhone: More → Share with partner → passphrase (≥ 8 chars) → the share sheet opens with a `.wiai` file; the hint "Tell your partner the passphrase separately…" is visible.
- [ ] Send by Messages/WhatsApp → open on a second phone → Partner tab → open file → passphrase → read-only view, "As of …" shown.
- [ ] Next day (or change the device date): the view says "Safe to spend on [date]" and the "more than 3 days old" note shows after 3 days.
- [ ] QR code: shown for a normal household; scan it with the second phone's camera *inside the app's paste/scan option* (or copy the code text) → it opens. Check the QR is readable at normal screen brightness.
- [ ] Paste the share code text → opens.
- [ ] Remove partner view → the Partner tab disappears; the owner's own data is untouched.

## 7. Importing a real bank CSV

- [ ] For each bank you or testers use: download a real CSV from the bank's website (desktop) and from the bank's app (phone) where possible.
  - [ ] Columns detected correctly (date, description, amount / in-out).
  - [ ] Date format right (check a date after the 12th, e.g. 13/10 vs 10/13).
  - [ ] Amounts in the right direction (spends negative, income positive).
  - [ ] Re-importing the same file → "Already imported before — skipped".
  - [ ] The balance check matches the bank's shown balance.
- [ ] iPhone: pick a CSV from Files / iCloud Drive / a Mail attachment saved to Files.
- [ ] Android: pick from Downloads and Google Drive.
- [ ] Non-ASCII descriptions (é, ü, £, emoji) show correctly.
- [ ] **Big history on a real iPhone:** restore a backup with ~5,000 transactions (or import a year of statements). Note how long the restore takes, then check Today and the Log each open in under a second. (Automated tests confirm this in desktop WebKit, but Playwright's Windows WebKit writes the database far slower than real Safari, so write speed can only be judged on a device.)

## 8. Demo

- [ ] `/demo/` opens with example numbers, the "Demo — data resets" banner, and a "Get the full version" link that goes to the Etsy listing (update `etsyUrl` in config first!).
- [ ] Logging up to 30 entries works; the 31st shows the friendly limit message.
- [ ] Backup / share screens say they're turned off in the demo.
- [ ] Close the tab, open `/demo/` again → back to the example numbers.
- [ ] Using the demo doesn't change the full app's data on the same phone (open both).
- [ ] iPhone: does the demo reset when installed to the home screen and swiped away? (Expected: yes, each launch is a new session.) Note the behaviour.

## 9. Look and feel on real screens

- [ ] Small iPhone (SE / 320–375 px): every screen fits with no sideways scrolling; the calendar fits; the 6-tab bar (with Partner) is readable.
- [ ] Large phone and tablet: the layout is centred and not stretched.
- [ ] Dark mode (system setting) on iPhone and Android: all text readable, no white flashes on open.
- [ ] iOS text size set to Larger (Settings → Display → Text Size) and Android font size Largest: nothing clipped or overlapping on Today, Log, Bills, Plan, More.
- [ ] Number keypad: amount fields bring up the decimal keypad on iPhone and Android.
- [ ] Tapping into a field doesn't zoom the page on iPhone (inputs ≥ 16 px).
- [ ] Date pickers and dropdowns open the native wheels/sheets on iPhone and look right.
- [ ] The on-screen keyboard doesn't hide the field being typed in or the Save button.
- [ ] VoiceOver (iPhone) and TalkBack (Android): the safe-to-spend number is read with its label; the tabs, Log box and buttons have sensible names.
- [ ] Rotate to landscape: still usable (or locked to portrait when installed).
- [ ] Reduce Motion on: no distracting animation.

## 10. Help, Start-Here PDF, listing

- [ ] More → Help: all 8 articles open; the Home Screen steps match what you actually saw on each device in section 2 (update wording if iOS/Android menus changed).
- [ ] Start-Here PDF: open on a phone and a computer; the app link in the PDF is correct and tappable/copyable; print Start-Here-Letter.pdf on Letter paper and Start-Here-A4.pdf on A4 to check margins; scan the QR code on page 1 with an iPhone and an Android camera → it opens the app link; tap both links in the PDF on a phone.
- [ ] Optional: take real Add-to-Home-Screen screenshots on iPhone and Android, set `startHere.iphoneAddToHomeScreenImage` / `androidInstallImage` in `site.config.json`, rebuild the PDF, and check it's still 2 pages.
- [ ] Replace the placeholder icons in `branding/` with the real logo, rebuild, and check the icons on the iPhone home screen, Android launcher and desktop.
- [ ] Footer disclaimer visible in the app and on the landing page.
