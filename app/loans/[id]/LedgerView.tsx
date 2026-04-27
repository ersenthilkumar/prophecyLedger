'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { addPayment, updatePayment, deletePayment } from '@/app/actions';
import { LogoMark } from '@/app/components/Logo';
import type { LoanRecord, Payment } from '@/app/actions';

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
function pct(n: number) { return n.toFixed(2) + '%'; }

function calcMonthlyPayment(principal: number, annualRate: number, termMonths: number, interestOnly: boolean): number {
  if (!annualRate) return interestOnly ? 0 : principal / termMonths;
  const r = annualRate / 100 / 12;
  if (interestOnly) return principal * r;
  return principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

export default function LedgerView({ loan, payments: initialPayments }: { loan: LoanRecord; payments: Payment[] }) {
  const router       = useRouter();
  const payments     = initialPayments;
  const [showAdd, setShowAdd]              = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [yearFilter, setYearFilter]        = useState('all');
  const [isPending, startTransition]       = useTransition();
  const [formError, setFormError]          = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const sc = STATUS_CONFIG[loan.status] ?? STATUS_CONFIG.application;

  /* ── Derived stats ── */
  const totalPaid       = payments.reduce((s, p) => s + p.amount_paid, 0);
  const totalPrincipal  = payments.reduce((s, p) => s + p.principal_amount, 0);
  const totalInterest   = payments.reduce((s, p) => s + p.interest_amount, 0);
  const totalLateFees   = payments.reduce((s, p) => s + p.late_fee, 0);
  const outstanding     = Math.max(0, loan.loan_amount - totalPrincipal);
  const paidPct         = loan.loan_amount ? (totalPrincipal / loan.loan_amount) * 100 : 0;
  const isInterestOnly   = loan.loan_type?.toLowerCase().replace(/\s+/g, '_') === 'interest_only';
  const suggestedMonthly = calcMonthlyPayment(loan.loan_amount, loan.interest_rate, loan.loan_term, isInterestOnly);
  const monthlyInterest  = outstanding * (loan.interest_rate / 100 / 12);

  /* ── Year filter ── */
  const years = [...new Set(payments.map(p => p.payment_date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  const filteredPayments = yearFilter === 'all' ? payments : payments.filter(p => p.payment_date.startsWith(yearFilter));
  const filteredPaid      = filteredPayments.reduce((s, p) => s + p.amount_paid, 0);
  const filteredPrincipal = filteredPayments.reduce((s, p) => s + p.principal_amount, 0);
  const filteredInterest  = filteredPayments.reduce((s, p) => s + p.interest_amount, 0);
  const filteredLateFees  = filteredPayments.reduce((s, p) => s + p.late_fee, 0);

  /* ── Add payment form state for auto-calc ── */
  const [amtInput, setAmtInput]         = useState('');
  const [principalInput, setPrincipal]  = useState('');
  const [interestInput, setInterest]    = useState('');

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
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white"><LogoMark className="w-4 h-4" /></div>
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

        {/* ── Loan summary card ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex flex-wrap gap-4 sm:gap-8 text-sm">
            <SummaryItem label="Borrower"       value={`${loan.first_name} ${loan.last_name}`} />
            {loan.coborrower_first_name && (
              <SummaryItem label="Co-Borrower"  value={`${loan.coborrower_first_name} ${loan.coborrower_last_name ?? ''}`.trim()} />
            )}
            <SummaryItem label="Loan Amount"    value={currency(loan.loan_amount)} large />
            {loan.wired_amount > 0 && (
              <SummaryItem label="Wired Amount" value={currency(loan.wired_amount)} large />
            )}
            <SummaryItem label="Interest Rate"  value={pct(loan.interest_rate)} />
            <SummaryItem label="Term"           value={`${loan.loan_term} months`} />
            <SummaryItem label="Loan Type"      value={loan.loan_type} />
            <SummaryItem label="Origination"    value={loan.origination_date || '—'} />
            <SummaryItem label="Maturity"       value={loan.maturity_date || '—'} />
            <SummaryItem label="Suggested Monthly" value={currency(suggestedMonthly)} />
          </div>
        </div>

        {/* ── KPI row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <LedgerKPI label="Outstanding Balance" value={currency(outstanding)}    color="border-l-indigo-500" sub={`${pct(paidPct)} paid off`} />
          <LedgerKPI label="Total Paid"          value={currency(totalPaid)}      color="border-l-emerald-500" sub={`${payments.length} payment${payments.length !== 1 ? 's' : ''}`} />
          <LedgerKPI label="Interest Paid"       value={currency(totalInterest)}  color="border-l-amber-500" sub="lifetime" />
          <LedgerKPI label="Late Fees"           value={currency(totalLateFees)}  color="border-l-red-400" sub="total charged" />
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

            {/* key forces remount with fresh defaultValues each time a different payment is opened */}
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
                  <input type="date" name="payment_date" required
                    defaultValue={editingPayment.payment_date}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Amount Paid ($) <span className="text-red-400">*</span></label>
                  <input type="number" name="amount_paid" required step="0.01"
                    defaultValue={editingPayment.amount_paid.toFixed(2)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Principal ($)</label>
                  <input type="number" name="principal_amount" step="0.01"
                    defaultValue={editingPayment.principal_amount.toFixed(2)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Interest ($)</label>
                  <input type="number" name="interest_amount" step="0.01"
                    defaultValue={editingPayment.interest_amount.toFixed(2)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Late Fee ($)</label>
                  <input type="number" name="late_fee" step="0.01"
                    defaultValue={editingPayment.late_fee.toFixed(2)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Notes</label>
                <input type="text" name="notes"
                  defaultValue={editingPayment.notes ?? ''}
                  placeholder="e.g. Check #1234, wire transfer…"
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
                  <input type="date" name="payment_date" required
                    defaultValue={new Date().toISOString().split('T')[0]}
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

              {/* auto-hint */}
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

              <div className="grid grid-cols-3 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Principal ($)</label>
                  <input type="number" name="principal_amount" step="0.01" placeholder="0.00"
                    value={principalInput}
                    onChange={e => setPrincipal(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Interest ($)</label>
                  <input type="number" name="interest_amount" step="0.01" placeholder="0.00"
                    value={interestInput}
                    onChange={e => setInterest(e.target.value)}
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

function SummaryItem({ label, value, large = false }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.1em]">{label}</p>
      <p className={`font-bold text-slate-800 mt-0.5 ${large ? 'text-xl' : 'text-sm'}`}>{value}</p>
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
