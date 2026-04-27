import { createHash } from 'crypto';

export type BankTxn = {
  transaction_id: string;
  date: string;   // YYYY-MM-DD
  amount: number; // positive = deposit, negative = debit
  memo: string;
};

const HEADER_RE = /^Date\s+Description\s+Amount\s+Running\s*Bal/i;
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function parseChaseTsv(input: string): BankTxn[] {
  const text = input.replace(/^﻿/, '');
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex(l => HEADER_RE.test(l));
  if (headerIdx === -1) {
    throw new Error(
      'File does not match the expected Chase activity format. ' +
      'The file must contain a tab-separated "Date / Description / Amount / Running Bal." header row.',
    );
  }

  const txns: BankTxn[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue;
    const cols = line.split('\t').map(c => c.trim());
    if (cols.length < 4) continue;

    const [dateStr, descriptionRaw, amountStr] = cols;
    if (!amountStr) continue; // beginning/ending balance rows have no amount

    const dateMatch = dateStr.match(DATE_RE);
    if (!dateMatch) continue;
    const [, m, d, y] = dateMatch;
    const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

    const amount = Number(amountStr.replace(/[, ]/g, ''));
    if (!Number.isFinite(amount)) continue;

    const memo = descriptionRaw.replace(/"/g, '').replace(/\s+/g, ' ').trim();

    const transaction_id = 'chase:' + createHash('sha1')
      .update(`${date}|${amount.toFixed(2)}|${memo}`)
      .digest('hex')
      .slice(0, 16);

    txns.push({ transaction_id, date, amount, memo });
  }
  return txns;
}
