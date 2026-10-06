// Writes the sample bank CSV exports in test/fixtures/csv/ (CRLF line endings, like real exports).
// Made-up rows in each bank's publicly known column layout. Run: node test/fixtures/make-csv-fixtures.mjs
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'csv');
fs.mkdirSync(dir, { recursive: true });
const w = (name, lines, prefix = '') => fs.writeFileSync(path.join(dir, name), prefix + lines.join('\r\n') + '\r\n');

// Chase checking: MM/DD/YYYY, signed amounts, trailing empty column on every row.
w('chase-checking.csv', [
  'Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #',
  'DEBIT,10/01/2026,"STARBUCKS STORE 12345 SEATTLE WA",-5.75,DEBIT_CARD,2244.25,,',
  'DEBIT,10/02/2026,"WHOLE FOODS MARKET #10234 SEATTLE WA",-86.42,DEBIT_CARD,2157.83,,',
  'DEBIT,10/03/2026,"UBER   *TRIP HELP.UBER.COM CA",-18.20,DEBIT_CARD,2139.63,,',
  'CREDIT,10/05/2026,"ACME CORP PAYROLL PPD ID: 1234567890",1850.00,ACH_CREDIT,3989.63,,',
  'DEBIT,10/05/2026,"Zelle payment to JOHN LANDLORD JPM99abc123",-950.00,QUICKPAY_DEBIT,3039.63,,',
  'DEBIT,10/08/2026,"NETFLIX.COM NETFLIX.COM CA",-15.49,DEBIT_CARD,3024.14,,',
  'DEBIT,10/09/2026,"AMZN Mktp US*2K4AB1CD0 Amzn.com/bill WA",-32.99,DEBIT_CARD,2991.15,,',
  'CHECK,10/12/2026,"CHECK 1043",-120.00,CHECK_PAID,2871.15,1043,',
  'DEBIT,10/13/2026,"SHELL OIL 57444123 SEATTLE WA",-41.30,DEBIT_CARD,2829.85,,',
  'DEBIT,10/15/2026,"STARBUCKS STORE 12345 SEATTLE WA",-5.75,DEBIT_CARD,2824.10,,',
]);

// Bank of America checking: summary block before the header; quoted amounts with thousands commas.
w('bofa-checking.csv', [
  'Description,,Summary Amt.',
  'Beginning balance as of 10/01/2026,,"2,345.67"',
  'Total credits,,"1,850.00"',
  'Total debits,,"-1,234.56"',
  'Ending balance as of 10/15/2026,,"2,961.11"',
  '',
  'Date,Description,Amount,Running Bal.',
  '10/01/2026,Beginning balance as of 10/01/2026,,"2,345.67"',
  '10/02/2026,"TRADER JOE\'S #123 SAN FRANCISCO CA","-45.67","2,300.00"',
  '10/03/2026,"LYFT   *RIDE THU 8PM","-12.40","2,287.60"',
  '10/06/2026,"ACME CORP DES:PAYROLL ID:XXXXX12345 INDN:DOE,JANE CO ID:XXXXX12345 PPD","1,850.00","4,137.60"',
  '10/07/2026,"PG&E DES:WEB ONLINE ID:XXXXX6789 INDN:JANE DOE","-118.33","4,019.27"',
  '10/09/2026,"SPOTIFY USA 877-778-1161 NY","-11.99","4,007.28"',
  '10/14/2026,"CHIPOTLE 1234 SAN FRANCISCO CA","-13.85","3,993.43"',
  '10/15/2026,"Online Banking transfer to SAV 1234 Confirmation# 1234567890","-1,032.32","2,961.11"',
]);

// Wells Fargo checking: no header; date, amount, "*", check number, description.
w('wells-fargo-checking.csv', [
  '"10/02/2026","-12.50","*","","PURCHASE AUTHORIZED ON 10/01 CHIPOTLE 1234 OAKLAND CA S386274000000000 CARD 1234"',
  '"10/03/2026","-64.18","*","","PURCHASE AUTHORIZED ON 10/02 SAFEWAY #1234 OAKLAND CA S586275000000000 CARD 1234"',
  '"10/05/2026","1850.00","*","","ACME CORP DIR DEP 101526 XXXXX1234 JANE DOE"',
  '"10/07/2026","-60.00","*","1044","CHECK # 1044"',
  '"10/08/2026","-89.99","*","","COMCAST CALIFORNIA 800-COMCAST CA 1234"',
  '"10/13/2026","-25.00","*","","PURCHASE AUTHORIZED ON 10/12 PLANET FITNESS 800-1234 NH S486286000000000 CARD 1234"',
  '"10/14/2026","-4.95","*","","PURCHASE AUTHORIZED ON 10/13 STARBUCKS STORE 05555 OAKLAND CA S386287000000000 CARD 1234"',
]);

