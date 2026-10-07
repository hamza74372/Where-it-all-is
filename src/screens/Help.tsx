// Spec §8 — eight short help articles. Plain language, second person, no finance jargon unexplained.

import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { DISCLAIMER } from '../copy';
import { Icon } from '../ui/icons';

interface Article {
  id: string;
  title: string;
  summary: string;
  body: ComponentChildren;
}

const Steps = ({ children }: { children: ComponentChildren }) => <ol class="help-steps">{children}</ol>;

export const ARTICLES: Article[] = [
  {
    id: 'setup',
    title: 'Set up in 4 steps',
    summary: 'Your balance, your pay, your main bills — and putting the app on your Home Screen.',
    body: (
      <>
        <p>Setup takes about two minutes. Rough numbers are fine — you can change anything later.</p>
        <Steps>
          <li>
            <strong>Name and currency.</strong> Pick how you type amounts — “12.50” or “12,50”.
          </li>
          <li>
            <strong>Your main account’s balance today.</strong> Check your banking app. The app counts everything from today onwards.
          </li>
          <li>
            <strong>Your pay.</strong> How much lands and when. If it varies, tick “My pay varies” and use an average — you’ll confirm the
            real amount each payday.
          </li>
          <li>
            <strong>Your main monthly bills.</strong> Rent, phone, subscriptions — an amount and the day of the month. Add more any time
            from Bills.
          </li>
        </Steps>
        <h3>Put it on your Home Screen</h3>
        <p>
          Open the app from the link in your Start Here guide (on a computer you can also double-click <strong>{__DOWNLOAD_NAME__}</strong>), then:
        </p>
        <ul>
          <li>
            <strong>iPhone or iPad (Safari):</strong> tap the Share button (the square with an arrow), scroll down, tap{' '}
            <em>Add to Home Screen</em>, then <em>Add</em>.
          </li>
          <li>
            <strong>Android (Chrome):</strong> tap the ⋮ menu, then <em>Install app</em> (or <em>Add to Home screen</em>).
          </li>
          <li>
            <strong>Computer (Chrome or Edge):</strong> click the install icon at the right of the address bar, or ⋮ menu →{' '}
            <em>Install</em>. On a Mac with Safari: File → <em>Add to Dock</em> (macOS 14 or later).
          </li>
        </ul>
        <p class="help-warn">
          <strong>iPhone and iPad:</strong> Safari can delete a website’s saved data if you don’t open it for 7 days. Adding the app to your
          Home Screen avoids that. Back up weekly either way.
        </p>
        <p>
          Prefer not to set up yet? Use <em>Try with example numbers</em> on the welcome screen, and <em>Clear examples</em> when you’re ready.
        </p>
      </>
    ),
  },
  {
    id: 'safe-to-spend',
    title: 'Safe to spend, explained',
    summary: 'How the big number is worked out — and what it doesn’t cover.',
    body: (
      <>
        <p>The big number on Today answers one question: how much can you spend today and still cover everything until payday?</p>
        <Steps>
          <li>Start with the money in the accounts you’ve marked “count in safe to spend”.</li>
          <li>Take off bills due before your next payday that aren’t paid yet (including any due today).</li>
          <li>Look ahead: if next pay period’s bills come to more than your next pay, the difference is kept back now.</li>
          <li>Take off any goal money you’ve chosen to set aside, and your cushion.</li>
          <li>Share what’s left across the days until payday. Today’s spending comes off today’s share.</li>
        </Steps>
        <p>
          The big number is rounded <em>down</em> to a whole amount, so it never promises more than you have. Tap it, or “How is this worked
          out?”, to see every line with real figures.
        </p>
        <h3>Good to know</h3>
        <ul>
          <li>
            <strong>Pay counts once it’s in.</strong> On payday, confirm your pay and the number updates.
          </li>
          <li>
            <strong>The look-ahead covers one pay period only.</strong> A big bill further out — a yearly renewal, say — isn’t set aside
            until it’s in the next period. Use “Big yearly bills” on the Bills screen to put a little aside each month.
          </li>
          <li>
            <strong>Credit cards:</strong> card spending is set aside when the card bill is due, unless you’ve told the app to count the card
            straight away.
          </li>
          <li>
            <strong>Tight until payday</strong> means every bill is covered, but less than a tenth of your money is spare until payday.{' '}
            <strong>Short until payday</strong> means bills come to more than you have. Both are heads-ups, not judgements — when you’re
            short, the app shows the gap and one idea to help.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'logging',
    title: 'Logging in 3 seconds',
    summary: 'Type “12.50 coffee” and press Enter. That’s it.',
    body: (
      <>
        <p>
          On Today, type an amount and a word — <strong>“12.50 coffee”</strong>, <strong>“uber 8.40”</strong> or just <strong>“7”</strong> —
          then press Enter. The app picks a category from the word. Start with <strong>+</strong> for money coming in: “+40 refund”.
        </p>
        <ul>
          <li>
            <strong>Chips</strong> under the box log a common spend in one tap. Change them in More → Quick-log chips.
          </li>
          <li>
            <strong>Undo</strong> appears after every change for 8 seconds.
          </li>
          <li>If an amount looks unusual for how you type amounts, the app asks “Did you mean…?” instead of guessing.</li>
          <li>
            <strong>Focus</strong> (top of Today) hides everything except the number and the log box.
          </li>
          <li>Missed a few days? That’s fine. Import a statement instead, or just carry on from today.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'import',
    title: 'Importing your bank CSV',
    summary: 'Let your bank’s statement do the typing.',
    body: (
      <>
        <Steps>
          <li>
            On your bank’s website, open your account and look for <em>Download</em>, <em>Export</em> or <em>Statements</em>. Choose{' '}
            <strong>CSV</strong>. (Some banks only offer this on the website, not in the app.)
          </li>
          <li>In the app: Log → Import statement → choose the file. It’s read on your device and never uploaded.</li>
          <li>Check the preview. If dates or amounts look wrong, open “Change how columns are read”.</li>
          <li>Review and import. Then sort anything without a category — one at a time, with big buttons.</li>
          <li>Optionally, check your balance against your bank and add a one-tap adjustment if needed.</li>
        </Steps>
        <h3>What the review step tells you</h3>
        <ul>
          <li>
            <strong>Already imported before — skipped:</strong> rows from an earlier import. Overlapping date ranges are fine.
          </li>
          <li>
            <strong>Matched to things you already logged:</strong> same amount within 3 days of something you typed. They’re linked, not
            added twice. Unlink any that aren’t the same thing.
          </li>
          <li>
            <strong>From before you started:</strong> your starting balance already includes them, so they’re kept for history but don’t
            change your balance.
          </li>
          <li>
            <strong>Dated in the future:</strong> usually means day and month were read the wrong way round — change the date format.
          </li>
        </ul>
        <p>
          After you sort a row, the app offers “Always put Starbucks in Coffee?”. Say yes and future imports sort themselves. See and edit
          rules in More → Rules.
        </p>
      </>
    ),
  },
  {
    id: 'bills',
    title: 'Bills & paydays',
    summary: 'Schedules, weekends, card bills and paydays.',
    body: (
      <>
        <ul>
          <li>
            <strong>Schedules:</strong> weekly, every 2 weeks, twice a month, monthly, every few months, yearly or once. Every date is shown
            in words, so “10/09” can’t be misread.
          </li>
          <li>
            <strong>Weekends:</strong> choose whether a bill or payday that lands on a weekend moves to the Friday before or the Monday after.
          </li>
          <li>
            <strong>Mark paid</strong> records the payment and keeps your balance right. Autopay bills still ask you to confirm they went.
          </li>
          <li>
            <strong>Card bills</strong> can set aside what you currently owe on the card, or a fixed amount like the minimum.
          </li>
          <li>
            <strong>Payday:</strong> Today shows “Payday — confirm your pay”. Pay that varies asks for the real amount.
          </li>
          <li>
            <strong>Bills that come out before your pay on payday?</strong> Turn on that setting in More → Settings so they’re set aside
            too.
          </li>
          <li>
            <strong>Big yearly bills</strong> (on Bills) shows how much to put aside each month for bills that come once or twice a year.
          </li>
          <li>
            <strong>Away for a few days?</strong> Today shows what happened while you were away, so you can confirm it in one tap.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'debt',
    title: 'Debt payoff',
    summary: 'A debt-free date, and two ways to get there.',
    body: (
      <>
        <p>In Plan → Debt, add each card or loan with its balance, interest rate (APR) and minimum payment.</p>
        <ul>
          <li>
            <strong>Snowball</strong> pays off the smallest balance first. Quick wins can help you keep going.
          </li>
          <li>
            <strong>Avalanche</strong> pays off the highest interest rate first. It usually costs the least in interest.
          </li>
          <li>The slider adds an extra amount each month. When a debt is gone, its minimum moves on to the next one.</li>
        </ul>
        <p>
          The dates are <strong>estimates</strong>: interest is added monthly, rates are assumed to stay the same, and no new spending is
          added. Update balances from your statements now and then. This is a planning tool, not financial advice.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Sharing with a partner',
    summary: 'A locked, read-only snapshot. No account, no cloud.',
    body: (
      <>
        <Steps>
          <li>More → Share with partner. Choose whether to include recent transactions (off unless you turn it on).</li>
          <li>Pick a passphrase (at least 8 characters) and create the share file.</li>
          <li>Send the file however you like — AirDrop, WhatsApp, email.</li>
          <li>
            <strong>Tell your partner the passphrase separately</strong>, not in the same message as the file.
          </li>
          <li>Your partner opens it in their own copy: More → Share with partner → Open a share.</li>
        </Steps>
        <p>
          It appears as a read-only <strong>Partner</strong> tab showing safe to spend, upcoming bills and paydays, envelopes and goals, with
          the date and time it was made. It never mixes with their own budget, and they can remove it in one tap. Small shares can also be
          sent as a QR code.
        </p>
      </>
    ),
  },
  {
    id: 'backups',
    title: 'Backups',
    summary: 'Your budget lives only on your device. Keep a copy.',
    body: (
      <>
        <p>There’s no account and no cloud, so a backup file is your safety net if you lose your phone or your browser clears its data.</p>
        <Steps>
          <li>More → Backup & restore → Back up now.</li>
          <li>
            On iPhone, choose <em>Save to Files</em> (or AirDrop it to your computer). On a computer, the file goes to Downloads.
          </li>
          <li>Keep it somewhere safe — iCloud Drive, Google Drive, or email it to yourself.</li>
        </Steps>
        <ul>
          <li>
            <strong>Lock it with a passphrase</strong> if it’s going to the cloud or email. If you forget the passphrase, the backup can’t be
            opened — nobody can recover it.
          </li>
          <li>
            <strong>Restore</strong> shows what’s in the backup before anything changes. <em>Replace</em> swaps everything (best for a new
            phone); <em>Merge</em> combines two devices — the newest change to each item wins, and deleted things stay deleted. Either can be
            undone.
          </li>
          <li>
            <strong>New phone?</strong> On the welcome screen, tap “Moving from another device? Restore a backup”.
          </li>
          <li>A gentle reminder appears when it’s been a while. Change how often in Backup & restore.</li>
        </ul>
        <p class="help-warn">
          <strong>iPhone and iPad:</strong> Safari can delete a website’s data after 7 days without use unless the app is on your Home
          Screen. Add it there, and back up weekly.
        </p>
      </>
    ),
  },
];

export function HelpScreen() {
  const [open, setOpen] = useState<string | null>(null);
  const article = ARTICLES.find((a) => a.id === open);
  if (article) {
    return (
      <article class="help-article" aria-labelledby="help-title">
        <button type="button" class="link-btn back-btn" onClick={() => setOpen(null)} aria-label="Back to all help">
          <Icon name="back" small /> All help
        </button>
        <h2 id="help-title" class="help-title">
          {article.title}
        </h2>
        <div class="card prose">{article.body}</div>
        <p class="footer-note">{DISCLAIMER}</p>
      </article>
    );
  }
  return (
    <>
      <ul class="card rows" aria-label="Help articles">
        {ARTICLES.map((a) => (
          <li key={a.id} class="row">
            <button type="button" class="row-main row-button" onClick={() => setOpen(a.id)}>
              <span>{a.title}</span>
              <span class="row-sub">{a.summary}</span>
            </button>
            <span aria-hidden="true" class="chev">
              <Icon name="forward" small />
            </span>
          </li>
        ))}
      </ul>
      <p class="muted">Questions? Message the shop through Etsy — that’s where support lives.</p>
    </>
  );
}
