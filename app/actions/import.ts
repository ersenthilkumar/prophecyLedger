'use server';

import { createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { parseChaseTsv } from '@/lib/parsers/chase-tsv';
import { matchDeposit, type ActiveLoan } from '@/lib/matching';
import { expectedInterest } from '@/lib/interest';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SuggestedPayment = {
  id: number;
  bank_transaction_id: string;
  amount: number;
  transaction_date: string;
  memo: string | null;
  loan_id: number | null;
  loan_number: string | null;
  borrower_name: string | null;
  expected_interest: number | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  status: 'pending' | 'confirmed' | 'dismissed';
  created_at: string;
};

export type StatementUpload = {
  id: number;
  filename: string;
  uploaded_at: string;
  txn_count: number;
  imported_count: number;
  matched_count: number;
};

export type ImportResult =
  | { ok: true; parsed: number; imported: number; matched: number }
  | { ok: false; error: string };

// ─── Import ───────────────────────────────────────────────────────────────────

export async function importStatement(formData: FormData): Promise<ImportResult> {
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return { ok: false, error: 'No file uploaded.' };

  const buf = Buffer.from(await file.arrayBuffer());
  const text = buf.toString('utf8');
  const fileHash = createHash('sha256').update(buf).digest('hex');

  const dup = await sql`SELECT id FROM statement_uploads WHERE file_hash = ${fileHash} LIMIT 1`;
  if (dup[0]) return { ok: false, error: 'This file has already been imported.' };

  let txns;
  try {
    txns = parseChaseTsv(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to parse file.' };
  }

  const deposits = txns.filter(t => t.amount > 0);

  const loanRows = await sql`
    SELECT
      l.id, l.loan_number,
      l.loan_amount::float   AS loan_amount,
      l.interest_rate::float AS interest_rate,
      GREATEST(0, l.loan_amount - COALESCE(SUM(p.principal_amount), 0))::float AS outstanding_balance,
      TO_CHAR(l.origination_date, 'YYYY-MM-DD') AS origination_date,
      b.first_name, b.last_name,
      b.coborrower_first_name, b.coborrower_last_name,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT TO_CHAR(p.payment_date, 'YYYY-MM')), NULL) AS payment_months
    FROM loans l
    JOIN borrowers b ON b.id = l.borrower_id
    LEFT JOIN payments p ON p.loan_id = l.id
    WHERE l.status = 'active'
    GROUP BY l.id, b.first_name, b.last_name, b.coborrower_first_name, b.coborrower_last_name
  `;
  const loans = loanRows as ActiveLoan[];

  let imported = 0, matched = 0;
  for (const t of deposits) {
    const existing = await sql`
      SELECT id FROM suggested_payments WHERE bank_transaction_id = ${t.transaction_id} LIMIT 1
    `;
    if (existing[0]) continue;

    const { loanId, confidence } = matchDeposit(t, loans);
    await sql`
      INSERT INTO suggested_payments
        (bank_transaction_id, amount, transaction_date, memo, loan_id, confidence)
      VALUES
        (${t.transaction_id}, ${t.amount}, ${t.date}, ${t.memo}, ${loanId}, ${confidence})
      ON CONFLICT (bank_transaction_id) DO NOTHING
    `;
    imported++;
    if (loanId) matched++;
  }

  await sql`
    INSERT INTO statement_uploads
      (filename, file_hash, txn_count, imported_count, matched_count)
    VALUES
      (${file.name}, ${fileHash}, ${txns.length}, ${imported}, ${matched})
  `;

  revalidatePath('/settings');
  revalidatePath('/suggestions');
  return { ok: true, parsed: txns.length, imported, matched };
}

// ─── Recent uploads ───────────────────────────────────────────────────────────

export async function getRecentUploads(limit = 10): Promise<StatementUpload[]> {
  const rows = await sql`
    SELECT id, filename, uploaded_at::text, txn_count, imported_count, matched_count
    FROM statement_uploads
    ORDER BY uploaded_at DESC
    LIMIT ${limit}
  `;
  return rows as StatementUpload[];
}

// ─── Review actions ───────────────────────────────────────────────────────────

export async function getSuggestedPayments(): Promise<SuggestedPayment[]> {
  const rows = await sql`
    SELECT
      sp.id, sp.bank_transaction_id,
      sp.amount::float       AS amount,
      sp.transaction_date::text,
      sp.memo,
      sp.loan_id,
      l.loan_number,
      CASE WHEN b.id IS NOT NULL THEN b.first_name || ' ' || b.last_name END AS borrower_name,
      l.interest_rate::float AS interest_rate,
      TO_CHAR(l.origination_date, 'YYYY-MM-DD') AS origination_date,
      (l.loan_amount - COALESCE((
        SELECT SUM(p.principal_amount) FROM payments p
        WHERE p.loan_id = l.id AND p.payment_date < sp.transaction_date
      ), 0))::float AS balance,
      COALESCE((
        SELECT SUM(p.interest_amount) FROM payments p
        WHERE p.loan_id = l.id
          AND DATE_TRUNC('month', p.payment_date) = DATE_TRUNC('month', sp.transaction_date)
      ), 0)::float AS interest_already_paid,
      sp.confidence,
      sp.status,
      sp.created_at::text
    FROM suggested_payments sp
    LEFT JOIN loans l ON l.id = sp.loan_id
    LEFT JOIN borrowers b ON b.id = l.borrower_id
    WHERE sp.status = 'pending'
    ORDER BY
      CASE sp.confidence WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
      sp.transaction_date DESC
  `;
  return rows.map(r => {
    const { interest_rate, origination_date, balance, interest_already_paid, ...rest } = r as Record<string, unknown>;
    return {
      ...rest,
      expected_interest: rest.loan_id == null ? null : interestDue(
        rest.transaction_date as string, balance as number, interest_rate as number,
        origination_date as string | null, interest_already_paid as number,
      ),
    } as SuggestedPayment;
  });
}

/** Actual/365 interest accrued for the period this payment covers, less interest already recorded that month. */
function interestDue(
  paymentDate: string, balance: number, rate: number,
  originationDate: string | null, alreadyPaid: number,
): number {
  const accrued = expectedInterest(paymentDate.slice(0, 10), Math.max(0, balance), rate, originationDate);
  return Math.max(0, Math.round((accrued - alreadyPaid) * 100) / 100);
}

export async function getPendingSuggestionsCount(): Promise<number> {
  const rows = await sql`SELECT COUNT(*)::int AS n FROM suggested_payments WHERE status = 'pending'`;
  return (rows[0]?.n as number) ?? 0;
}

export async function confirmSuggestion(id: number): Promise<{ ok: boolean; error?: string }> {
  const rows = await sql`SELECT * FROM suggested_payments WHERE id = ${id} LIMIT 1`;
  const s = rows[0];
  if (!s) return { ok: false, error: 'Suggestion not found.' };
  if (!s.loan_id) return { ok: false, error: 'No loan matched — assign a loan first.' };

  const txnDate = String(s.transaction_date).slice(0, 10);
  const loanRows = await sql`
    SELECT
      l.interest_rate::float AS interest_rate,
      TO_CHAR(l.origination_date, 'YYYY-MM-DD') AS origination_date,
      (l.loan_amount - COALESCE((
        SELECT SUM(p.principal_amount) FROM payments p
        WHERE p.loan_id = l.id AND p.payment_date < ${txnDate}::date
      ), 0))::float AS balance,
      COALESCE((
        SELECT SUM(p.interest_amount) FROM payments p
        WHERE p.loan_id = l.id
          AND DATE_TRUNC('month', p.payment_date) = DATE_TRUNC('month', ${txnDate}::date)
      ), 0)::float AS interest_already_paid
    FROM loans l WHERE l.id = ${s.loan_id as number} LIMIT 1
  `;
  const loan = loanRows[0];
  const amount = Number(s.amount);
  const interest = loan
    ? Math.min(amount, interestDue(
        txnDate, loan.balance as number, loan.interest_rate as number,
        loan.origination_date as string | null, loan.interest_already_paid as number,
      ))
    : amount;

  const paymentRows = await sql`
    INSERT INTO payments (loan_id, payment_date, amount_paid, interest_amount, notes)
    VALUES (
      ${s.loan_id as number},
      ${s.transaction_date as string},
      ${s.amount as number},
      ${interest as number},
      ${'Auto-imported from bank statement · ' + (s.memo as string ?? '')}
    )
    RETURNING id
  `;
  const paymentId = paymentRows[0].id as number;

  await sql`
    UPDATE suggested_payments
    SET status = 'confirmed', payment_id = ${paymentId}
    WHERE id = ${id}
  `;

  revalidatePath('/suggestions');
  revalidatePath(`/loans/${s.loan_id as number}`);
  return { ok: true };
}

export async function dismissSuggestion(id: number): Promise<void> {
  await sql`UPDATE suggested_payments SET status = 'dismissed' WHERE id = ${id}`;
  revalidatePath('/suggestions');
}

export async function assignAndConfirm(
  id: number,
  loanId: number,
): Promise<{ ok: boolean; error?: string }> {
  await sql`UPDATE suggested_payments SET loan_id = ${loanId} WHERE id = ${id}`;
  return confirmSuggestion(id);
}
