import { createHash } from 'crypto';

export type BankTxn = {
  transaction_id: string;
  date: string;   // YYYY-MM-DD
  amount: number; // positive = deposit, negative = debit
  memo: string;
};

const HEADER_RE = /^Date[\s,\t]+Description[\s,\t]+Amount[\s,\t]*Running[\s,\t]*Bal/i;
const DATE_RE   = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

// Lenient CSV parser: handles quoted fields with unescaped inner quotes.
// Chase exports use " inside descriptions without escaping them (e.g. "monthly").
// Strategy: a " closes the current field only when followed by , or end-of-line.
function parseCsvRow(line: string): string[] {
  const cols: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) { cols.push(''); break; }
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === '"' && (j + 1 >= line.length || line[j + 1] === ',')) break;
        j++;
      }
      cols.push(line.slice(i + 1, j).trim());
      i = j + 1;                                // skip closing "
      if (i < line.length && line[i] === ',') i++; // skip comma
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { cols.push(line.slice(i).trim()); break; }
      cols.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  return cols;
}

function parseTsvRow(line: string): string[] {
  return line.split('\t').map(c => c.trim());
}

export function parseChaseTsv(input: string): BankTxn[] {
  const text  = input.replace(/^﻿/, '');           // strip BOM
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex(l => HEADER_RE.test(l));
  if (headerIdx === -1) {
    throw new Error(
      'File does not match the expected Chase activity format. ' +
      'Expected columns: Date, Description, Amount, Running Bal.',
    );
  }

  const isCsv = lines[headerIdx].includes(',');
  const parseRow = isCsv ? parseCsvRow : parseTsvRow;

  const txns: BankTxn[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue;
    const cols = parseRow(line);
    if (cols.length < 3) continue;

    const [dateStr, descriptionRaw, amountStr] = cols;
    if (!amountStr) continue; // balance rows have empty amount

    const dateMatch = dateStr.match(DATE_RE);
    if (!dateMatch) continue;
    const [, m, d, y] = dateMatch;
    const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

    const amount = Number(amountStr.replace(/[, ]/g, ''));
    if (!Number.isFinite(amount)) continue;

    const memo = descriptionRaw.replace(/\s+/g, ' ').trim();

    const transaction_id = 'chase:' + createHash('sha1')
      .update(`${date}|${amount.toFixed(2)}|${memo}`)
      .digest('hex')
      .slice(0, 16);

    txns.push({ transaction_id, date, amount, memo });
  }
  return txns;
}
