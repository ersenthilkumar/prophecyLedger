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
