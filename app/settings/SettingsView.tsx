'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogoMark } from '@/app/components/Logo';
import { signOutAction } from '@/app/actions/auth';
import { importStatement, type ImportResult, type StatementUpload } from '@/app/actions/import';

function fmt(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function SettingsView({
  userName, uploads,
}: {
  userName: string;
  uploads: StatementUpload[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleSubmit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const r = await importStatement(formData);
      setResult(r);
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-gradient-to-r from-[#080F2A] via-[#0D1D5C] to-[#080F2A] shadow-xl border-b border-white/5">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <Link href="/" className="flex items-center gap-3.5 group">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-900/40 shrink-0">
                <LogoMark className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-white font-bold text-[17px] leading-none tracking-tight group-hover:text-indigo-200 transition-colors">Prophecy Capital</h1>
                <p className="text-indigo-300/50 text-[10px] mt-1 tracking-[0.15em] font-medium">SETTINGS</p>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-3">
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

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Settings</h2>
          <p className="text-sm text-slate-500 mt-1">Import bank statements to auto-match incoming interest payments.</p>
        </div>

        {/* Upload card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Import Bank Statement</p>
              <p className="text-xs text-slate-400">Upload a Chase activity export (.csv / .tsv) to match deposits to active loans.</p>
            </div>
          </div>

          <div className="px-6 py-6 space-y-4">
            <form action={handleSubmit} className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                name="file"
                accept=".csv,.tsv,.txt"
                required
                disabled={pending}
                className="text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={pending}
                className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 active:scale-[0.98] transition-all text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-900/20"
              >
                {pending ? 'Importing…' : 'Import'}
              </button>
            </form>

            {result && (result.ok ? (
              <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700">
                Parsed <strong>{result.parsed}</strong> transactions ·{' '}
                imported <strong>{result.imported}</strong> deposit{result.imported !== 1 ? 's' : ''} ·{' '}
                matched <strong>{result.matched}</strong> to loans.
                {result.imported > 0 && (
                  <> {' '}<Link href="/suggestions" className="font-bold underline hover:text-emerald-900">Review →</Link></>
                )}
              </div>
            ) : (
              <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-700">
                {result.error}
              </div>
            ))}

            <div className="pt-2 border-t border-slate-100">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Confidence ladder</p>
              <ul className="space-y-1.5">
                {[
                  { badge: 'High',   color: 'bg-emerald-100 text-emerald-700', text: 'Loan number (PC-…) in memo, OR borrower\'s first + last name in memo' },
                  { badge: 'Medium', color: 'bg-amber-100 text-amber-700',     text: 'Borrower last name in memo + amount within 3% of monthly interest' },
                  { badge: 'Low',    color: 'bg-orange-100 text-orange-700',   text: 'Amount within 3% of monthly interest, no name match' },
                  { badge: 'None',   color: 'bg-slate-100 text-slate-500',     text: 'No match — assign manually or dismiss' },
                ].map(({ badge, color, text }) => (
                  <li key={badge} className="flex items-start gap-2.5">
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-bold ${color}`}>{badge}</span>
                    <p className="text-xs text-slate-500 leading-relaxed">{text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Recent uploads */}
        {uploads.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Recent Uploads</p>
              <Link href="/suggestions" className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                View suggestions →
              </Link>
            </div>
            <ul className="divide-y divide-slate-100">
              {uploads.map(u => (
                <li key={u.id} className="px-6 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 truncate">{u.filename}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{fmt(u.uploaded_at)}</p>
                  </div>
                  <div className="text-right text-[11px] text-slate-500 shrink-0">
                    <p><strong className="text-slate-700">{u.imported_count}</strong> imported · <strong className="text-slate-700">{u.matched_count}</strong> matched</p>
                    <p className="text-slate-400 mt-0.5">{u.txn_count} txns parsed</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
