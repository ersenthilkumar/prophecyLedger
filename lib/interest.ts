/* Interest accrual model: interest for month M is collected in month M+1.
   Day count is actual/365: balance × (rate / 365) × actual calendar days in the period.
   In the loan's first month, interest accrues from the origination date. */

export type AccrualPeriod = {
  periodStart: Date;
  periodEnd: Date;
  days: number;
  notStarted: boolean;
};

export function parseYMD(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** The accrual period collected by a payment dated `paymentDate` (YYYY-MM-DD): the prior calendar month. */
export function accrualPeriod(paymentDate: string, originationDate?: string | null): AccrualPeriod | null {
  const pay = parseYMD(paymentDate);
  if (!pay) return null;
  const monthStart = new Date(pay.getFullYear(), pay.getMonth() - 1, 1);
  const periodEnd  = new Date(pay.getFullYear(), pay.getMonth(), 0);
  const orig = parseYMD(originationDate);

  const notStarted  = !!orig && orig > periodEnd;
  const periodStart = orig && orig > monthStart && !notStarted ? orig : monthStart;
  const days = notStarted ? 0
    : Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1;

  return { periodStart, periodEnd, days, notStarted };
}

export function dailyRate(annualRatePct: number): number {
  return annualRatePct / 100 / 365;
}

export function accruedInterest(balance: number, annualRatePct: number, days: number): number {
  return Math.round(balance * dailyRate(annualRatePct) * days * 100) / 100;
}

/** Interest expected on a payment dated `paymentDate` (0 if the loan hadn't originated yet). */
export function expectedInterest(
  paymentDate: string,
  balance: number,
  annualRatePct: number,
  originationDate?: string | null,
): number {
  const period = accrualPeriod(paymentDate, originationDate);
  return period ? accruedInterest(balance, annualRatePct, period.days) : 0;
}

export function todayYMD(): string {
  return new Date().toLocaleDateString('en-CA');
}

function ymd(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type PaymentLike = { payment_date: string; principal_amount: number; interest_amount: number };
export type LoanTerms   = { loan_amount: number; interest_rate: number; origination_date?: string | null };
export type PeriodInterest = AccrualPeriod & { balance: number; accrued: number; due: number };

export type InterestOwed = {
  /** Completed accrual months (through the month before the payment) that still have interest unpaid. */
  periods: PeriodInterest[];
  totalDue: number;
  /** Interest accruing in the payment's own month, up to the payment date — not due until next month. */
  accruing: PeriodInterest | null;
};

function balanceBefore(loan: LoanTerms, payments: PaymentLike[], dateExclusive: string): number {
  const principal = payments
    .filter(p => p.payment_date < dateExclusive)
    .reduce((s, p) => s + p.principal_amount, 0);
  return Math.max(0, loan.loan_amount - principal);
}

/**
 * All interest owed as of `paymentDate`. Accrues every month from origination (or the month before the
 * first payment, if origination is unknown) and applies interest already recorded oldest-month-first,
 * so missed months carry forward. Small residuals (≤ max($1, 3%)) — e.g. from older payments recorded
 * at rate/12 — are not treated as arrears.
 */
export function interestOwed(
  paymentDate: string,
  loan: LoanTerms,
  payments: PaymentLike[],
  maxMonths = 120,
): InterestOwed | null {
  const pay = parseYMD(paymentDate);
  if (!pay) return null;
  const orig = parseYMD(loan.origination_date);

  const lastMonth = new Date(pay.getFullYear(), pay.getMonth() - 1, 1);
  let firstMonth: Date;
  if (orig) {
    firstMonth = new Date(orig.getFullYear(), orig.getMonth(), 1);
  } else {
    const earliest = payments.map(p => p.payment_date).sort()[0];
    const e = parseYMD(earliest);
    firstMonth = e ? new Date(e.getFullYear(), e.getMonth() - 1, 1) : lastMonth;
  }
  const minMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() - maxMonths + 1, 1);
  if (firstMonth < minMonth) firstMonth = minMonth;

  const all: PeriodInterest[] = [];
  for (let m = firstMonth; m <= lastMonth; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const collectDate = ymd(new Date(m.getFullYear(), m.getMonth() + 1, 1));
    const period = accrualPeriod(collectDate, loan.origination_date);
    if (!period || period.notStarted || period.days <= 0) continue;
    const balance = balanceBefore(loan, payments, collectDate);
    const accrued = accruedInterest(balance, loan.interest_rate, period.days);
    all.push({ ...period, balance, accrued, due: accrued });
  }

  // Current month, accrued up to (not including) the payment date
  const monthStart   = new Date(pay.getFullYear(), pay.getMonth(), 1);
  const accrueStart  = orig && orig > monthStart ? orig : monthStart;
  const accruingDays = Math.round((pay.getTime() - accrueStart.getTime()) / 86_400_000);
  let accruing: PeriodInterest | null = null;
  if (accruingDays > 0) {
    const balance = balanceBefore(loan, payments, paymentDate);
    const accrued = accruedInterest(balance, loan.interest_rate, accruingDays);
    accruing = {
      periodStart: accrueStart,
      periodEnd: new Date(pay.getFullYear(), pay.getMonth(), pay.getDate() - 1),
      days: accruingDays, notStarted: false, balance, accrued, due: accrued,
    };
  }

  // Apply recorded interest oldest-first
  let pool = payments
    .filter(p => p.payment_date <= paymentDate)
    .reduce((s, p) => s + p.interest_amount, 0);
  for (const p of accruing ? [...all, accruing] : all) {
    const applied = Math.min(pool, p.due);
    p.due = round2(p.due - applied);
    pool -= applied;
  }

  const periods = all.filter(p => p.due > Math.max(1, p.accrued * 0.03));
  return {
    periods,
    totalDue: round2(periods.reduce((s, p) => s + p.due, 0)),
    accruing,
  };
}