// Capital One credit card: ISO dates, separate Debit (spend) and Credit (payments/refunds) columns.
w('capital-one-credit.csv', [
  'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
  '2026-10-01,2026-10-02,1234,UBER   *TRIP,Other Travel,14.35,',
  '2026-10-02,2026-10-03,1234,KROGER #456,Merchandise,63.20,',
  '2026-10-04,2026-10-05,1234,CAPITAL ONE AUTOPAY PYMT,Payment/Credit,,250.00',
  '2026-10-06,2026-10-07,1234,AMAZON.COM*AB12CD34E,Merchandise,24.99,',
  '2026-10-09,2026-10-10,1234,DOORDASH*THAI PALACE,Dining,31.47,',
  '2026-10-11,2026-10-12,1234,AMAZON.COM*REFUND,Merchandise,,24.99',
  '2026-10-14,2026-10-15,1234,SPECTRUM 855-707-7328,Phone/Cable,79.99,',
]);

// Capital One 360 checking: positive amounts + a Debit/Credit type column; MM/DD/YY.
w('capital-one-360.csv', [
  'Account Number,Transaction Description,Transaction Date,Transaction Type,Transaction Amount,Balance',
  '36012345678,Debit Card Purchase - KROGER #456 COLUMBUS OH,10/02/26,Debit,52.18,1947.82',
  '36012345678,Debit Card Purchase - CVS/PHARMACY #01234 COLUMBUS OH,10/04/26,Debit,18.07,1929.75',
  '36012345678,Deposit from ACME CORP PAYROLL,10/09/26,Credit,1850.00,3779.75',
  '36012345678,Withdrawal to VERIZON WIRELESS,10/10/26,Debit,65.00,3714.75',
  '36012345678,Debit Card Purchase - TARGET 00012345 COLUMBUS OH,10/13/26,Debit,41.62,3673.13',
  '36012345678,Interest Paid,10/15/26,Credit,0.42,3673.55',
]);

// Barclays: blank Number column, DD/MM/YYYY, sort-code/account column, signed Amount, padded Memo.
w('barclays.csv', [
  'Number,Date,Account,Amount,Subcategory,Memo',
  ',01/10/2026,20-32-06 12345678,-950.00,Standing Order,LANDLORD LTD           RENT OCT',
  ',02/10/2026,20-32-06 12345678,-23.45,Payment,TESCO STORES 3297    ON 01 OCT          BCC',
  ',03/10/2026,20-32-06 12345678,-2.80,Payment,PRET A MANGER          ON 02 OCT          BCC',
  ',05/10/2026,20-32-06 12345678,1625.00,Bank Credit,ACME LTD               SALARY',
  ',08/10/2026,20-32-06 12345678,-38.00,Direct Debit,OCTOPUS ENERGY         A1B2C3D4    DDR',
  ',14/10/2026,20-32-06 12345678,-10.99,Payment,SPOTIFY P1A2B3C4D5     ON 13 OCT          BCC',
  ',15/10/2026,20-32-06 12345678,-62.30,Payment,SAINSBURYS S/MKT       ON 14 OCT          BCC',
]);

// HSBC UK: no header; DD/MM/YYYY with every day 12 or under (ambiguous on purpose); quoted thousands.
w('hsbc-uk.csv', [
  '01/10/2026,"LANDLORD LTD RENT",-1050.00',
  '02/10/2026,"TESCO STORES 3297 LONDON",-18.65',
  '03/10/2026,"TFL TRAVEL CH LONDON",-7.20',
  '05/10/2026,"ACME LTD SALARY","1,250.00"',
  '06/10/2026,"BRITISH GAS SERVICES",-54.00',
  '09/10/2026,"COSTA COFFEE 43021",-3.40',
  '12/10/2026,"AMAZON.CO.UK*AB1CD2EF3","-1,099.99"',
]);

