// Plaid integration disabled — to be re-enabled later.
// Original implementation preserved below as a block comment.

/*
'use server';

import { revalidatePath } from 'next/cache';
import { Products, CountryCode } from 'plaid';
import { plaidClient } from '@/lib/plaid';
import { sql } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlaidItem = {
  id: number;
  item_id: string;
  institution_name: string | null;
  last_synced_at: string | null;
  created_at: string;
};

export type SuggestedPayment = {
  id: number;
  plaid_transaction_id: string;
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

// ─── Connection ───────────────────────────────────────────────────────────────

export async function getPlaidItem(): Promise<PlaidItem | null> {
  const rows = await sql`
    SELECT id, item_id, institution_name, last_synced_at, created_at
    FROM   plaid_items
    LIMIT  1
  `;
  return (rows[0] as PlaidItem) ?? null;
}

export async function createLinkToken(): Promise<string> {
  const res = await plaidClient.linkTokenCreate({
    user:         { client_user_id: 'prophecy-capital-lender' },
    client_name:  'ProphecyLedger',
    products:     [Products.Transactions],
    country_codes:[CountryCode.Us],
    language:     'en',
  });
  return res.data.link_token;
}

export async function exchangeToken(publicToken: string, institutionName: string): Promise<void> {
  const res = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
  const { access_token, item_id } = res.data;

  // Only one item allowed — replace if exists
  await sql`DELETE FROM plaid_items`;
  await sql`
    INSERT INTO plaid_items (item_id, access_token, institution_name)
    VALUES (${item_id}, ${access_token}, ${institutionName})
  `;
  revalidatePath('/settings');
}

export async function disconnectPlaid(): Promise<void> {
  const rows = await sql`SELECT access_token FROM plaid_items LIMIT 1`;
  if (rows[0]) {
    try {
      await plaidClient.itemRemove({ access_token: rows[0].access_token as string });
    } catch {
      // item may already be removed from Plaid side
    }
  }
  await sql`DELETE FROM plaid_items`;
  revalidatePath('/settings');
}

// ─── Sync & Matching ──────────────────────────────────────────────────────────

type ActiveLoan = {
  id: number;
  loan_number: string;
  loan_amount: number;
  interest_rate: number;
  first_name: string;
  last_name: string;
  payment_months: string[]; // existing YYYY-MM strings
};

export async function syncPlaidTransactions(): Promise<{ synced: number; matched: number }> {
  const itemRows = await sql`SELECT * FROM plaid_items LIMIT 1`;
  if (!itemRows[0]) throw new Error('No bank account connected.');

  const item = itemRows[0] as { id: number; access_token: string; cursor: string | null };

  // Fetch active loans with their recent payment months
  const loanRows = await sql`
    SELECT
      l.id, l.loan_number,
      l.loan_amount::float  AS loan_amount,
      l.interest_rate::float AS interest_rate,
      b.first_name, b.last_name,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT TO_CHAR(p.payment_date, 'YYYY-MM')), NULL) AS payment_months
    FROM loans l
    JOIN borrowers b ON b.id = l.borrower_id
    LEFT JOIN payments p ON p.loan_id = l.id
    WHERE l.status = 'active'
    GROUP BY l.id, b.first_name, b.last_name
  `;
  const loans = loanRows as ActiveLoan[];

  // Sync transactions from Plaid (paginate until has_more = false)
  let cursor: string | undefined = item.cursor ?? undefined;
  const added: Array<{ transaction_id: string; amount: number; date: string; name: string; pending: boolean }> = [];

  let hasMore = true;
  while (hasMore) {
    const res = await plaidClient.transactionsSync({
      access_token: item.access_token,
      cursor,
    });
    added.push(...res.data.added as typeof added);
    cursor  = res.data.next_cursor;
    hasMore = res.data.has_more;
  }

  // Update cursor and last_synced_at
  await sql`
    UPDATE plaid_items
    SET cursor = ${cursor ?? null}, last_synced_at = NOW()
    WHERE id = ${item.id}
  `;

  // Filter: settled deposits only (amount < 0 in Plaid = money IN)
  const deposits = added.filter(t => t.amount < 0 && !t.pending);
  let matched = 0;

  for (const txn of deposits) {
    // Skip if already logged
    const existing = await sql`
      SELECT id FROM suggested_payments WHERE plaid_transaction_id = ${txn.transaction_id} LIMIT 1
    `;
    if (existing[0]) continue;

    const depositAmount = Math.abs(txn.amount);
    const txnMonth      = txn.date.slice(0, 7); // YYYY-MM

    // 1. Loan number in memo → high confidence
    let loanId: number | null = null;
    let confidence: 'high' | 'medium' | 'low' | 'none' = 'none';

    const loanNumMatch = txn.name?.match(/PC-\d{4}-\d+/i);
    if (loanNumMatch) {
      const found = loans.find(l => l.loan_number?.toUpperCase() === loanNumMatch[0].toUpperCase());
      if (found) { loanId = found.id; confidence = 'high'; }
    }

    // 2. Amount match → medium/low confidence
    if (!loanId) {
      const TOLERANCE = Math.max(10, depositAmount * 0.03); // $10 or 3%
      const candidates = loans.filter(l => {
        const monthlyInterest = (l.loan_amount * l.interest_rate) / 100 / 12;
        if (Math.abs(monthlyInterest - depositAmount) > TOLERANCE) return false;
        // No payment already recorded for this loan in the deposit month
        return !l.payment_months.includes(txnMonth);
      });
      if (candidates.length === 1)  { loanId = candidates[0].id; confidence = 'medium'; }
      else if (candidates.length > 1) { loanId = candidates[0].id; confidence = 'low';    }
    }

    await sql`
      INSERT INTO suggested_payments
        (plaid_transaction_id, amount, transaction_date, memo, loan_id, confidence)
      VALUES
        (${txn.transaction_id}, ${depositAmount}, ${txn.date}, ${txn.name ?? null}, ${loanId}, ${confidence})
      ON CONFLICT (plaid_transaction_id) DO NOTHING
    `;
    if (loanId) matched++;
  }

  revalidatePath('/suggestions');
  return { synced: deposits.length, matched };
}

// ─── Review actions ───────────────────────────────────────────────────────────

export async function getSuggestedPayments(): Promise<SuggestedPayment[]> {
  const rows = await sql`
    SELECT
      sp.id, sp.plaid_transaction_id,
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

  // Insert payment: treat full deposit amount as interest
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
      ${'Auto-imported via Plaid · ' + (s.memo as string ?? '')}
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
*/

export {};
