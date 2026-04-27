import type { BankTxn } from './parsers/chase-tsv';

export type ActiveLoan = {
  id: number;
  loan_number: string;
  loan_amount: number;
  interest_rate: number;
  first_name: string;
  last_name: string;
  coborrower_first_name: string | null;
  coborrower_last_name: string | null;
  payment_months: string[]; // existing YYYY-MM strings
};

export type Confidence = 'high' | 'medium' | 'low' | 'none';
export type MatchResult = { loanId: number | null; confidence: Confidence };

const LOAN_NUM_RE = /PC-\d{4}-\d+/i;

function nameHits(memoLower: string, first: string | null, last: string | null) {
  const f = (first ?? '').toLowerCase();
  const l = (last  ?? '').toLowerCase();
  const hasFirst = f.length >= 2 && memoLower.includes(f);
  const hasLast  = l.length >= 2 && memoLower.includes(l);
  return { both: hasFirst && hasLast, lastOnly: !hasFirst && hasLast };
}

export function matchDeposit(txn: BankTxn, loans: ActiveLoan[]): MatchResult {
  const memoLower = txn.memo.toLowerCase();
  const txnMonth  = txn.date.slice(0, 7);

  // 1. Loan number in memo → high
  const loanNumMatch = txn.memo.match(LOAN_NUM_RE);
  if (loanNumMatch) {
    const found = loans.find(l => l.loan_number?.toUpperCase() === loanNumMatch[0].toUpperCase());
    if (found) return { loanId: found.id, confidence: 'high' };
  }

  // 2. First + last name (borrower OR co-borrower) → high
  for (const loan of loans) {
    const b = nameHits(memoLower, loan.first_name, loan.last_name);
    const c = nameHits(memoLower, loan.coborrower_first_name, loan.coborrower_last_name);
    if (b.both || c.both) return { loanId: loan.id, confidence: 'high' };
  }

  const monthlyInterest = (l: ActiveLoan) => (l.loan_amount * l.interest_rate) / 100 / 12;
  const tolerance = Math.max(10, txn.amount * 0.03);
  const amountMatches = (l: ActiveLoan) => Math.abs(monthlyInterest(l) - txn.amount) <= tolerance;

  // 3. Last name only + amount within tolerance → medium
  for (const loan of loans) {
    if (loan.payment_months.includes(txnMonth)) continue;
    if (!amountMatches(loan)) continue;
    const b = nameHits(memoLower, loan.first_name, loan.last_name);
    const c = nameHits(memoLower, loan.coborrower_first_name, loan.coborrower_last_name);
    if (b.lastOnly || c.lastOnly) return { loanId: loan.id, confidence: 'medium' };
  }

  // 4. Amount within tolerance only → low
  const amountCandidates = loans.filter(l =>
    !l.payment_months.includes(txnMonth) && amountMatches(l)
  );
  if (amountCandidates.length === 1) return { loanId: amountCandidates[0].id, confidence: 'low' };
  if (amountCandidates.length > 1)  return { loanId: null, confidence: 'low' };

  return { loanId: null, confidence: 'none' };
}
