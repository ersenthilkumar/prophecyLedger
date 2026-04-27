'use server';

import { createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { parseChaseTsv } from '@/lib/parsers/chase-tsv';
import { matchDeposit, type ActiveLoan } from '@/lib/matching';

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
      CASE WHEN l.id IS NOT NULL
        THEN ROUND((l.loan_amount * l.interest_rate / 100 / 12)::numeric, 2)::float
      END AS expected_interest,
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
  return rows as SuggestedPayment[];
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

  const loanRows = await sql`
    SELECT ROUND((loan_amount * interest_rate / 100 / 12)::numeric, 2) AS monthly_interest
    FROM loans WHERE id = ${s.loan_id as number} LIMIT 1
  `;
  const interest = loanRows[0]?.monthly_interest ?? s.amount;

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
