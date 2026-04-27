'use server';

import { sql } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export type LoanRecord = {
  id: number;
  loan_number: string;
  borrower_id: number;
  property_id: number;
  loan_amount: number;
  wired_amount: number;
  interest_rate: number;
  loan_term: number;
  origination_date: string;
  maturity_date: string;
  loan_type: string;
  status: string;
  notes: string;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  dob: string;
  ssn: string;
  coborrower_first_name: string;
  coborrower_last_name: string;
  borrower_address: string;
  borrower_city: string;
  borrower_state: string;
  borrower_zip: string;
  property_address: string;
  property_city: string;
  property_state: string;
  property_zip: string;
  property_type: string;
  estimated_value: number;
  year_built: number | null;
  square_footage: number | null;
};

export async function getLoans(): Promise<LoanRecord[]> {
  const rows = await sql`
    SELECT
      l.id, l.loan_number, l.borrower_id, l.property_id,
      l.loan_amount::float        AS loan_amount,
      COALESCE(l.wired_amount, 0)::float AS wired_amount,
      l.interest_rate::float      AS interest_rate,
      l.loan_term,
      TO_CHAR(l.origination_date, 'YYYY-MM-DD') AS origination_date,
      TO_CHAR(l.maturity_date,    'YYYY-MM-DD') AS maturity_date,
      l.loan_type, l.status, l.notes,
      l.created_at::text          AS created_at,
      b.first_name, b.last_name, b.email, b.phone, b.dob, b.ssn,
      b.coborrower_first_name, b.coborrower_last_name,
      b.address AS borrower_address, b.city AS borrower_city,
      b.state   AS borrower_state,  b.zip  AS borrower_zip,
      p.address AS property_address, p.city AS property_city,
      p.state   AS property_state,  p.zip  AS property_zip,
      p.property_type,
      p.estimated_value::float AS estimated_value,
      p.year_built, p.square_footage
    FROM loans l
    JOIN borrowers b ON l.borrower_id = b.id
    JOIN properties p ON l.property_id = p.id
    ORDER BY l.created_at DESC
  `;
  return rows as LoanRecord[];
}

function str(fd: FormData, key: string): string {
  return ((fd.get(key) as string) ?? '').trim();
}

function num(fd: FormData, key: string): number {
  return parseFloat(str(fd, key)) || 0;
}

function optInt(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  return v ? parseInt(v) : null;
}

function optDate(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v || null;
}

