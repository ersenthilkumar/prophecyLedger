'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  addPayment, updatePayment, deletePayment,
  updateLoanStatus, deleteLoan, updateBorrower, updateLoan,
} from '@/app/actions';
import { LogoMark } from '@/app/components/Logo';
import type { LoanRecord, Payment } from '@/app/actions';

const STATUSES = ['application', 'in_review', 'approved', 'active', 'paid_off', 'defaulted'] as const;
const LOAN_TYPES = ['Hard Money', 'Bridge', 'Conventional', 'FHA', 'VA', 'DSCR', 'Interest Only', 'Other'];
const PROPERTY_TYPES = ['Single Family', 'Multi-Family', 'Commercial', 'Land', 'Condo', 'Mixed Use'];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  application: { label: 'Application', bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400'   },
  in_review:   { label: 'In Review',   bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  approved:    { label: 'Approved',    bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  active:      { label: 'Active',      bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  paid_off:    { label: 'Paid Off',    bg: 'bg-teal-50',    text: 'text-teal-700',    dot: 'bg-teal-500'    },
  defaulted:   { label: 'Defaulted',   bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500'     },
};

function currency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}
function currencyCompact(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function pct(n: number) { return n.toFixed(2) + '%'; }
function ltv(loan: number, value: number) {
  if (!value) return '—';
  return (loan / value * 100).toFixed(1) + '%';
}

function calcMonthlyPayment(principal: number, annualRate: number, termMonths: number, interestOnly: boolean): number {
  if (!annualRate) return interestOnly ? 0 : principal / termMonths;
  const r = annualRate / 100 / 12;
  if (interestOnly) return principal * r;
  return principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

export default function LedgerView({ loan, payments: initialPayments }: { loan: LoanRecord; payments: Payment[] }) {
  const router = useRouter();
  const payments = initialPayments;

  const [showAdd, setShowAdd]              = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [yearFilter, setYearFilter]        = useState('all');
  const [isPending, startTransition]       = useTransition();
  const [formError, setFormError]          = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const [showEdit, setShowEdit]   = useState(false);
  const [editTab, setEditTab]     = useState<'borrower' | 'loan'>('borrower');
  const [editError, setEditError] = useState('');

  const sc = STATUS_CONFIG[loan.status] ?? STATUS_CONFIG.application;

  const totalPaid       = payments.reduce((s, p) => s + p.amount_paid, 0);
  const totalPrincipal  = payments.reduce((s, p) => s + p.principal_amount, 0);
  const totalInterest   = payments.reduce((s, p) => s + p.interest_amount, 0);
  const totalLateFees   = payments.reduce((s, p) => s + p.late_fee, 0);
  const outstanding     = Math.max(0, loan.loan_amount - totalPrincipal);
  const paidPct         = loan.loan_amount ? (totalPrincipal / loan.loan_amount) * 100 : 0;
  const isInterestOnly  = loan.loan_type?.toLowerCase().replace(/\s+/g, '_') === 'interest_only';
  const suggestedMonthly = calcMonthlyPayment(loan.loan_amount, loan.interest_rate, loan.loan_term, isInterestOnly);
  const monthlyInterest  = outstanding * (loan.interest_rate / 100 / 12);

  const years = [...new Set(payments.map(p => p.payment_date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  const filteredPayments  = yearFilter === 'all' ? payments : payments.filter(p => p.payment_date.startsWith(yearFilter));
  const filteredPaid      = filteredPayments.reduce((s, p) => s + p.amount_paid, 0);
  const filteredPrincipal = filteredPayments.reduce((s, p) => s + p.principal_amount, 0);
  const filteredInterest  = filteredPayments.reduce((s, p) => s + p.interest_amount, 0);
  const filteredLateFees  = filteredPayments.reduce((s, p) => s + p.late_fee, 0);

  const [amtInput, setAmtInput]        = useState('');
  const [principalInput, setPrincipal] = useState('');
  const [interestInput, setInterest]   = useState('');

  useEffect(() => {
    if (!showAdd) { setAmtInput(''); setPrincipal(''); setInterest(''); }
  }, [showAdd]);

  function handleAmountChange(val: string) {
    setAmtInput(val);
    const amt = parseFloat(val) || 0;
    setInterest(monthlyInterest.toFixed(2));
    setPrincipal(isInterestOnly ? '0.00' : Math.max(0, amt - monthlyInterest).toFixed(2));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    setFormError('');
    const fd = new FormData(formRef.current);
    fd.set('loan_id', String(loan.id));
    startTransition(async () => {
      const res = await addPayment(fd);
      if (res.ok) { setShowAdd(false); router.refresh(); }
      else setFormError(res.error ?? 'Failed to record payment.');
    });
  }

  return (
    <div className="min-h-screen bg-[#F2F5FB]">

      {/* ── Header ── */}
      <header className="bg-gradient-to-r from-[#080F2A] via-[#0D1D5C] to-[#080F2A] shadow-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-1.5 text-indigo-300/60 hover:text-indigo-200 transition-colors text-sm font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Dashboard
            </Link>
            <span className="text-indigo-300/20 text-lg">/</span>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                <LogoMark className="w-4 h-4" />
              </div>
              <div>
                <p className="text-white font-bold text-[15px] leading-none">{loan.first_name} {loan.last_name}</p>
                <p className="text-indigo-300/50 text-[10px] mt-0.5 font-mono tracking-widest">{loan.loan_number}</p>
              </div>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${sc.bg} ${sc.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
            {sc.label}
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-7 space-y-6">

        {/* ── Loan Detail Card ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

          {/* gradient header band */}
          <div className="bg-gradient-to-br from-[#080F2A] via-[#0D1D5C] to-[#0B1437] px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10.5px] text-indigo-300/50 tracking-[0.2em]">{loan.loan_number}</p>
                <h2 className="text-white font-black text-lg mt-0.5">{loan.first_name} {loan.last_name}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${sc.bg} ${sc.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                    {sc.label}
                  </span>
                  <span className="text-indigo-200/50 text-xs font-medium">
                    {currencyCompact(loan.loan_amount)} · {loan.interest_rate}% · {loan.loan_term} mo
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditTab('borrower'); setShowEdit(true); }}
                  className="flex items-center gap-1.5 border border-white/20 hover:border-indigo-300 hover:bg-white/10 transition-colors text-indigo-200 hover:text-white text-xs font-bold px-4 py-2 rounded-xl"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
                <button disabled={isPending}
                  onClick={() => {
                    if (!confirm('Delete this loan record? This cannot be undone.')) return;
                    startTransition(async () => {
                      await deleteLoan(loan.id);
                      router.push('/');
                    });
                  }}
                  className="flex items-center gap-1.5 border border-white/10 hover:border-red-400/50 hover:bg-red-500/10 transition-colors text-indigo-300/50 hover:text-red-400 text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              </div>
            </div>
          </div>

          {/* detail sections */}
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Borrower Information */}
              <div>
                <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-3">Borrower Information</p>
                <div className="space-y-3">
                  <DR label="Borrower"      value={`${loan.first_name} ${loan.last_name}`} />
                  <DR label="Co-Borrower"   value={loan.coborrower_first_name ? `${loan.coborrower_first_name} ${loan.coborrower_last_name ?? ''}`.trim() : '—'} />
                  <DR label="Email"         value={loan.email} />
                  <DR label="Phone"         value={loan.phone} />
                  <DR label="Date of Birth" value={loan.dob} />
                  <DR label="SSN"           value={loan.ssn ? `***-**-${loan.ssn.slice(-4)}` : '—'} />
                  <DR label="Address"       value={[loan.borrower_address, loan.borrower_city, loan.borrower_state, loan.borrower_zip].filter(Boolean).join(', ')} />
                </div>
              </div>

              {/* Property Details */}
              <div>
                <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-3">Property Details</p>
                <div className="space-y-3">
                  <DR label="Address"    value={[loan.property_address, loan.property_city, loan.property_state, loan.property_zip].filter(Boolean).join(', ')} />
                  <DR label="Type"       value={loan.property_type} />
                  <DR label="Est. Value" value={currencyCompact(loan.estimated_value)} />
                  <DR label="Year Built" value={loan.year_built?.toString() ?? '—'} />
                  <DR label="Sq Footage" value={loan.square_footage ? loan.square_footage.toLocaleString() + ' sq ft' : '—'} />
                </div>
              </div>

              {/* Loan Details */}
              <div>
                <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-3">Loan Details</p>
                <div className="space-y-3">
                  <DR label="Loan Amount"      value={currencyCompact(loan.loan_amount)} />
                  <DR label="Wired Amount"     value={loan.wired_amount ? currencyCompact(loan.wired_amount) : '—'} />
                  <DR label="Interest Rate"    value={loan.interest_rate + '%'} />
                  <DR label="LTV"              value={ltv(loan.loan_amount, loan.estimated_value)} />
                  <DR label="Term"             value={loan.loan_term + ' months'} />
                  <DR label="Loan Type"        value={loan.loan_type} />
                  <DR label="Origination"      value={loan.origination_date || '—'} />
                  <DR label="Maturity"         value={loan.maturity_date || '—'} />
                  <DR label="Suggested Monthly" value={currencyCompact(suggestedMonthly)} />
                  {loan.notes && <DR label="Notes" value={loan.notes} />}
                </div>
              </div>
            </div>

            {/* Status update */}
            <div className="pt-4 border-t border-slate-100">
              <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-3">Update Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map(s => {
                  const c = STATUS_CONFIG[s];
                  const active = loan.status === s;
                  return (
                    <button key={s} disabled={isPending}
                      onClick={() => startTransition(async () => {
                        await updateLoanStatus(loan.id, s);
                        router.refresh();
                      })}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all duration-150 disabled:opacity-50 ${
                        active
                          ? `${c.bg} ${c.text} border-transparent ring-1 ring-current`
                          : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${active ? c.dot : 'bg-slate-300'}`} />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <LedgerKPI label="Outstanding Balance" value={currency(outstanding)}   color="border-l-indigo-500" sub={`${pct(paidPct)} paid off`} />
          <LedgerKPI label="Total Paid"          value={currency(totalPaid)}     color="border-l-emerald-500" sub={`${payments.length} payment${payments.length !== 1 ? 's' : ''}`} />
          <LedgerKPI label="Interest Paid"       value={currency(totalInterest)} color="border-l-amber-500" sub="lifetime" />
          <LedgerKPI label="Late Fees"           value={currency(totalLateFees)} color="border-l-red-400" sub="total charged" />
        </div>

        {/* ── Progress bar ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Payoff Progress</span>
            <span className="text-xs font-bold text-indigo-600">{pct(paidPct)}</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, paidPct)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[11px] text-slate-400 font-medium">
            <span>{currency(totalPrincipal)} principal paid</span>
            <span>{currency(outstanding)} remaining</span>
          </div>
        </div>

        {/* ── Payment table ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Payment History</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {yearFilter === 'all'
                  ? `${payments.length} recorded payment${payments.length !== 1 ? 's' : ''}`
                  : `${filteredPayments.length} of ${payments.length} payment${payments.length !== 1 ? 's' : ''} · ${yearFilter}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {years.length > 0 && (
                <select
                  value={yearFilter}
                  onChange={e => setYearFilter(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
                >
                  <option value="all">All Years</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Record Payment
              </button>
            </div>
          </div>

          {/* Mobile payment cards */}
          <div className="sm:hidden">
            {payments.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3 text-slate-400 px-4">
                <svg className="w-10 h-10 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-sm text-center">No payments recorded yet.</p>
              </div>
            ) : filteredPayments.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">No payments in {yearFilter}.</div>
            ) : (
              <>
                <div className="divide-y divide-slate-50">
                  {filteredPayments.map((p, idx) => (
                    <div key={p.id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] font-bold text-slate-400">#{idx + 1}</span>
                            <span className="text-sm font-semibold text-slate-700">{p.payment_date}</span>
                          </div>
                          <p className="text-lg font-black text-slate-900">{currency(p.amount_paid)}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs">
                            <span className="text-slate-500">Principal <span className="font-bold text-emerald-700">{currency(p.principal_amount)}</span></span>
                            <span className="text-slate-500">Interest <span className="font-bold text-amber-700">{currency(p.interest_amount)}</span></span>
                            {p.late_fee > 0 && <span className="text-slate-500">Late fee <span className="font-bold text-red-500">{currency(p.late_fee)}</span></span>}
                          </div>
                          <p className="text-xs font-semibold text-indigo-700 mt-1">Balance: {currency(p.balance_after)}</p>
                          {p.notes && <p className="text-xs text-slate-400 mt-1">{p.notes}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <button disabled={isPending}
                            onClick={() => { setFormError(''); setEditingPayment(p); }}
                            className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 disabled:opacity-50">
                            Edit
                          </button>
                          <button disabled={isPending}
                            onClick={() => {
                              if (!confirm('Delete this payment record?')) return;
                              startTransition(async () => { await deletePayment(p.id, loan.id); router.refresh(); });
                            }}
                            className="text-xs font-semibold text-slate-300 hover:text-red-400 disabled:opacity-50">
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 bg-slate-50/60 border-t border-slate-100">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">{yearFilter === 'all' ? 'Totals' : `${yearFilter} Totals`}</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    <span className="text-slate-500">Paid <span className="font-black text-slate-900">{currency(filteredPaid)}</span></span>
                    <span className="text-slate-500">Principal <span className="font-black text-emerald-700">{currency(filteredPrincipal)}</span></span>
                    <span className="text-slate-500">Interest <span className="font-black text-amber-700">{currency(filteredInterest)}</span></span>
                    {filteredLateFees > 0 && <span className="text-slate-500">Late fees <span className="font-black text-red-500">{currency(filteredLateFees)}</span></span>}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  {['#', 'Date', 'Amount Paid', 'Principal', 'Interest', 'Late Fee', 'Balance After', 'Notes', ''].map(h => (
                    <th key={h} className="text-left text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.08em] px-5 py-3.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <svg className="w-10 h-10 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                            d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <p className="text-sm">No payments recorded yet. Click "Record Payment" to add one.</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center">
                      <p className="text-sm text-slate-400">No payments in {yearFilter}.</p>
                    </td>
                  </tr>
                ) : filteredPayments.map((p, idx) => (
                  <tr key={p.id} className={`group transition-colors hover:bg-indigo-50/40 ${idx < filteredPayments.length - 1 ? 'border-b border-slate-50' : ''}`}>
                    <td className="px-5 py-4 text-xs font-bold text-slate-400">{idx + 1}</td>
                    <td className="px-5 py-4 text-slate-700 font-semibold whitespace-nowrap">{p.payment_date}</td>
                    <td className="px-5 py-4 font-bold text-slate-900 whitespace-nowrap">{currency(p.amount_paid)}</td>
                    <td className="px-5 py-4 text-emerald-700 font-semibold whitespace-nowrap">{currency(p.principal_amount)}</td>
                    <td className="px-5 py-4 text-amber-700 font-semibold whitespace-nowrap">{currency(p.interest_amount)}</td>
                    <td className="px-5 py-4 text-red-500 font-semibold whitespace-nowrap">{p.late_fee > 0 ? currency(p.late_fee) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-5 py-4 font-bold text-indigo-700 whitespace-nowrap">{currency(p.balance_after)}</td>
                    <td className="px-5 py-4 text-slate-400 max-w-[160px] truncate text-xs">{p.notes || <span className="text-slate-200">—</span>}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button disabled={isPending}
                          onClick={() => { setFormError(''); setEditingPayment(p); }}
                          className="text-slate-400 hover:text-indigo-500 transition-colors text-xs font-semibold disabled:opacity-50">
                          Edit
                        </button>
                        <button disabled={isPending}
                          onClick={() => {
                            if (!confirm('Delete this payment record?')) return;
                            startTransition(async () => { await deletePayment(p.id, loan.id); router.refresh(); });
                          }}
                          className="text-slate-300 hover:text-red-400 transition-colors text-xs font-semibold disabled:opacity-50">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {filteredPayments.length > 0 && (
                <tfoot className="border-t border-slate-100 bg-slate-50/60">
                  <tr>
                    <td colSpan={2} className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      {yearFilter === 'all' ? 'Totals' : `${yearFilter} Totals`}
                    </td>
                    <td className="px-5 py-3 font-black text-slate-900 text-sm">{currency(filteredPaid)}</td>
                    <td className="px-5 py-3 font-black text-emerald-700 text-sm">{currency(filteredPrincipal)}</td>
                    <td className="px-5 py-3 font-black text-amber-700 text-sm">{currency(filteredInterest)}</td>
                    <td className="px-5 py-3 font-black text-red-500 text-sm">{filteredLateFees > 0 ? currency(filteredLateFees) : <span className="text-slate-300">—</span>}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </main>

      {/* ── Edit Loan/Borrower Modal ── */}
      {showEdit && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) setShowEdit(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] ring-1 ring-black/5">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-900">Edit Record</h2>
                <p className="text-xs text-slate-400 mt-0.5">{loan.first_name} {loan.last_name} · {loan.loan_number}</p>
              </div>
              <button
                onClick={() => setShowEdit(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors text-lg"
              >✕</button>
            </div>

            <div className="px-6 pt-4 flex gap-1 shrink-0">
              {(['borrower', 'loan'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setEditTab(tab); setEditError(''); }}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                    editTab === tab ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {tab === 'borrower' ? 'Borrower Details' : 'Loan Details'}
                </button>
              ))}
            </div>

            <form
              key={loan.id + '-' + editTab}
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setEditError('');
                startTransition(async () => {
                  const res = editTab === 'borrower'
                    ? await updateBorrower(loan.borrower_id, fd)
                    : await updateLoan(loan.id, fd);
                  if (res.ok) { setShowEdit(false); router.refresh(); }
                  else setEditError(res.error ?? 'Failed to save.');
                });
              }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                {editTab === 'borrower' ? (
                  <>
                    <FormSection>Personal Information</FormSection>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="First Name" name="first_name" required defaultValue={loan.first_name} />
                      <Field label="Last Name"  name="last_name"  required defaultValue={loan.last_name} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Email" name="email" type="email" defaultValue={loan.email} />
                      <Field label="Phone" name="phone" type="tel"   defaultValue={loan.phone} />
                    </div>
                    <FormSection>Address</FormSection>
                    <Field label="Street Address" name="borrower_address" defaultValue={loan.borrower_address} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <Field label="City"  name="borrower_city"  defaultValue={loan.borrower_city} />
                      <Field label="State" name="borrower_state" defaultValue={loan.borrower_state} />
                      <Field label="ZIP"   name="borrower_zip"   defaultValue={loan.borrower_zip} />
                    </div>
                    <FormSection>Co-Borrower (optional)</FormSection>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Co-Borrower First Name" name="coborrower_first_name" defaultValue={loan.coborrower_first_name ?? ''} />
                      <Field label="Co-Borrower Last Name"  name="coborrower_last_name"  defaultValue={loan.coborrower_last_name ?? ''} />
                    </div>
                    <FormSection>Identity</FormSection>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Date of Birth" name="dob" type="date" defaultValue={loan.dob} />
                      <Field label="SSN" name="ssn" placeholder="XXX-XX-XXXX" defaultValue={loan.ssn ?? ''} />
                    </div>
                  </>
                ) : (
                  <>
                    <FormSection>Loan Terms</FormSection>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Loan Amount ($)"   name="loan_amount"   type="number" required defaultValue={loan.loan_amount?.toString()} />
                      <Field label="Wired Amount ($)"  name="wired_amount"  type="number" defaultValue={loan.wired_amount?.toString()} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Interest Rate (%)" name="interest_rate" type="number" required defaultValue={loan.interest_rate?.toString()} step="0.01" />
                      <Field label="Term (months)"     name="loan_term"     type="number" required defaultValue={loan.loan_term?.toString()} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <SelectField label="Loan Type" name="loan_type" options={LOAN_TYPES} defaultValue={loan.loan_type} />
                    </div>
                    <FormSection>Timeline</FormSection>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Origination Date" name="origination_date" type="date" defaultValue={loan.origination_date ?? ''} />
                      <Field label="Maturity Date"    name="maturity_date"    type="date" defaultValue={loan.maturity_date ?? ''} />
                    </div>
                    <FormSection>Status & Notes</FormSection>
                    <SelectField label="Status" name="status" options={STATUSES.map(s => STATUS_CONFIG[s].label)} values={[...STATUSES]} defaultValue={loan.status} />
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">Notes</label>
                      <textarea
                        name="notes" rows={3}
                        defaultValue={loan.notes ?? ''}
                        placeholder="Optional loan notes…"
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none transition shadow-sm"
                      />
                    </div>
                  </>
                )}
                {editError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-500 text-xs">{editError}</div>
                )}
              </div>
              <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl shrink-0">
                <button type="button" onClick={() => setShowEdit(false)} className="text-sm text-slate-500 hover:text-slate-800 font-semibold transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={isPending}
                  className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  {isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Payment Modal ── */}
      {editingPayment && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) setEditingPayment(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg ring-1 ring-black/5">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Edit Payment</h2>
                <p className="text-xs text-slate-400 mt-0.5">{loan.loan_number} · {editingPayment.payment_date}</p>
              </div>
              <button onClick={() => setEditingPayment(null)} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors text-lg">✕</button>
            </div>
            <form
              key={editingPayment.id}
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                fd.set('loan_id', String(loan.id));
                setFormError('');
                startTransition(async () => {
                  const res = await updatePayment(editingPayment.id, fd);
                  if (res.ok) { setEditingPayment(null); router.refresh(); }
                  else setFormError(res.error ?? 'Failed to update payment.');
                });
              }}
              className="p-6 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Payment Date <span className="text-red-400">*</span></label>
                  <input type="date" name="payment_date" required defaultValue={editingPayment.payment_date}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Amount Paid ($) <span className="text-red-400">*</span></label>
                  <input type="number" name="amount_paid" required step="0.01" defaultValue={editingPayment.amount_paid.toFixed(2)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Principal ($)</label>
                  <input type="number" name="principal_amount" step="0.01" defaultValue={editingPayment.principal_amount.toFixed(2)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Interest ($)</label>
                  <input type="number" name="interest_amount" step="0.01" defaultValue={editingPayment.interest_amount.toFixed(2)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Late Fee ($)</label>
                  <input type="number" name="late_fee" step="0.01" defaultValue={editingPayment.late_fee.toFixed(2)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Notes</label>
                <input type="text" name="notes" defaultValue={editingPayment.notes ?? ''} placeholder="e.g. Check #1234, wire transfer…"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
              </div>
              {formError && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-500 text-xs">{formError}</div>}
              <div className="flex justify-between items-center pt-1">
                <button type="button" onClick={() => setEditingPayment(null)} className="text-sm text-slate-500 hover:text-slate-800 font-semibold transition-colors">Cancel</button>
                <button type="submit" disabled={isPending}
                  className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-sm disabled:opacity-50">
                  {isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Payment Modal ── */}
      {showAdd && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) setShowAdd(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg ring-1 ring-black/5">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Record Payment</h2>
                <p className="text-xs text-slate-400 mt-0.5">{loan.loan_number} · {loan.first_name} {loan.last_name}</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors text-lg">✕</button>
            </div>
            <form ref={formRef} onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Payment Date <span className="text-red-400">*</span></label>
                  <input type="date" name="payment_date" required defaultValue={new Date().toISOString().split('T')[0]}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Amount Paid ($) <span className="text-red-400">*</span></label>
                  <input type="number" name="amount_paid" required placeholder={suggestedMonthly.toFixed(2)} step="0.01"
                    value={amtInput}
                    onChange={e => handleAmountChange(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100">
                <svg className="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[11px] text-indigo-600">
                  {isInterestOnly ? 'Interest-only loan — ' : ''}Suggested: <strong>{currency(suggestedMonthly)}/mo</strong> · Interest portion: <strong>{currency(monthlyInterest)}</strong> · Outstanding: <strong>{currency(outstanding)}</strong>
                  {isInterestOnly && <span className="ml-1 text-indigo-400">(principal not reduced)</span>}
                  <span className="ml-1 text-indigo-400">· This payment covers {new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleString('en-US', { month: 'long' })}'s accrued interest</span>
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Principal ($)</label>
                  <input type="number" name="principal_amount" step="0.01" placeholder="0.00"
                    value={principalInput} onChange={e => setPrincipal(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Interest ($)</label>
                  <input type="number" name="interest_amount" step="0.01" placeholder="0.00"
                    value={interestInput} onChange={e => setInterest(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Late Fee ($)</label>
                  <input type="number" name="late_fee" step="0.01" placeholder="0.00"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Notes</label>
                <input type="text" name="notes" placeholder="e.g. Check #1234, wire transfer…"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
              </div>
              {formError && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-500 text-xs">{formError}</div>}
              <div className="flex justify-between items-center pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="text-sm text-slate-500 hover:text-slate-800 font-semibold transition-colors">Cancel</button>
                <button type="submit" disabled={isPending}
                  className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-sm disabled:opacity-50">
                  {isPending ? 'Saving…' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DR({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.08em]">{label}</p>
      <p className="text-sm font-semibold text-slate-700 mt-0.5 break-words">{value || '—'}</p>
    </div>
  );
}

function FormSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.1em] whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  );
}

function Field({ label, name, type = 'text', required = false, placeholder = '', step, defaultValue }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string; step?: string; defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={type} name={name} required={required} placeholder={placeholder} step={step} defaultValue={defaultValue}
        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
      />
    </div>
  );
}

function SelectField({ label, name, options, values, defaultValue }: {
  label: string; name: string; options: string[]; values?: string[]; defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 mb-1.5">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
      >
        {options.map((opt, i) => (
          <option key={opt} value={values ? values[i] : opt.toLowerCase().replace(/\s+/g, '_')}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

function LedgerKPI({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-l-4 ${color}`}>
      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.1em]">{label}</p>
      <p className="text-xl font-black text-slate-800 mt-1 leading-none truncate">{value}</p>
      <p className="text-[11px] text-slate-400 mt-1.5">{sub}</p>
    </div>
  );
}
