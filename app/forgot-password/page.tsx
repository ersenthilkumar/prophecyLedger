'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestResetAction } from './actions';
import { LogoMark } from '@/app/components/Logo';

export default function ForgotPasswordPage() {
  const [result, dispatch, pending] = useActionState(requestResetAction, null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#060D24] via-[#0A1540] to-[#060D24] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white shadow-2xl shadow-indigo-900/60 mb-4">
            <LogoMark className="w-8 h-8" />
          </div>
          <h1 className="text-white font-bold text-xl tracking-tight">Prophecy Capital</h1>
          <p className="text-indigo-300/50 text-[11px] mt-1 tracking-[0.15em] font-medium">PROPHECYLEDGER · LOAN TRACKING</p>
        </div>

        {/* Card */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-7 shadow-2xl backdrop-blur-sm">
          <h2 className="text-white font-bold text-base mb-1">Forgot password?</h2>
          <p className="text-indigo-300/50 text-xs mb-6 leading-relaxed">
            Enter your email and we'll send you a link to reset your password.
          </p>

          {result?.ok ? (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-slate-300 text-center leading-relaxed">{result.message}</p>
              <Link href="/login" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form action={dispatch} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-indigo-200/60 mb-1.5 tracking-wide">Email</label>
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-indigo-300/30 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>

              {result && !result.ok && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                  <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-red-400 text-xs font-medium">{result.message}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={pending}
                className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-150 text-white font-bold text-sm py-3 rounded-xl shadow-lg shadow-indigo-900/40"
              >
                {pending ? 'Sending…' : 'Send reset link'}
              </button>

              <div className="text-center">
                <Link href="/login" className="text-xs text-indigo-400/70 hover:text-indigo-300 transition-colors">
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
