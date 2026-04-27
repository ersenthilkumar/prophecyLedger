'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { addLoan, updateLoanStatus, deleteLoan, updateBorrower, updateLoan } from '../actions';
import { signOutAction } from '../actions/auth';
import { LogoMark } from './Logo';
import type { LoanRecord, LoanAlert } from '../actions';

type Step = 1 | 2 | 3;

const LOAN_TYPES     = ['Hard Money', 'Bridge', 'Conventional', 'FHA', 'VA', 'DSCR', 'Interest Only', 'Other'];
const PROPERTY_TYPES = ['Single Family', 'Multi-Family', 'Commercial', 'Land', 'Condo', 'Mixed Use'];
const STATUSES = ['application', 'in_review', 'approved', 'active', 'paid_off', 'defaulted'] as const;

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  application: { label: 'Application', bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400'   },
  in_review:   { label: 'In Review',   bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  approved:    { label: 'Approved',    bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  active:      { label: 'Active',      bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  paid_off:    { label: 'Paid Off',    bg: 'bg-teal-50',    text: 'text-teal-700',    dot: 'bg-teal-500'    },
  defaulted:   { label: 'Defaulted',   bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500'     },
};

const STEP_LABELS: Record<Step, string> = { 1: 'Borrower Info', 2: 'Property Details', 3: 'Loan Details' };

function currency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function ltv(loan: number, value: number) {
  if (!value) return '—';
  return (loan / value * 100).toFixed(1) + '%';
}

/* ── Icons ─────────────────────────────────────────────────── */
const IDoc = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const IActivity = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);
const IDollar = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IPercent = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
  </svg>
);
const ISearch = () => (
  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);
const IPlus = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
  </svg>
);
const IEmpty = () => (
  <svg className="w-12 h-12 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

/* ── Main component ─────────────────────────────────────────── */
export default function LoanTracker({ initialLoans, alerts, userName }: { initialLoans: LoanRecord[]; alerts: LoanAlert[]; userName: string }) {
  const router = useRouter();
  const loans  = initialLoans;

  const [showAdd, setShowAdd]           = useState(false);
  const [step, setStep]                 = useState<Step>(1);
  const [selectedLoan, setSelectedLoan] = useState<LoanRecord | null>(null);
  const [showEdit, setShowEdit]         = useState(false);
  const [editTab, setEditTab]           = useState<'borrower' | 'loan'>('borrower');
  const [editError, setEditError]       = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch]             = useState('');
  const [isPending, startTransition]    = useTransition();
  const [formError, setFormError]       = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const filtered = loans.filter(l => {
    const matchStatus = filterStatus === 'all' || l.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q
      || `${l.first_name} ${l.last_name}`.toLowerCase().includes(q)
      || (l.property_address ?? '').toLowerCase().includes(q)
      || (l.loan_number ?? '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const activeLoans    = loans.filter(l => l.status === 'active');
  const totalPortfolio = activeLoans.reduce((s, l) => s + l.loan_amount, 0);
  const avgRate        = loans.length ? loans.reduce((s, l) => s + l.interest_rate, 0) / loans.length : 0;

  function closeAdd() {
    setShowAdd(false); setStep(1); setFormError(''); formRef.current?.reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    setFormError('');
    const fd = new FormData(formRef.current);
    startTransition(async () => {
      const res = await addLoan(fd);
      if (res.ok) { closeAdd(); router.refresh(); }
      else setFormError(res.error ?? 'Failed to save loan.');
    });
  }

  /* ── Determine active view ── */
  const view: 'add' | 'detail' | 'list' = showAdd ? 'add' : selectedLoan ? 'detail' : 'list';

  return (
    <div className="min-h-screen bg-[#F2F5FB]">

      {/* ── Header ───────────────────────────────────────── */}
      <header className="bg-gradient-to-r from-[#080F2A] via-[#0D1D5C] to-[#080F2A] shadow-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">

          {/* Logo — always visible */}
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/" onClick={() => { setSelectedLoan(null); setShowAdd(false); }} className="flex items-center gap-3.5 group shrink-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-900/40">
                <LogoMark className="w-6 h-6" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-white font-bold text-[17px] leading-none tracking-tight group-hover:text-indigo-200 transition-colors">Prophecy Capital</h1>
                <p className="text-indigo-300/50 text-[10px] mt-1 tracking-[0.15em] font-medium">PROPHECYLEDGER · LOAN TRACKING</p>
              </div>
            </Link>

            {/* Breadcrumb when viewing detail */}
            {view === 'detail' && selectedLoan && (
              <>
                <span className="text-indigo-300/20 text-lg hidden sm:inline">/</span>
                <div className="hidden sm:block min-w-0">
                  <p className="text-white font-bold text-[15px] leading-none truncate">{selectedLoan.first_name} {selectedLoan.last_name}</p>
                  <p className="text-indigo-300/50 text-[10px] mt-0.5 font-mono tracking-widest">{selectedLoan.loan_number}</p>
                </div>
              </>
            )}
          </div>

          {/* Right-side controls */}
          {view === 'add' ? (
            <button
              onClick={closeAdd}
              className="flex items-center gap-1.5 text-indigo-300/60 hover:text-indigo-200 transition-colors text-sm font-medium px-3 py-2 rounded-xl hover:bg-white/5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="hidden sm:inline">Cancel</span>
            </button>
          ) : view === 'detail' ? (
            <button
              onClick={() => setSelectedLoan(null)}
              className="flex items-center gap-1.5 text-indigo-300/60 hover:text-indigo-200 transition-colors text-sm font-medium px-3 py-2 rounded-xl hover:bg-white/5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Back to Loans</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/suggestions" className="flex items-center gap-1.5 text-indigo-300/60 hover:text-indigo-200 transition-colors text-sm font-medium px-3 py-2 rounded-xl hover:bg-white/5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <span className="hidden sm:inline">Suggestions</span>
              </Link>
              <Link href="/payments" className="flex items-center gap-1.5 text-indigo-300/60 hover:text-indigo-200 transition-colors text-sm font-medium px-3 py-2 rounded-xl hover:bg-white/5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="hidden sm:inline">Payments</span>
              </Link>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 active:scale-95 transition-all duration-150 text-white text-sm font-bold px-3 sm:px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-900/30"
              >
                <IPlus /> <span className="hidden sm:inline">Add New Loan</span>
              </button>
              <div className="hidden sm:flex items-center gap-2 pl-1 border-l border-white/10 ml-1">
                {userName && <span className="text-indigo-300/50 text-xs font-medium truncate max-w-[120px]">{userName}</span>}
                <form action={signOutAction}>
                  <button type="submit" title="Sign out" className="flex items-center gap-1.5 text-indigo-300/60 hover:text-red-400 transition-colors text-sm font-medium px-2.5 py-2 rounded-xl hover:bg-white/5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </form>
              </div>
              <form action={signOutAction} className="sm:hidden">
                <button type="submit" title="Sign out" className="flex items-center text-indigo-300/60 hover:text-red-400 transition-colors px-2 py-2 rounded-xl hover:bg-white/5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      {/* ── Add Loan Form ──────────────────────────────────── */}
      {view === 'add' && (
        <main className="max-w-2xl mx-auto px-6 py-8">
          <div className="mb-6">
            <h2 className="text-xl font-black text-slate-900">Add New Loan</h2>
            <p className="text-xs text-slate-400 mt-1">Step {step} of 3 — {STEP_LABELS[step]}</p>
          </div>
          <div className="mb-6">
            <div className="flex items-start">
              {([1, 2, 3] as Step[]).map((n, i) => (
                <div key={n} className="flex items-start flex-1 last:flex-none">
                  <button type="button" onClick={() => setStep(n)} className="flex flex-col items-center gap-1.5 shrink-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                      step === n ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                      : step > n  ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 text-slate-400'
                    }`}>
                      {step > n ? '✓' : n}
                    </div>
                    <span className={`text-[10px] font-semibold whitespace-nowrap ${step === n ? 'text-indigo-600' : step > n ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {STEP_LABELS[n]}
                    </span>
                  </button>
                  {i < 2 && <div className={`flex-1 h-0.5 mt-4 mx-2 transition-colors duration-300 ${step > n ? 'bg-emerald-300' : 'bg-slate-100'}`} />}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <form ref={formRef} onSubmit={handleSubmit}>
              <div className="px-6 py-6 space-y-4">
                <div className={step === 1 ? 'space-y-4' : 'hidden'}>
                  <FormSection>Personal Information</FormSection>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="First Name" name="first_name" required />
                    <Field label="Last Name"  name="last_name"  required />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Email" name="email" type="email" />
                    <Field label="Phone" name="phone" type="tel" />
                  </div>
                  <FormSection>Address</FormSection>
                  <Field label="Street Address" name="borrower_address" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Field label="City"  name="borrower_city" />
                    <Field label="State" name="borrower_state" />
                    <Field label="ZIP"   name="borrower_zip" />
                  </div>
                  <FormSection>Co-Borrower (optional)</FormSection>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Co-Borrower First Name" name="coborrower_first_name" />
                    <Field label="Co-Borrower Last Name"  name="coborrower_last_name" />
                  </div>
                  <FormSection>Identity</FormSection>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Date of Birth" name="dob" type="date" />
                    <Field label="SSN" name="ssn" placeholder="XXX-XX-XXXX" />
                  </div>
                </div>
                <div className={step === 2 ? 'space-y-4' : 'hidden'}>
                  <FormSection>Location</FormSection>
                  <Field label="Property Address" name="property_address" required />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Field label="City"  name="property_city" />
                    <Field label="State" name="property_state" />
                    <Field label="ZIP"   name="property_zip" />
                  </div>
                  <FormSection>Property Details</FormSection>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SelectField label="Property Type" name="property_type" options={PROPERTY_TYPES} />
                    <Field label="Estimated Value ($)" name="estimated_value" type="number" placeholder="0" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Year Built"     name="year_built"     type="number" placeholder="YYYY" />
                    <Field label="Square Footage" name="square_footage" type="number" placeholder="sq ft" />
                  </div>
                </div>
                <div className={step === 3 ? 'space-y-4' : 'hidden'}>
                  <FormSection>Loan Terms</FormSection>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Loan Amount ($)"   name="loan_amount"   type="number" required placeholder="0" />
                    <Field label="Wired Amount ($)"  name="wired_amount"  type="number" placeholder="0" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Interest Rate (%)" name="interest_rate" type="number" required placeholder="0.00" step="0.01" />
                    <Field label="Term (months)"     name="loan_term"     type="number" required placeholder="12" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SelectField label="Loan Type" name="loan_type" options={LOAN_TYPES} />
                  </div>
                  <FormSection>Timeline</FormSection>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Origination Date" name="origination_date" type="date" />
                    <Field label="Maturity Date"    name="maturity_date"    type="date" />
                  </div>
                  <FormSection>Status & Notes</FormSection>
                  <SelectField label="Status" name="status" options={STATUSES.map(s => STATUS_CONFIG[s].label)} values={[...STATUSES]} />
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Notes</label>
                    <textarea name="notes" rows={3} placeholder="Optional loan notes…"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none transition shadow-sm" />
                  </div>
                </div>
                {formError && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-500 text-xs">{formError}</div>}
              </div>
              <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
                <button type="button" onClick={step === 1 ? closeAdd : () => setStep(s => (s - 1) as Step)}
                  className="text-sm text-slate-500 hover:text-slate-800 font-semibold transition-colors">
                  {step === 1 ? 'Cancel' : '← Back'}
                </button>
                {step < 3 ? (
                  <button type="button" onClick={() => setStep(s => (s + 1) as Step)}
                    className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-sm">
                    Continue →
                  </button>
                ) : (
                  <button type="submit" disabled={isPending}
                    className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                    {isPending ? 'Saving…' : 'Save Loan'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </main>
      )}

      {/* ── Loan Detail (inline, no modal) ──────────────────── */}
      {view === 'detail' && selectedLoan && (() => {
        const sc = STATUS_CONFIG[selectedLoan.status] ?? STATUS_CONFIG.application;
        return (
          <main className="max-w-6xl mx-auto px-6 py-7 space-y-6">

            {/* Detail card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

              {/* gradient header */}
              <div className="bg-gradient-to-br from-[#080F2A] via-[#0D1D5C] to-[#0B1437] px-6 py-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-[10.5px] text-indigo-300/50 tracking-[0.2em]">{selectedLoan.loan_number}</p>
                    <h2 className="text-white font-black text-xl mt-1">{selectedLoan.first_name} {selectedLoan.last_name}</h2>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${sc.bg} ${sc.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </span>
                      <span className="text-indigo-200/50 text-xs font-medium">
                        {currency(selectedLoan.loan_amount)} · {selectedLoan.interest_rate}% · {selectedLoan.loan_term} mo
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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
                          await deleteLoan(selectedLoan.id);
                          setSelectedLoan(null); router.refresh();
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

              {/* Detail sections */}
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                  {/* Borrower Information */}
                  <div>
                    <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-3">Borrower Information</p>
                    <div className="space-y-3">
                      <DR label="Borrower"      value={`${selectedLoan.first_name} ${selectedLoan.last_name}`} />
                      <DR label="Co-Borrower"   value={selectedLoan.coborrower_first_name ? `${selectedLoan.coborrower_first_name} ${selectedLoan.coborrower_last_name ?? ''}`.trim() : '—'} />
                      <DR label="Email"         value={selectedLoan.email || '—'} />
                      <DR label="Phone"         value={selectedLoan.phone || '—'} />
                      <DR label="Date of Birth" value={selectedLoan.dob || '—'} />
                      <DR label="SSN"           value={selectedLoan.ssn ? `***-**-${selectedLoan.ssn.slice(-4)}` : '—'} />
                      <DR label="Address"       value={[selectedLoan.borrower_address, selectedLoan.borrower_city, selectedLoan.borrower_state, selectedLoan.borrower_zip].filter(Boolean).join(', ') || '—'} />
                    </div>
                  </div>

                  {/* Property Details */}
                  <div>
                    <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-3">Property Details</p>
                    <div className="space-y-3">
                      <DR label="Address"    value={[selectedLoan.property_address, selectedLoan.property_city, selectedLoan.property_state, selectedLoan.property_zip].filter(Boolean).join(', ') || '—'} />
                      <DR label="Type"       value={selectedLoan.property_type || '—'} />
                      <DR label="Est. Value" value={selectedLoan.estimated_value ? currency(selectedLoan.estimated_value) : '—'} />
                      <DR label="Year Built" value={selectedLoan.year_built?.toString() ?? '—'} />
                      <DR label="Sq Footage" value={selectedLoan.square_footage ? selectedLoan.square_footage.toLocaleString() + ' sq ft' : '—'} />
                    </div>
                  </div>

                  {/* Loan Details */}
                  <div>
                    <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-3">Loan Details</p>
                    <div className="space-y-3">
                      <DR label="Loan Amount"   value={currency(selectedLoan.loan_amount)} />
                      <DR label="Wired Amount"  value={selectedLoan.wired_amount ? currency(selectedLoan.wired_amount) : '—'} />
                      <DR label="Interest Rate" value={selectedLoan.interest_rate + '%'} />
                      <DR label="LTV"           value={ltv(selectedLoan.loan_amount, selectedLoan.estimated_value)} />
                      <DR label="Term"          value={selectedLoan.loan_term + ' months'} />
                      <DR label="Loan Type"     value={selectedLoan.loan_type || '—'} />
                      <DR label="Origination"   value={selectedLoan.origination_date || '—'} />
                      <DR label="Maturity"      value={selectedLoan.maturity_date || '—'} />
                      {selectedLoan.notes && <DR label="Notes" value={selectedLoan.notes} />}
                    </div>
                  </div>
                </div>

                {/* Status update */}
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-3">Update Status</p>
                  <div className="flex flex-wrap gap-2">
                    {STATUSES.map(s => {
                      const c = STATUS_CONFIG[s];
                      const active = selectedLoan.status === s;
                      return (
                        <button key={s} disabled={isPending}
                          onClick={() => startTransition(async () => {
                            await updateLoanStatus(selectedLoan.id, s);
                            setSelectedLoan(null); router.refresh();
                          })}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all duration-150 disabled:opacity-50 ${
                            active ? `${c.bg} ${c.text} border-transparent ring-1 ring-current` : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${active ? c.dot : 'bg-slate-300'}`} />
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* View Ledger link */}
                <div className="pt-2 flex justify-end">
                  <Link
                    href={`/loans/${selectedLoan.id}`}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 transition-colors text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    View Ledger
                  </Link>
                </div>
              </div>
            </div>
          </main>
        );
      })()}

      {/* ── Loans List ────────────────────────────────────────── */}
      {view === 'list' && (
        <main className="max-w-7xl mx-auto px-6 py-7 space-y-6">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard label="Total Loans"       value={loans.length.toString()}                  icon={<IDoc />}      iconClass="bg-blue-100 text-blue-600"      border="border-l-blue-500" />
            <KPICard label="Active Loans"      value={activeLoans.length.toString()}             icon={<IActivity />} iconClass="bg-emerald-100 text-emerald-600" border="border-l-emerald-500" />
            <KPICard label="Active Portfolio"  value={currency(totalPortfolio)}                  icon={<IDollar />}   iconClass="bg-violet-100 text-violet-600"   border="border-l-violet-500" />
            <KPICard label="Avg Interest Rate" value={avgRate ? avgRate.toFixed(2) + '%' : '—'} icon={<IPercent />}  iconClass="bg-amber-100 text-amber-600"     border="border-l-amber-500" />
          </div>

          {/* Alerts */}
          {alerts.length > 0 && <AlertsPanel alerts={alerts} />}

          {/* Search + Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><ISearch /></span>
              <input type="text" placeholder="Search by borrower, property, or loan number…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200/80 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="bg-white border border-slate-200/80 rounded-xl px-4 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all">
              <option value="all">All Status</option>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
            </select>
          </div>

          {/* Loan List */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

            {/* Mobile cards */}
            <div className="sm:hidden">
              {filtered.length === 0 ? (
                <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
                  <IEmpty />
                  <p className="text-sm text-center px-4">{loans.length === 0 ? 'No loans yet — tap "+" to get started.' : 'No loans match your search.'}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {filtered.map(loan => {
                    const sc = STATUS_CONFIG[loan.status] ?? STATUS_CONFIG.application;
                    return (
                      <div key={loan.id} onClick={() => setSelectedLoan(loan)}
                        className="px-4 py-4 cursor-pointer active:bg-indigo-50/60 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <span className="font-mono text-[10px] text-slate-400">{loan.loan_number}</span>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${sc.bg} ${sc.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                                {sc.label}
                              </span>
                            </div>
                            <p className="font-bold text-slate-800">{loan.first_name} {loan.last_name}</p>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">
                              {loan.property_address}{loan.property_city ? `, ${loan.property_city}` : ''}
                            </p>
                            <div className="flex items-center gap-2 mt-2 text-xs">
                              <span className="font-bold text-slate-800">{currency(loan.loan_amount)}</span>
                              <span className="text-slate-300">·</span>
                              <span className="text-slate-600">{loan.interest_rate}%</span>
                              <span className="text-slate-300">·</span>
                              <span className="text-slate-500">{loan.loan_term} mo</span>
                            </div>
                          </div>
                          <span className="text-indigo-400 text-xs font-semibold shrink-0 mt-1">View →</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    {['Loan #', 'Borrower', 'Property', 'Loan Amount', 'LTV', 'Rate', 'Term', 'Status', ''].map(h => (
                      <th key={h} className="text-left text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.1em] px-5 py-3.5 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-24 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <IEmpty />
                          <p className="text-sm">{loans.length === 0 ? 'No loans yet — click "Add New Loan" to get started.' : 'No loans match your search.'}</p>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.map((loan, idx) => {
                    const sc = STATUS_CONFIG[loan.status] ?? STATUS_CONFIG.application;
                    return (
                      <tr key={loan.id} onClick={() => setSelectedLoan(loan)}
                        className={`group cursor-pointer transition-colors hover:bg-indigo-50/60 ${idx < filtered.length - 1 ? 'border-b border-slate-50' : ''}`}>
                        <td className="px-5 py-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">{loan.loan_number}</td>
                        <td className="px-5 py-4 font-bold text-slate-800 whitespace-nowrap">{loan.first_name} {loan.last_name}</td>
                        <td className="px-5 py-4 text-slate-500 max-w-[200px] truncate">
                          {loan.property_address}{loan.property_city ? `, ${loan.property_city}` : ''}
                        </td>
                        <td className="px-5 py-4 font-bold text-slate-800 whitespace-nowrap">{currency(loan.loan_amount)}</td>
                        <td className="px-5 py-4 text-slate-500">{ltv(loan.loan_amount, loan.estimated_value)}</td>
                        <td className="px-5 py-4 font-semibold text-slate-700">{loan.interest_rate}%</td>
                        <td className="px-5 py-4 text-slate-500 whitespace-nowrap">{loan.loan_term} mo</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${sc.bg} ${sc.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sc.dot}`} />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="text-indigo-400 group-hover:text-indigo-600 text-xs font-semibold transition-colors">View →</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filtered.length > 0 && (
              <div className="px-5 py-3 bg-slate-50/60 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
                {filtered.length} {filtered.length === 1 ? 'loan' : 'loans'}
                {filterStatus !== 'all' || search ? ' (filtered)' : ''}
              </div>
            )}
          </div>
        </main>
      )}

      {/* ── Edit Loan / Borrower Modal ────────────────────────── */}
      {showEdit && selectedLoan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) setShowEdit(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] ring-1 ring-black/5">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-900">Edit Record</h2>
                <p className="text-xs text-slate-400 mt-0.5">{selectedLoan.first_name} {selectedLoan.last_name} · {selectedLoan.loan_number}</p>
              </div>
              <button onClick={() => setShowEdit(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors text-lg">✕</button>
            </div>
            <div className="px-6 pt-4 flex gap-1 shrink-0">
              {(['borrower', 'loan'] as const).map(tab => (
                <button key={tab} type="button" onClick={() => { setEditTab(tab); setEditError(''); }}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${editTab === tab ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {tab === 'borrower' ? 'Borrower Details' : 'Loan Details'}
                </button>
              ))}
            </div>
            <form key={selectedLoan.id + '-' + editTab}
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setEditError('');
                startTransition(async () => {
                  const res = editTab === 'borrower'
                    ? await updateBorrower(selectedLoan.borrower_id, fd)
                    : await updateLoan(selectedLoan.id, fd);
                  if (res.ok) { setShowEdit(false); setSelectedLoan(null); router.refresh(); }
                  else setEditError(res.error ?? 'Failed to save.');
                });
              }}
              className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                {editTab === 'borrower' ? (
                  <>
                    <FormSection>Personal Information</FormSection>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="First Name" name="first_name" required defaultValue={selectedLoan.first_name} />
                      <Field label="Last Name"  name="last_name"  required defaultValue={selectedLoan.last_name} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Email" name="email" type="email" defaultValue={selectedLoan.email} />
                      <Field label="Phone" name="phone" type="tel"   defaultValue={selectedLoan.phone} />
                    </div>
                    <FormSection>Address</FormSection>
                    <Field label="Street Address" name="borrower_address" defaultValue={selectedLoan.borrower_address} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <Field label="City"  name="borrower_city"  defaultValue={selectedLoan.borrower_city} />
                      <Field label="State" name="borrower_state" defaultValue={selectedLoan.borrower_state} />
                      <Field label="ZIP"   name="borrower_zip"   defaultValue={selectedLoan.borrower_zip} />
                    </div>
                    <FormSection>Co-Borrower (optional)</FormSection>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Co-Borrower First Name" name="coborrower_first_name" defaultValue={selectedLoan.coborrower_first_name ?? ''} />
                      <Field label="Co-Borrower Last Name"  name="coborrower_last_name"  defaultValue={selectedLoan.coborrower_last_name ?? ''} />
                    </div>
                    <FormSection>Identity</FormSection>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Date of Birth" name="dob" type="date" defaultValue={selectedLoan.dob} />
                      <Field label="SSN" name="ssn" placeholder="XXX-XX-XXXX" defaultValue={selectedLoan.ssn ?? ''} />
                    </div>
                  </>
                ) : (
                  <>
                    <FormSection>Loan Terms</FormSection>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Loan Amount ($)"   name="loan_amount"   type="number" required defaultValue={selectedLoan.loan_amount?.toString()} />
                      <Field label="Wired Amount ($)"  name="wired_amount"  type="number" defaultValue={selectedLoan.wired_amount?.toString()} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Interest Rate (%)" name="interest_rate" type="number" required defaultValue={selectedLoan.interest_rate?.toString()} step="0.01" />
                      <Field label="Term (months)"     name="loan_term"     type="number" required defaultValue={selectedLoan.loan_term?.toString()} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <SelectField label="Loan Type" name="loan_type" options={LOAN_TYPES} defaultValue={selectedLoan.loan_type} />
                    </div>
                    <FormSection>Timeline</FormSection>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Origination Date" name="origination_date" type="date" defaultValue={selectedLoan.origination_date ?? ''} />
                      <Field label="Maturity Date"    name="maturity_date"    type="date" defaultValue={selectedLoan.maturity_date ?? ''} />
                    </div>
                    <FormSection>Status & Notes</FormSection>
                    <SelectField label="Status" name="status" options={STATUSES.map(s => STATUS_CONFIG[s].label)} values={[...STATUSES]} defaultValue={selectedLoan.status} />
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">Notes</label>
                      <textarea name="notes" rows={3} defaultValue={selectedLoan.notes ?? ''} placeholder="Optional loan notes…"
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none transition shadow-sm" />
                    </div>
                  </>
                )}
                {editError && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-500 text-xs">{editError}</div>}
              </div>
              <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl shrink-0">
                <button type="button" onClick={() => setShowEdit(false)} className="text-sm text-slate-500 hover:text-slate-800 font-semibold transition-colors">Cancel</button>
                <button type="submit" disabled={isPending}
                  className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  {isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

const ALERT_CONFIG = {
  1: { border: 'border-amber-200', bg: 'bg-amber-50',  iconBg: 'bg-amber-100',  iconText: 'text-amber-500',  badge: 'bg-amber-100 text-amber-700',   label: 'Due reminder', desc: 'past the 5th' },
  2: { border: 'border-orange-200',bg: 'bg-orange-50', iconBg: 'bg-orange-100', iconText: 'text-orange-500', badge: 'bg-orange-100 text-orange-700', label: 'Overdue',      desc: 'past the 10th' },
  3: { border: 'border-red-200',   bg: 'bg-red-50',    iconBg: 'bg-red-100',    iconText: 'text-red-500',    badge: 'bg-red-100 text-red-700',       label: 'Critical',     desc: 'past the 15th' },
} as const;

function AlertsPanel({ alerts }: { alerts: LoanAlert[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const criticalCount = alerts.filter(a => a.alert_level === 3).length;
  const overdueCount  = alerts.filter(a => a.alert_level === 2).length;
  const reminderCount = alerts.filter(a => a.alert_level === 1).length;
  return (
    <div className="rounded-2xl border border-red-100 bg-white shadow-sm overflow-hidden">
      <button onClick={() => setCollapsed(c => !c)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-900">
              Interest Payment Alerts
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black">{alerts.length}</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {criticalCount > 0 && <span className="text-red-500 font-semibold">{criticalCount} critical</span>}
              {criticalCount > 0 && overdueCount > 0 && ' · '}
              {overdueCount > 0 && <span className="text-orange-500 font-semibold">{overdueCount} overdue</span>}
              {(criticalCount > 0 || overdueCount > 0) && reminderCount > 0 && ' · '}
              {reminderCount > 0 && <span className="text-amber-600 font-semibold">{reminderCount} reminder</span>}
            </p>
          </div>
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {!collapsed && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {[3, 2, 1].flatMap(level =>
            alerts.filter(a => a.alert_level === level).map(alert => {
              const cfg = ALERT_CONFIG[level as 1 | 2 | 3];
              const monthlyInterest = alert.outstanding_balance * (alert.interest_rate / 100 / 12);
              return (
                <div key={alert.loan_id} className={`flex items-center gap-4 px-5 py-4 ${cfg.bg}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.iconBg}`}>
                    <svg className={`w-4 h-4 ${cfg.iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">{alert.first_name} {alert.last_name}</span>
                      <span className="font-mono text-[10.5px] text-slate-400">{alert.loan_number}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold ${cfg.badge}`}>{cfg.label} — {cfg.desc}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      No payment received this month for {new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleString('en-US', { month: 'long' })}'s accrued interest ·
                      Interest due: <span className="font-semibold text-slate-700">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(monthlyInterest)}</span> ·
                      Outstanding: <span className="font-semibold text-slate-700">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(alert.outstanding_balance)}</span> ·
                      <span className="font-semibold text-slate-600"> {alert.days_overdue + 1} day{alert.days_overdue + 1 !== 1 ? 's' : ''} past the {alert.threshold_day}{ordinal(alert.threshold_day)}</span>
                    </p>
                  </div>
                  <Link href={`/loans/${alert.loan_id}`} className="shrink-0 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors whitespace-nowrap">
                    View Ledger →
                  </Link>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
}

function KPICard({ label, value, icon, iconClass, border }: { label: string; value: string; icon: React.ReactNode; iconClass: string; border: string }) {
  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-l-4 ${border} flex items-center gap-4`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[0.1em]">{label}</p>
        <p className="text-[22px] font-black text-slate-800 mt-0.5 truncate leading-none">{value}</p>
      </div>
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
      <input type={type} name={name} required={required} placeholder={placeholder} step={step} defaultValue={defaultValue}
        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
    </div>
  );
}

function SelectField({ label, name, options, values, defaultValue }: {
  label: string; name: string; options: string[]; values?: string[]; defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 mb-1.5">{label}</label>
      <select name={name} defaultValue={defaultValue}
        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all">
        {options.map((opt, i) => (
          <option key={opt} value={values ? values[i] : opt.toLowerCase().replace(/\s+/g, '_')}>{opt}</option>
        ))}
      </select>
    </div>
  );
}
