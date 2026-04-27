'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AllPayment, MissingInterestMonth } from '@/app/actions';
import { LogoMark } from '@/app/components/Logo';

function currency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

function monthLabel(yyyyMM: string) {
  const [y, m] = yyyyMM.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function accrualChipLabel(yyyyMM: string) {
  const [y, m] = yyyyMM.split('-');
  const accrualDate = new Date(Number(y), Number(m) - 1, 1);
  const dueDate     = new Date(Number(y), Number(m), 1); // next month
  const accrual = accrualDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const due     = dueDate.toLocaleString('en-US', { month: 'long' });
  return `${accrual} → due ${due}`;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function PaymentsView({ payments, warnings }: { payments: AllPayment[]; warnings: MissingInterestMonth[] }) {
  const [yearFilter, setYearFilter]   = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');

  const years = [...new Set(payments.map(p => p.payment_date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));

  /* year-filtered; used to derive available months */
  const yearFiltered = yearFilter === 'all' ? payments : payments.filter(p => p.payment_date.startsWith(yearFilter));

  /* months present in the current year selection */
  const availableMonths = [...new Set(yearFiltered.map(p => p.payment_date.slice(5, 7)))].sort();

  /* reset month when year changes */
  function handleYearChange(y: string) {
    setYearFilter(y);
    setMonthFilter('all');
  }

  /* final filtered list */
  const filtered = monthFilter === 'all'
    ? yearFiltered
    : yearFiltered.filter(p => p.payment_date.slice(5, 7) === monthFilter);

  /* group by YYYY-MM, preserving desc order */
  const groups = filtered.reduce<Record<string, AllPayment[]>>((acc, p) => {
    const key = p.payment_date.slice(0, 7);
    (acc[key] ??= []).push(p);
    return acc;
  }, {});
  const sortedMonths = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  /* all-time KPIs (unaffected by filters) */
  const kpiPaid      = payments.reduce((s, p) => s + p.amount_paid, 0);
  const kpiPrincipal = payments.reduce((s, p) => s + p.principal_amount, 0);
  const kpiInterest  = payments.reduce((s, p) => s + p.interest_amount, 0);
  const kpiLateFees  = payments.reduce((s, p) => s + p.late_fee, 0);

  /* active filter label */
  const filterLabel = [
    yearFilter !== 'all' ? yearFilter : null,
    monthFilter !== 'all' ? MONTH_NAMES[parseInt(monthFilter) - 1] : null,
  ].filter(Boolean).join(' · ') || 'All Payments by Month';

  /* warnings filtered to selected year (or all if no year selected) */
  const visibleWarnings = yearFilter === 'all'
    ? warnings
    : warnings.filter(w => w.missing_month.startsWith(yearFilter));

  return (
    <div className="min-h-screen bg-[#F2F5FB]">

      {/* ── Header ── */}
      <header className="bg-gradient-to-r from-[#080F2A] via-[#0D1D5C] to-[#080F2A] shadow-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-1.5 text-indigo-300/60 hover:text-indigo-200 transition-colors text-sm font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Dashboard
            </Link>
            <span className="text-indigo-300/20 text-lg">/</span>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white"><LogoMark className="w-4 h-4" /></div>
              <div>
                <p className="text-white font-bold text-[15px] leading-none">Payment History</p>
                <p className="text-indigo-300/50 text-[10px] mt-0.5 tracking-[0.15em] font-medium">ALL LOANS · MONTHLY VIEW</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-7 space-y-6">

        {/* ── KPI row (all-time) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI label="Total Received"     value={currency(kpiPaid)}      border="border-l-indigo-500"  sub={`${payments.length} payment${payments.length !== 1 ? 's' : ''}`} />
          <KPI label="Principal Paid"     value={currency(kpiPrincipal)} border="border-l-emerald-500" sub="all time" />
          <KPI label="Interest Collected" value={currency(kpiInterest)}  border="border-l-amber-500"   sub="all time" />
          <KPI label="Late Fees"          value={currency(kpiLateFees)}  border="border-l-red-400"     sub="all time" />
        </div>

        {/* ── Missing Interest Warnings ── */}
        {visibleWarnings.length > 0 && <MissingInterestPanel warnings={visibleWarnings} yearFilter={yearFilter} />}

        {/* ── Filters + title ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-700">
            {filterLabel}
            <span className="ml-2 text-xs font-normal text-slate-400">
              {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            </span>
          </p>
          {years.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={yearFilter}
                onChange={e => handleYearChange(e.target.value)}
                className="flex-1 sm:flex-none border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
              >
                <option value="all">All Years</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                value={monthFilter}
                onChange={e => setMonthFilter(e.target.value)}
                disabled={availableMonths.length === 0}
                className="flex-1 sm:flex-none border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all disabled:opacity-40"
              >
                <option value="all">All Months</option>
                {availableMonths.map(m => (
                  <option key={m} value={m}>{MONTH_NAMES[parseInt(m) - 1]}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ── Monthly groups ── */}
        {payments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-24 flex flex-col items-center gap-3 text-slate-400">
            <svg className="w-12 h-12 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-sm">No payments recorded yet.</p>
          </div>
        ) : sortedMonths.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center text-sm text-slate-400">
            No payments found for {filterLabel}.
          </div>
        ) : sortedMonths.map(month => {
          const rows = groups[month];
          const mPaid      = rows.reduce((s, p) => s + p.amount_paid, 0);
          const mPrincipal = rows.reduce((s, p) => s + p.principal_amount, 0);
          const mInterest  = rows.reduce((s, p) => s + p.interest_amount, 0);
          const mLateFees  = rows.reduce((s, p) => s + p.late_fee, 0);

          return (
            <div key={month} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

              {/* month header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{monthLabel(month)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{rows.length} payment{rows.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-6 text-right">
                  <MonthStat label="Total"     value={currency(mPaid)}      color="text-slate-800" />
                  <MonthStat label="Principal" value={currency(mPrincipal)} color="text-emerald-700" />
                  <MonthStat label="Interest"  value={currency(mInterest)}  color="text-amber-700" />
                  {mLateFees > 0 && <MonthStat label="Late Fees" value={currency(mLateFees)} color="text-red-500" />}
                </div>
              </div>

              {/* Mobile payment cards */}
              <div className="sm:hidden divide-y divide-slate-50">
                {rows.map(p => (
                  <div key={p.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-slate-700">{p.payment_date}</span>
                          <Link href={`/loans/${p.loan_id}`} className="font-mono text-[10px] text-indigo-500 hover:text-indigo-700">
                            {p.loan_number}
                          </Link>
                        </div>
                        <p className="font-bold text-slate-800">{p.first_name} {p.last_name}</p>
                        <p className="text-base font-black text-slate-900 mt-0.5">{currency(p.amount_paid)}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs">
                          <span className="text-slate-500">Principal <span className="font-bold text-emerald-700">{currency(p.principal_amount)}</span></span>
                          <span className="text-slate-500">Interest <span className="font-bold text-amber-700">{currency(p.interest_amount)}</span></span>
                          {p.late_fee > 0 && <span className="text-slate-500">Late fee <span className="font-bold text-red-500">{currency(p.late_fee)}</span></span>}
                        </div>
                        {p.notes && <p className="text-xs text-slate-400 mt-1">{p.notes}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-50">
                      {['Date', 'Borrower', 'Loan #', 'Amount Paid', 'Principal', 'Interest', 'Late Fee', 'Notes'].map(h => (
                        <th key={h} className="text-left text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.08em] px-5 py-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p, idx) => (
                      <tr key={p.id} className={`group transition-colors hover:bg-indigo-50/40 ${idx < rows.length - 1 ? 'border-b border-slate-50' : ''}`}>
                        <td className="px-5 py-3.5 text-slate-700 font-semibold whitespace-nowrap text-xs">{p.payment_date}</td>
                        <td className="px-5 py-3.5 font-bold text-slate-800 whitespace-nowrap">{p.first_name} {p.last_name}</td>
                        <td className="px-5 py-3.5">
                          <Link href={`/loans/${p.loan_id}`} className="font-mono text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors">
                            {p.loan_number}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 font-bold text-slate-900 whitespace-nowrap">{currency(p.amount_paid)}</td>
                        <td className="px-5 py-3.5 text-emerald-700 font-semibold whitespace-nowrap">{currency(p.principal_amount)}</td>
                        <td className="px-5 py-3.5 text-amber-700 font-semibold whitespace-nowrap">{currency(p.interest_amount)}</td>
                        <td className="px-5 py-3.5 font-semibold whitespace-nowrap">
                          {p.late_fee > 0 ? <span className="text-red-500">{currency(p.late_fee)}</span> : <span className="text-slate-200">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-slate-400 max-w-[180px] truncate text-xs">{p.notes || <span className="text-slate-200">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}

/* ── Missing Interest Panel ─────────────────────────────────── */

function MissingInterestPanel({ warnings, yearFilter }: { warnings: MissingInterestMonth[]; yearFilter: string }) {
  const [collapsed, setCollapsed] = useState(false);

  /* group by loan */
  const byLoan = warnings.reduce<Record<number, { loan_number: string; first_name: string; last_name: string; months: string[] }>>((acc, w) => {
    if (!acc[w.loan_id]) {
      acc[w.loan_id] = { loan_number: w.loan_number, first_name: w.first_name, last_name: w.last_name, months: [] };
    }
    acc[w.loan_id].months.push(w.missing_month);
    return acc;
  }, {});

  const loanEntries = Object.entries(byLoan);
  const totalMissing = warnings.length;

  return (
    <div className="rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
      {/* panel header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-amber-50/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-900">
              Missing Interest Payments
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-black">{totalMissing}</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {loanEntries.length} loan{loanEntries.length !== 1 ? 's' : ''} with gaps
              {yearFilter !== 'all' ? ` in ${yearFilter}` : ' (all time)'}
              {' '}· interest not recorded for {totalMissing} month{totalMissing !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="divide-y divide-amber-50 border-t border-amber-100">
          {loanEntries.map(([loanId, info]) => (
            <div key={loanId} className="flex items-start gap-4 px-5 py-4 bg-amber-50/40">
              {/* borrower */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-sm font-bold text-slate-800">{info.first_name} {info.last_name}</span>
                  <Link
                    href={`/loans/${loanId}`}
                    className="font-mono text-[10.5px] text-indigo-500 hover:text-indigo-700 transition-colors"
                  >
                    {info.loan_number}
                  </Link>
                  <span className="text-[11px] text-amber-700 font-semibold">
                    {info.months.length} month{info.months.length !== 1 ? 's' : ''} missing
                  </span>
                </div>
                {/* month chips */}
                <div className="flex flex-wrap gap-1.5">
                  {info.months.map(m => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 border border-amber-200 text-[11px] font-bold text-amber-800"
                    >
                      <svg className="w-3 h-3 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01" />
                      </svg>
                      {accrualChipLabel(m)}
                    </span>
                  ))}
                </div>
              </div>

              {/* action */}
              <Link
                href={`/loans/${loanId}`}
                className="shrink-0 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors whitespace-nowrap"
              >
                View Ledger →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Shared sub-components ─────────────────────────────────── */

function KPI({ label, value, border, sub }: { label: string; value: string; border: string; sub: string }) {
  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-l-4 ${border}`}>
      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.1em]">{label}</p>
      <p className="text-xl font-black text-slate-800 mt-1 leading-none truncate">{value}</p>
      <p className="text-[11px] text-slate-400 mt-1.5">{sub}</p>
    </div>
  );
}

function MonthStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-black ${color}`}>{value}</p>
    </div>
  );
}
