'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogoMark } from '@/app/components/Logo';
import { confirmSuggestion, dismissSuggestion, assignAndConfirm } from '@/app/actions/import';
import { signOutAction } from '@/app/actions/auth';
import type { SuggestedPayment } from '@/app/actions/import';
import type { LoanRecord } from '@/app/actions';

const CONFIDENCE_CFG = {
  high:   { label: 'High',   bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  medium: { label: 'Medium', bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  low:    { label: 'Low',    bg: 'bg-orange-100',  text: 'text-orange-700',  dot: 'bg-orange-500'  },
  none:   { label: 'None',   bg: 'bg-slate-100',   text: 'text-slate-500',   dot: 'bg-slate-400'   },
};

function currency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function AssignModal({
  suggestion,
  loans,
  onClose,
}: {
  suggestion: SuggestedPayment;
  loans: LoanRecord[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [error, setError] = useState('');

  function handleConfirm() {
    if (!selectedLoanId) { setError('Select a loan first.'); return; }
    startTransition(async () => {
      const res = await assignAndConfirm(suggestion.id, Number(selectedLoanId));
      if (!res.ok) { setError(res.error ?? 'Failed.'); return; }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-6 space-y-4">
        <h3 className="font-bold text-slate-900">Assign to Loan</h3>
        <p className="text-xs text-slate-500">
          Deposit of <strong>{currency(suggestion.amount)}</strong> on {fmtDate(suggestion.transaction_date)}
          {suggestion.memo && <> · <span className="font-mono">{suggestion.memo}</span></>}
        </p>
        <select
          value={selectedLoanId}
          onChange={e => { setSelectedLoanId(e.target.value); setError(''); }}
          className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">— Select loan —</option>
          {loans.filter(l => l.status === 'active').map(l => (
            <option key={l.id} value={l.id}>
              {l.loan_number} · {l.first_name} {l.last_name}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="flex-1 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white font-bold text-sm py-2.5 rounded-xl transition-all"
          >
            {isPending ? 'Confirming…' : 'Confirm Payment'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SuggestionRow({ s, loans }: { s: SuggestedPayment; loans: LoanRecord[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAssign, setShowAssign] = useState(false);
  const cfg = CONFIDENCE_CFG[s.confidence];

  function handleConfirm() {
    startTransition(async () => {
      await confirmSuggestion(s.id);
      router.refresh();
    });
  }
  function handleDismiss() {
    startTransition(async () => {
      await dismissSuggestion(s.id);
      router.refresh();
    });
  }

  return (
    <>
      {showAssign && (
        <AssignModal suggestion={s} loans={loans} onClose={() => setShowAssign(false)} />
      )}

      {/* Mobile card */}
      <div className="sm:hidden bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-slate-800">{currency(s.amount)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmtDate(s.transaction_date)}</p>
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${cfg.bg} ${cfg.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>
        {s.memo && <p className="text-xs text-slate-500 font-mono truncate">{s.memo}</p>}
        {s.loan_id ? (
          <div className="flex items-center gap-2">
            <Link href={`/loans/${s.loan_id}`} className="text-xs font-bold text-indigo-600 hover:underline">{s.loan_number}</Link>
            <span className="text-xs text-slate-500">{s.borrower_name}</span>
            {s.expected_interest != null && (
              <span className="text-xs text-slate-400">· expected {currency(s.expected_interest)}</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No loan matched</p>
        )}
        <div className="flex gap-2 pt-1">
          {s.loan_id ? (
            <button onClick={handleConfirm} disabled={isPending}
              className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white font-bold text-xs py-2 rounded-lg transition-all">
              {isPending ? '…' : 'Confirm'}
            </button>
          ) : (
            <button onClick={() => setShowAssign(true)} disabled={isPending}
              className="flex-1 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white font-bold text-xs py-2 rounded-lg transition-all">
              Assign
            </button>
          )}
          <button onClick={handleDismiss} disabled={isPending}
            className="px-3 py-2 rounded-lg border border-slate-200 text-slate-500 hover:text-red-500 hover:border-red-200 disabled:opacity-60 text-xs font-medium transition-colors">
            Dismiss
          </button>
        </div>
      </div>

      {/* Desktop row */}
      <tr className="hidden sm:table-row hover:bg-slate-50/60 transition-colors">
        <td className="px-4 py-3.5 text-sm text-slate-500">{fmtDate(s.transaction_date)}</td>
        <td className="px-4 py-3.5 text-sm font-bold text-slate-800">{currency(s.amount)}</td>
        <td className="px-4 py-3.5 text-xs text-slate-400 font-mono max-w-[200px] truncate">{s.memo ?? '—'}</td>
        <td className="px-4 py-3.5">
          {s.loan_id ? (
            <div>
              <Link href={`/loans/${s.loan_id}`} className="text-xs font-bold text-indigo-600 hover:underline">{s.loan_number}</Link>
              <p className="text-xs text-slate-400 mt-0.5">{s.borrower_name}</p>
            </div>
          ) : <span className="text-xs text-slate-400 italic">Unmatched</span>}
        </td>
        <td className="px-4 py-3.5 text-xs text-slate-500">
          {s.expected_interest != null ? currency(s.expected_interest) : '—'}
        </td>
        <td className="px-4 py-3.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${cfg.bg} ${cfg.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </td>
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-2">
            {s.loan_id ? (
              <button onClick={handleConfirm} disabled={isPending}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors">
                {isPending ? '…' : 'Confirm'}
              </button>
            ) : (
              <button onClick={() => setShowAssign(true)} disabled={isPending}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                Assign
              </button>
            )}
            <button onClick={handleDismiss} disabled={isPending}
              className="text-xs font-medium text-slate-400 hover:text-red-500 disabled:opacity-60 transition-colors">
              Dismiss
            </button>
          </div>
        </td>
      </tr>
    </>
  );
}

export default function SuggestionsView({
  suggestions, totalPending, loans, userName,
}: {
  suggestions: SuggestedPayment[];
  totalPending: number;
  loans: LoanRecord[];
  userName: string;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-gradient-to-r from-[#080F2A] via-[#0D1D5C] to-[#080F2A] shadow-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <Link href="/" className="flex items-center gap-3.5 group">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-900/40 shrink-0">
                <LogoMark className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-white font-bold text-[17px] leading-none tracking-tight group-hover:text-indigo-200 transition-colors">Prophecy Capital</h1>
                <p className="text-indigo-300/50 text-[10px] mt-1 tracking-[0.15em] font-medium">SUGGESTED PAYMENTS</p>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-indigo-300/60 hover:text-indigo-200 text-xs font-medium px-3 py-2 rounded-xl hover:bg-white/5 transition-colors">
              Settings
            </Link>
            {userName && <span className="hidden sm:block text-indigo-300/50 text-xs">{userName}</span>}
            <form action={signOutAction}>
              <button type="submit" className="text-indigo-300/60 hover:text-red-400 transition-colors px-2 py-2 rounded-xl hover:bg-white/5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Suggested Payments
              {totalPending > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500 text-white text-xs font-black">{totalPending}</span>
              )}
            </h2>
            <p className="text-sm text-slate-500 mt-1">Deposits from your bank statement matched against active loans.</p>
          </div>
          <Link href="/settings" className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
            Import settings →
          </Link>
        </div>

        {suggestions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-8 py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-700">All caught up</p>
            <p className="text-xs text-slate-400 mt-1">No pending suggestions. Upload a bank statement to import new deposits.</p>
            <Link href="/settings" className="inline-block mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-800">
              Go to Settings →
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile list */}
            <div className="sm:hidden space-y-3">
              {suggestions.map(s => (
                <SuggestionRow key={s.id} s={s} loans={loans} />
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Date', 'Amount', 'Memo', 'Matched Loan', 'Expected Interest', 'Confidence', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {suggestions.map(s => (
                    <SuggestionRow key={s.id} s={s} loans={loans} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