// Monzo: 18 columns; signed Amount plus Money Out / Money In; merchant in Name.
w('monzo.csv', [
  'Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In',
  'tx_0000AbCdEf01,01/10/2026,08:14:22,Card payment,Pret A Manger,🥪,Eating out,-4.20,GBP,-4.20,GBP,,1 King Street,,PRET A MANGER LONDON GBR,,-4.20,',
  'tx_0000AbCdEf02,02/10/2026,18:40:01,Card payment,Lidl,🛒,Groceries,-26.31,GBP,-26.31,GBP,weekly shop,,,LIDL GB LONDON,,-26.31,',
  'tx_0000AbCdEf03,05/10/2026,09:00:00,Faster payment,ACME LTD,,Income,1580.00,GBP,1580.00,GBP,,,,ACME LTD SALARY,,,1580.00',
  'tx_0000AbCdEf04,07/10/2026,07:55:13,Card payment,Uber,🚕,Transport,-12.74,GBP,-12.74,GBP,,,,UBER* TRIP,,-12.74,',
  'tx_0000AbCdEf05,10/10/2026,21:12:45,Card payment,Netflix,📺,Entertainment,-10.99,GBP,-10.99,GBP,,,,NETFLIX.COM,,-10.99,',
  'tx_0000AbCdEf06,13/10/2026,12:30:00,Direct Debit,EE Limited,📱,Bills,-25.00,GBP,-25.00,GBP,,,,EE LIMITED,,-25.00,',
]);

// Revolut: ISO date-times, Fee column, State column (the REVERTED row must not be imported).
w('revolut.csv', [
  'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
  'CARD_PAYMENT,Current,2026-10-01 09:12:44,2026-10-02 10:01:02,Lidl,-18.43,0.00,GBP,COMPLETED,481.57',
  'TOPUP,Current,2026-10-03 12:00:10,2026-10-03 12:00:11,Top-Up by *1234,200.00,0.00,GBP,COMPLETED,681.57',
  'CARD_PAYMENT,Current,2026-10-04 19:33:02,2026-10-05 08:00:00,Deliveroo,-22.90,0.00,GBP,COMPLETED,658.67',
  'CARD_PAYMENT,Current,2026-10-06 14:20:31,,Amazon,-15.00,0.00,GBP,REVERTED,',
  'TRANSFER,Current,2026-10-08 10:10:10,2026-10-08 10:10:11,To JANE DOE,-50.00,0.00,GBP,COMPLETED,608.67',
  'EXCHANGE,Current,2026-10-12 16:45:00,2026-10-12 16:45:01,Exchanged to EUR,-100.00,0.50,GBP,COMPLETED,508.17',
]);

// Generic: UTF-8 BOM, ($54.12) negatives, "$1,850.00" positives, Payee column.
w('generic-parentheses.csv', [
  'Date,Payee,Amount,Memo',
  '10/01/2026,Walmart Supercenter,($54.12),groceries',
  '10/03/2026,City Water Dept,($38.00),',
  '10/05/2026,Acme Corp Payroll,"$1,850.00",salary',
  '10/09/2026,AT&T Wireless,($72.15),',
  '10/13/2026,Home Depot,($19.98),',
  '10/14/2026,Refund - Home Depot,$19.98,',
], '﻿');

// European: semicolons, DD.MM.YYYY, comma decimals with dot thousands, German headers.
w('generic-eu-semicolon.csv', [
  'Buchungstag;Verwendungszweck;Betrag;Währung',
  '01.10.2026;MIETE OKTOBER;-1.050,00;EUR',
  '02.10.2026;REWE SAGT DANKE 1234;-34,57;EUR',
  '04.10.2026;ALDI SUED FILIALE 12;-21,09;EUR',
  '05.10.2026;GEHALT ACME GMBH;2.430,00;EUR',
  '08.10.2026;NETFLIX INTERNATIONAL;-12,99;EUR',
  '14.10.2026;DB VERTRIEB GMBH;-49,90;EUR',
]);

console.log('wrote', fs.readdirSync(dir).filter((f) => f.endsWith('.csv')).length, 'files to', dir);