export async function addLoan(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const [borrower] = await sql`
      INSERT INTO borrowers (first_name, last_name, email, phone, address, city, state, zip, dob, ssn, coborrower_first_name, coborrower_last_name)
      VALUES (
        ${str(formData, 'first_name')},
        ${str(formData, 'last_name')},
        ${str(formData, 'email')},
        ${str(formData, 'phone')},
        ${str(formData, 'borrower_address')},
        ${str(formData, 'borrower_city')},
        ${str(formData, 'borrower_state')},
        ${str(formData, 'borrower_zip')},
        ${str(formData, 'dob')},
        ${str(formData, 'ssn')},
        ${str(formData, 'coborrower_first_name') || null},
        ${str(formData, 'coborrower_last_name')  || null}
      )
      RETURNING id
    `;

    const [property] = await sql`
      INSERT INTO properties (address, city, state, zip, property_type, estimated_value, year_built, square_footage)
      VALUES (
        ${str(formData, 'property_address')},
        ${str(formData, 'property_city')},
        ${str(formData, 'property_state')},
        ${str(formData, 'property_zip')},
        ${str(formData, 'property_type')},
        ${num(formData, 'estimated_value')},
        ${optInt(formData, 'year_built')},
        ${optInt(formData, 'square_footage')}
      )
      RETURNING id
    `;

    const loanNumber = `PC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    await sql`
      INSERT INTO loans (
        loan_number, borrower_id, property_id,
        loan_amount, wired_amount, interest_rate, loan_term,
        origination_date, maturity_date,
        loan_type, status, notes
      )
      VALUES (
        ${loanNumber},
        ${borrower.id},
        ${property.id},
        ${num(formData, 'loan_amount')},
        ${num(formData, 'wired_amount')},
        ${num(formData, 'interest_rate')},
        ${parseInt(str(formData, 'loan_term')) || 0},
        ${optDate(formData, 'origination_date')},
        ${optDate(formData, 'maturity_date')},
        ${str(formData, 'loan_type')},
        ${str(formData, 'status') || 'application'},
        ${str(formData, 'notes')}
      )
    `;

    revalidatePath('/');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function updateLoanStatus(id: number, status: string): Promise<void> {
  await sql`UPDATE loans SET status = ${status} WHERE id = ${id}`;
  revalidatePath('/');
}

export async function deleteLoan(id: number): Promise<void> {
  const [loan] = await sql`SELECT borrower_id, property_id FROM loans WHERE id = ${id}`;
  if (loan) {
    await sql`DELETE FROM loans     WHERE id = ${id}`;
    await sql`DELETE FROM borrowers WHERE id = ${loan.borrower_id}`;
    await sql`DELETE FROM properties WHERE id = ${loan.property_id}`;
  }
  revalidatePath('/');
}

/* ── Alerts ─────────────────────────────────────────────────── */

export type LoanAlert = {
  loan_id: number;
  loan_number: string;
  first_name: string;
  last_name: string;
  loan_amount: number;
  interest_rate: number;
  outstanding_balance: number;
  paid_this_month: number;
  today_day: number;
  alert_level: 1 | 2 | 3;
  threshold_day: 5 | 10 | 15;
  days_overdue: number;
};

export async function getAlerts(): Promise<LoanAlert[]> {
  const rows = await sql`
    WITH monthly_payments AS (
      SELECT loan_id,
             SUM(amount_paid)   AS paid,
             COUNT(*)           AS cnt
      FROM   payments
      WHERE  DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE)
      GROUP  BY loan_id
    ),
    total_principals AS (
      SELECT loan_id, COALESCE(SUM(principal_amount), 0) AS total
      FROM   payments
      GROUP  BY loan_id
    )
    SELECT
      l.id                                                              AS loan_id,
      l.loan_number,
      l.loan_amount::float,
      l.interest_rate::float,
      b.first_name,
      b.last_name,
      COALESCE(mp.paid, 0)::float                                       AS paid_this_month,
      GREATEST(0, l.loan_amount - COALESCE(tp.total, 0))::float        AS outstanding_balance,
      EXTRACT(DAY FROM CURRENT_DATE)::int                               AS today_day
    FROM   loans l
    JOIN   borrowers b ON l.borrower_id = b.id
    LEFT   JOIN monthly_payments mp ON l.id = mp.loan_id
    LEFT   JOIN total_principals tp ON l.id = tp.loan_id
    WHERE  l.status = 'active'
      AND  EXTRACT(DAY FROM CURRENT_DATE) >= 5
      AND  (mp.cnt IS NULL OR mp.cnt = 0)
    ORDER  BY b.last_name, b.first_name
  `;

  return (rows as Omit<LoanAlert, 'alert_level' | 'threshold_day' | 'days_overdue'>[]).map(row => {
    const d = row.today_day;
    const threshold_day: 5 | 10 | 15 = d >= 15 ? 15 : d >= 10 ? 10 : 5;
    const alert_level: 1 | 2 | 3     = d >= 15 ? 3  : d >= 10 ? 2  : 1;
    return { ...row, alert_level, threshold_day, days_overdue: d - threshold_day };
  });
}

/* ── Edit ───────────────────────────────────────────────────── */

export async function updateBorrower(borrowerId: number, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    await sql`
      UPDATE borrowers SET
        first_name            = ${str(formData, 'first_name')},
        last_name             = ${str(formData, 'last_name')},
        email                 = ${str(formData, 'email')},
        phone                 = ${str(formData, 'phone')},
        address               = ${str(formData, 'borrower_address')},
        city                  = ${str(formData, 'borrower_city')},
        state                 = ${str(formData, 'borrower_state')},
        zip                   = ${str(formData, 'borrower_zip')},
        dob                   = ${str(formData, 'dob')},
        ssn                   = ${str(formData, 'ssn') || null},
        coborrower_first_name = ${str(formData, 'coborrower_first_name') || null},
        coborrower_last_name  = ${str(formData, 'coborrower_last_name')  || null}
      WHERE id = ${borrowerId}
    `;
    revalidatePath('/');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function updateLoan(loanId: number, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    await sql`
      UPDATE loans SET
        loan_amount      = ${num(formData, 'loan_amount')},
        wired_amount     = ${num(formData, 'wired_amount')},
        interest_rate    = ${num(formData, 'interest_rate')},
        loan_term        = ${parseInt(str(formData, 'loan_term')) || 0},
        loan_type        = ${str(formData, 'loan_type')},
        origination_date = ${optDate(formData, 'origination_date')},
        maturity_date    = ${optDate(formData, 'maturity_date')},
        status           = ${str(formData, 'status') || 'application'},
        notes            = ${str(formData, 'notes') || null}
      WHERE id = ${loanId}
    `;
    revalidatePath('/');
    revalidatePath(`/loans/${loanId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/* ── Missing Interest Warnings ──────────────────────────────── */

export type MissingInterestMonth = {
  loan_id: number;
  loan_number: string;
  first_name: string;
  last_name: string;
  missing_month: string; // 'YYYY-MM'
};

export async function getMissingInterestMonths(): Promise<MissingInterestMonth[]> {
  // Interest accrual model: interest for month M is collected in month M+1.
  // So for month M to be flagged as missing, month M+1 must have fully passed
  // (i.e., we only scan months up to 2 months ago).
  // We look for a payment with interest_amount > 0 dated in month M+1.
  const rows = await sql`
    WITH loan_months AS (
      SELECT
        l.id          AS loan_id,
        l.loan_number,
        b.first_name,
        b.last_name,
        generate_series(
          DATE_TRUNC('month', l.origination_date::date),
          DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months',
          '1 month'
        )::date AS month_start
      FROM loans l
      JOIN borrowers b ON l.borrower_id = b.id
      WHERE l.status = 'active'
        AND l.origination_date IS NOT NULL
    ),
    paid_interest AS (
      SELECT
        loan_id,
        DATE_TRUNC('month', payment_date)::date AS month_start
      FROM payments
      WHERE interest_amount > 0
      GROUP BY loan_id, DATE_TRUNC('month', payment_date)::date
    )
    SELECT
      lm.loan_id,
      lm.loan_number,
      lm.first_name,
      lm.last_name,
      TO_CHAR(lm.month_start, 'YYYY-MM') AS missing_month
    FROM loan_months lm
    LEFT JOIN paid_interest pi
      ON lm.loan_id = pi.loan_id
      -- accrual: payment for month M arrives in month M+1
      AND pi.month_start = (lm.month_start + INTERVAL '1 month')::date
    WHERE pi.loan_id IS NULL
    ORDER BY lm.last_name, lm.first_name, lm.month_start
  `;
  return rows as MissingInterestMonth[];
}

/* ── All Payments (monthly report) ─────────────────────────── */

export type AllPayment = {
  id: number;
  loan_id: number;
  loan_number: string;
  first_name: string;
  last_name: string;
  payment_date: string;
  amount_paid: number;
  principal_amount: number;
  interest_amount: number;
  late_fee: number;
  notes: string;
};

export async function getAllPayments(): Promise<AllPayment[]> {
  const rows = await sql`
    SELECT
      p.id,
      p.loan_id,
      l.loan_number,
      b.first_name,
      b.last_name,
      TO_CHAR(p.payment_date, 'YYYY-MM-DD') AS payment_date,
      p.amount_paid::float      AS amount_paid,
      p.principal_amount::float AS principal_amount,
      p.interest_amount::float  AS interest_amount,
      p.late_fee::float         AS late_fee,
      COALESCE(p.notes, '')     AS notes
    FROM payments p
    JOIN loans    l ON p.loan_id    = l.id
    JOIN borrowers b ON l.borrower_id = b.id
    ORDER BY p.payment_date DESC, p.created_at DESC
  `;
  return rows as AllPayment[];
}

/* ── Ledger / Payments ──────────────────────────────────────── */

export type Payment = {
  id: number;
  loan_id: number;
  payment_date: string;
  amount_paid: number;
  principal_amount: number;
  interest_amount: number;
  late_fee: number;
  balance_after: number;
  notes: string;
  created_at: string;
};

export async function getLoanById(id: number): Promise<LoanRecord | null> {
  const rows = await sql`
    SELECT
      l.id, l.loan_number, l.borrower_id, l.property_id,
      l.loan_amount::float        AS loan_amount,
      COALESCE(l.wired_amount, 0)::float AS wired_amount,
      l.interest_rate::float      AS interest_rate,
      l.loan_term,
      TO_CHAR(l.origination_date, 'YYYY-MM-DD') AS origination_date,
      TO_CHAR(l.maturity_date,    'YYYY-MM-DD') AS maturity_date,
      l.loan_type, l.status, l.notes,
      l.created_at::text          AS created_at,
      b.first_name, b.last_name, b.email, b.phone, b.dob, b.ssn,
      b.coborrower_first_name, b.coborrower_last_name,
      b.address AS borrower_address, b.city AS borrower_city,
      b.state   AS borrower_state,  b.zip  AS borrower_zip,
      p.address AS property_address, p.city AS property_city,
      p.state   AS property_state,  p.zip  AS property_zip,
      p.property_type,
      p.estimated_value::float AS estimated_value,
      p.year_built, p.square_footage
    FROM loans l
    JOIN borrowers b ON l.borrower_id = b.id
    JOIN properties p ON l.property_id = p.id
    WHERE l.id = ${id}
  `;
  return (rows[0] as LoanRecord) ?? null;
}

export async function getPayments(loanId: number): Promise<Payment[]> {
  const [loan] = await sql`SELECT loan_amount::float AS loan_amount FROM loans WHERE id = ${loanId}`;
  if (!loan) return [];

  const rows = await sql`
    SELECT
      id, loan_id,
      TO_CHAR(payment_date, 'YYYY-MM-DD') AS payment_date,
      amount_paid::float      AS amount_paid,
      principal_amount::float AS principal_amount,
      interest_amount::float  AS interest_amount,
      late_fee::float         AS late_fee,
      notes,
      created_at::text        AS created_at
    FROM payments
    WHERE loan_id = ${loanId}
    ORDER BY payment_date ASC, created_at ASC
  `;

  let balance = loan.loan_amount as number;
  return (rows as Omit<Payment, 'balance_after'>[]).map(row => {
    balance = Math.max(0, balance - row.principal_amount);
    return { ...row, balance_after: balance };
  });
}

export async function addPayment(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const loanId          = parseInt(formData.get('loan_id') as string);
    const paymentDate     = formData.get('payment_date') as string;
    const amountPaid      = parseFloat(formData.get('amount_paid') as string) || 0;
    const principalAmount = parseFloat(formData.get('principal_amount') as string) || 0;
    const interestAmount  = parseFloat(formData.get('interest_amount') as string) || 0;
    const lateFee         = parseFloat(formData.get('late_fee') as string) || 0;
    const notes           = ((formData.get('notes') as string) ?? '').trim();

    await sql`
      INSERT INTO payments (loan_id, payment_date, amount_paid, principal_amount, interest_amount, late_fee, notes)
      VALUES (${loanId}, ${paymentDate}, ${amountPaid}, ${principalAmount}, ${interestAmount}, ${lateFee}, ${notes || null})
    `;

    revalidatePath(`/loans/${loanId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function updatePayment(paymentId: number, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const loanId          = parseInt(formData.get('loan_id') as string);
    const paymentDate     = formData.get('payment_date') as string;
    const amountPaid      = parseFloat(formData.get('amount_paid') as string) || 0;
    const principalAmount = parseFloat(formData.get('principal_amount') as string) || 0;
    const interestAmount  = parseFloat(formData.get('interest_amount') as string) || 0;
    const lateFee         = parseFloat(formData.get('late_fee') as string) || 0;
    const notes           = ((formData.get('notes') as string) ?? '').trim();

    await sql`
      UPDATE payments SET
        payment_date     = ${paymentDate},
        amount_paid      = ${amountPaid},
        principal_amount = ${principalAmount},
        interest_amount  = ${interestAmount},
        late_fee         = ${lateFee},
        notes            = ${notes || null}
      WHERE id = ${paymentId}
    `;

    revalidatePath(`/loans/${loanId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function deletePayment(paymentId: number, loanId: number): Promise<void> {
  await sql`DELETE FROM payments WHERE id = ${paymentId}`;
  revalidatePath(`/loans/${loanId}`);
}
