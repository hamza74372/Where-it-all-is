# Sample bank CSV exports (test fixtures)

Made-up rows written in the column layout each bank's export is publicly known to use,
including their quirks. No real customer data. They exist to test detection and parsing;
the app does not claim official support for any bank, and real exports change over time.
Regenerate with `node test/fixtures/make-csv-fixtures.mjs`.

| File | What it tests |
|---|---|
| chase-checking.csv | MM/DD/YYYY, signed Amount, trailing empty column on every row |
| bofa-checking.csv | Summary block before the header row, blank line, quoted "1,234.56" amounts, a balance row with no amount |
| wells-fargo-checking.csv | No header row; date, amount, "*", check no., description |
| capital-one-credit.csv | ISO dates, separate Debit (spend) and Credit (payment/refund) columns, the bank's own Category column |
| capital-one-360.csv | Positive amounts with a Debit/Credit type column, MM/DD/YY, numeric account-number column |
| barclays.csv | DD/MM/YYYY, blank Number column, sort-code column, padded Memo |
| hsbc-uk.csv | No header, DD/MM/YYYY with every day ≤ 12 (genuinely ambiguous), quoted thousands |
| monzo.csv | 18 columns, signed Amount and Money Out/Money In, merchant in Name, Time column, emoji |
| revolut.csv | ISO date-times, Fee column, State column with a REVERTED row |
| generic-parentheses.csv | UTF-8 BOM, ($54.12) negatives, "$1,850.00" positives, Payee column |
| generic-eu-semicolon.csv | Semicolons, DD.MM.YYYY, comma decimals with dot thousands, German headers |
