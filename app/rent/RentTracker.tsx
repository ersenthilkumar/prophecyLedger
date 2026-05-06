'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  addRentUnit, updateRentUnit, deleteRentUnit,
  addRentPayment, updateRentPayment, deleteRentPayment,
  getRentPayments,
} from '@/app/actions/rent';
import { signOutAction } from '@/app/actions/auth';
import { LogoMark } from '@/app/components/Logo';
import type { RentUnit, RentPayment, RentAlert } from '@/app/actions/rent';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function currencyFull(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

const PROPERTY_TYPES = ['Residential', 'Single Family', 'Multi-Family', 'Condo', 'Townhouse', 'Commercial', 'Mixed Use'];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  active:   { label: 'Active',   bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  vacant:   { label: 'Vacant',   bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  inactive: { label: 'Inactive', bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400'   },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Field({ label, name, type = 'text', placeholder, defaultValue, required }: {
  label: string; name: string; type?: string; placeholder?: string; defaultValue?: string | number; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input
        type={type} name={name} placeholder={placeholder}
        defaultValue={defaultValue ?? ''}
        required={required}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
      />
    </div>
  );
}

function SelectField({ label, name, options, defaultValue }: {
  label: string; name: string; options: string[]; defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <select
        name={name} defaultValue={defaultValue ?? options[0]}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white"
      >
        {options.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
      </select>
    </div>
  );
}

function DR({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 font-medium">{label}</span>
      <span className="text-xs text-slate-700 font-semibold text-right max-w-[60%] truncate">{value ?? '—'}</span>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IPlus = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
  </svg>
);
const IHome = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

// ─── Main component ───────────────────────────────────────────────────────────

export default function RentTracker({
  initialUnits, alerts, collectedThisMonth, userName,
}: {
  initialUnits: RentUnit[];
  alerts: RentAlert[];
  collectedThisMonth: number;
  userName: string;
}) {
  const router = useRouter();

  const [units, setUnits]                       = useState(initialUnits);
  const [selectedUnit, setSelectedUnit]         = useState<RentUnit | null>(null);
  const [payments, setPayments]                 = useState<RentPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading]   = useState(false);
  const [showAdd, setShowAdd]                   = useState(false);
  const [showEdit, setShowEdit]                 = useState(false);
  const [showAddPayment, setShowAddPayment]      = useState(false);
  const [editPayment, setEditPayment]           = useState<RentPayment | null>(null);
  const [filterStatus, setFilterStatus]         = useState('all');
  const [search, setSearch]                     = useState('');
  const [formError, setFormError]               = useState('');
  const [isPending, startTransition]            = useTransition();

  const addFormRef  = useRef<HTMLFormElement>(null);
  const editFormRef = useRef<HTMLFormElement>(null);

  const view: 'list' | 'detail' | 'add' = showAdd ? 'add' : selectedUnit ? 'detail' : 'list';

  const filtered = units.filter(u => {
    const matchStatus = filterStatus === 'all' || u.status === filterStatus;
    const q = search.toLowerCase();
    const tenant = `${u.tenant_first_name ?? ''} ${u.tenant_last_name ?? ''}`.toLowerCase();
    const matchSearch = !q || u.address.toLowerCase().includes(q) || tenant.includes(q) || (u.unit_number ?? '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const activeUnits      = units.filter(u => u.status === 'active');
  const monthlyExpected  = activeUnits.reduce((s, u) => s + u.monthly_rent, 0);
  const overdueCount     = alerts.length;

  async function openDetail(unit: RentUnit) {
    setSelectedUnit(unit);
    setPaymentsLoading(true);
    const p = await getRentPayments(unit.id);
    setPayments(p);
    setPaymentsLoading(false);
  }

  function closeAdd() { setShowAdd(false); setFormError(''); addFormRef.current?.reset(); }
  function closeEdit() { setShowEdit(false); setFormError(''); }

  function handleAddUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!addFormRef.current) return;
    setFormError('');
    const fd = new FormData(addFormRef.current);
    startTransition(async () => {
      const res = await addRentUnit(fd);
      if (res.ok) { closeAdd(); router.refresh(); }
      else setFormError(res.error ?? 'Failed to save.');
    });
  }

  function handleEditUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!editFormRef.current || !selectedUnit) return;
    setFormError('');
    const fd = new FormData(editFormRef.current);
    startTransition(async () => {
      const res = await updateRentUnit(selectedUnit.id, fd);
      if (res.ok) {
        closeEdit();
        const updated = await fetch('/rent').then(() => null).catch(() => null);
        router.refresh();
      } else setFormError(res.error ?? 'Failed to update.');
    });
  }

  function handleDeleteUnit() {
    if (!selectedUnit) return;
    if (!confirm(`Delete ${selectedUnit.address}${selectedUnit.unit_number ? ' ' + selectedUnit.unit_number : ''}? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteRentUnit(selectedUnit.id);
      setSelectedUnit(null);
      router.refresh();
    });
  }

  function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUnit) return;
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    fd.set('unit_id', String(selectedUnit.id));
    startTransition(async () => {
      const res = await addRentPayment(fd);
      if (res.ok) {
        setShowAddPayment(false);
        form.reset();
        const p = await getRentPayments(selectedUnit.id);
        setPayments(p);
        router.refresh();
      }
    });
  }

  function handleEditPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!editPayment || !selectedUnit) return;
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await updateRentPayment(editPayment.id, fd);
      if (res.ok) {
        setEditPayment(null);
        const p = await getRentPayments(selectedUnit.id);
        setPayments(p);
        router.refresh();
      }
    });
  }

  function handleDeletePayment(paymentId: number) {
    if (!selectedUnit) return;
    if (!confirm('Delete this payment?')) return;
    startTransition(async () => {
      await deleteRentPayment(paymentId, selectedUnit.id);
      const p = await getRentPayments(selectedUnit.id);
      setPayments(p);
      router.refresh();
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F2F5FB]">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="bg-gradient-to-r from-[#080F2A] via-[#0D1D5C] to-[#080F2A] shadow-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/" className="flex items-center gap-3.5 group shrink-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-900/40">
                <LogoMark className="w-6 h-6" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-white font-bold text-[17px] leading-none tracking-tight group-hover:text-indigo-200 transition-colors">Prophecy Capital</h1>
                <p className="text-indigo-300/50 text-[10px] mt-1 tracking-[0.15em] font-medium">PROPHECYLEDGER · RENT INCOME</p>
              </div>
            </Link>
            {view === 'detail' && selectedUnit && (
              <>
                <span className="text-indigo-300/20 text-lg hidden sm:inline">/</span>
                <div className="hidden sm:block min-w-0">
                  <p className="text-white font-bold text-[15px] leading-none truncate">{selectedUnit.address}{selectedUnit.unit_number ? ` · ${selectedUnit.unit_number}` : ''}</p>
                  <p className="text-indigo-300/50 text-[10px] mt-0.5 font-medium">{selectedUnit.tenant_first_name ? `${selectedUnit.tenant_first_name} ${selectedUnit.tenant_last_name}` : 'Vacant'}</p>
                </div>
              </>
            )}
          </div>

          {view === 'add' ? (
            <button onClick={closeAdd} className="flex items-center gap-1.5 text-indigo-300/60 hover:text-indigo-200 transition-colors text-sm font-medium px-3 py-2 rounded-xl hover:bg-white/5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              <span className="hidden sm:inline">Cancel</span>
            </button>
          ) : view === 'detail' ? (
            <button onClick={() => { setSelectedUnit(null); setPayments([]); }} className="flex items-center gap-1.5 text-indigo-300/60 hover:text-indigo-200 transition-colors text-sm font-medium px-3 py-2 rounded-xl hover:bg-white/5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              <span className="hidden sm:inline">Back to Properties</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/" className="flex items-center gap-1.5 text-indigo-300/60 hover:text-indigo-200 transition-colors text-sm font-medium px-3 py-2 rounded-xl hover:bg-white/5">
                <IHome /><span className="hidden sm:inline">Loans</span>
              </Link>
              <Link href="/payments" className="flex items-center gap-1.5 text-indigo-300/60 hover:text-indigo-200 transition-colors text-sm font-medium px-3 py-2 rounded-xl hover:bg-white/5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                <span className="hidden sm:inline">Payments</span>
              </Link>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 active:scale-95 transition-all duration-150 text-white text-sm font-bold px-3 sm:px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-900/30"
              >
                <IPlus /><span className="hidden sm:inline">Add Property</span>
              </button>
              <form action={signOutAction}>
                <button type="submit" className="text-indigo-300/50 hover:text-indigo-200 transition-colors text-xs font-medium px-2 py-2 rounded-xl hover:bg-white/5 hidden sm:flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  {userName}
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      {/* ── Add Unit Form ───────────────────────────────────── */}
      {view === 'add' && (
        <main className="max-w-3xl mx-auto px-6 py-8">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-7">
            <h2 className="text-lg font-bold text-slate-800 mb-6">Add Rental Property</h2>
            <form ref={addFormRef} onSubmit={handleAddUnit} className="space-y-6">
              <FormSection title="Property">
                <div className="sm:col-span-2">
                  <Field label="Street Address" name="address" placeholder="123 Main St" required />
                </div>
                <Field label="City" name="city" placeholder="Los Angeles" />
                <Field label="State" name="state" placeholder="CA" />
                <Field label="ZIP" name="zip" placeholder="90001" />
                <Field label="Unit / Suite #" name="unit_number" placeholder="2A" />
                <SelectField label="Property Type" name="property_type" options={PROPERTY_TYPES} />
              </FormSection>

              <FormSection title="Tenant">
                <Field label="First Name" name="tenant_first_name" placeholder="Jane" />
                <Field label="Last Name" name="tenant_last_name" placeholder="Doe" />
                <Field label="Email" name="tenant_email" type="email" placeholder="jane@example.com" />
                <Field label="Phone" name="tenant_phone" placeholder="(555) 555-5555" />
              </FormSection>

              <FormSection title="Lease & Rent">
                <Field label="Monthly Rent ($)" name="monthly_rent" type="number" placeholder="2500" required />
                <Field label="Rent Due Day" name="rent_due_day" type="number" placeholder="1" defaultValue={1} />
                <Field label="Lease Start" name="lease_start" type="date" />
                <Field label="Lease End" name="lease_end" type="date" />
                <SelectField label="Status" name="status" options={['active', 'vacant', 'inactive']} />
              </FormSection>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
                <textarea name="notes" rows={2} placeholder="Optional notes…" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </div>

              {formError && <p className="text-red-500 text-sm">{formError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeAdd} className="flex-1 border border-slate-200 text-slate-600 font-semibold text-sm py-3 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
                <button type="submit" disabled={isPending} className="flex-1 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl transition-colors">
                  {isPending ? 'Saving…' : 'Save Property'}
                </button>
              </div>
            </form>
          </div>
        </main>
      )}

      {/* ── Detail View ─────────────────────────────────────── */}
      {view === 'detail' && selectedUnit && (() => {
        const sc = STATUS_CONFIG[selectedUnit.status] ?? STATUS_CONFIG.active;
        return (
          <main className="max-w-6xl mx-auto px-6 py-7 space-y-6">
            {/* Header card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-br from-[#080F2A] via-[#0D1D5C] to-[#0B1437] px-6 py-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </span>
                    </div>
                    <h2 className="text-white font-bold text-xl leading-tight">
                      {selectedUnit.address}{selectedUnit.unit_number ? ` · ${selectedUnit.unit_number}` : ''}
                    </h2>
                    <p className="text-indigo-300/60 text-sm mt-0.5">
                      {[selectedUnit.city, selectedUnit.state, selectedUnit.zip].filter(Boolean).join(', ')}
                    </p>
                    <p className="text-indigo-200/80 text-base font-semibold mt-2">{currency(selectedUnit.monthly_rent)}<span className="text-indigo-300/40 text-sm font-normal">/month</span></p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => { setShowEdit(true); setFormError(''); }} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      Edit
                    </button>
                    <button onClick={handleDeleteUnit} className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold px-3 py-2 rounded-xl transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Tenant Info</h3>
                    <DR label="Name" value={selectedUnit.tenant_first_name ? `${selectedUnit.tenant_first_name} ${selectedUnit.tenant_last_name}` : '—'} />
                    <DR label="Email" value={selectedUnit.tenant_email} />
                    <DR label="Phone" value={selectedUnit.tenant_phone} />
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Lease Details</h3>
                    <DR label="Start Date" value={selectedUnit.lease_start} />
                    <DR label="End Date" value={selectedUnit.lease_end} />
                    <DR label="Due Day" value={selectedUnit.rent_due_day ? `${selectedUnit.rent_due_day}${['st','nd','rd'][selectedUnit.rent_due_day-1]||'th'} of month` : '—'} />
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Payment Status</h3>
                    <DR label="Monthly Rent" value={currencyFull(selectedUnit.monthly_rent)} />
                    <DR label="Last Payment" value={selectedUnit.last_payment_date ?? '—'} />
                    <DR label="This Month" value={
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${selectedUnit.current_month_paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {selectedUnit.current_month_paid ? 'Paid' : 'Unpaid'}
                      </span>
                    } />
                  </div>
                </div>

                {selectedUnit.notes && (
                  <div className="bg-slate-50 rounded-xl px-4 py-3">
                    <span className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Notes</span>
                    <p className="text-sm text-slate-600 mt-1">{selectedUnit.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Payments */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-800">Payment History</h3>
                <button
                  onClick={() => setShowAddPayment(true)}
                  className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
                >
                  <IPlus /> Record Payment
                </button>
              </div>
              {paymentsLoading ? (
                <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
              ) : payments.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No payments recorded yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left text-xs font-semibold text-slate-500 px-6 py-3">Date</th>
                        <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Period</th>
                        <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">Amount</th>
                        <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">Late Fee</th>
                        <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Notes</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-6 py-3 text-slate-700 font-medium">{p.payment_date}</td>
                          <td className="px-4 py-3 text-slate-500">{p.period_month}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-600">{currencyFull(p.amount_paid)}</td>
                          <td className="px-4 py-3 text-right text-slate-500">{p.late_fee > 0 ? currencyFull(p.late_fee) : '—'}</td>
                          <td className="px-4 py-3 text-slate-400 truncate max-w-[160px]">{p.notes ?? '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setEditPayment(p)} className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold">Edit</button>
                              <button onClick={() => handleDeletePayment(p.id)} className="text-xs text-red-400 hover:text-red-600 font-semibold">Del</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </main>
        );
      })()}

      {/* ── List View ───────────────────────────────────────── */}
      {view === 'list' && (
        <main className="max-w-7xl mx-auto px-6 py-7 space-y-6">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KPICard label="Total Units" value={String(units.length)} />
            <KPICard label="Active Tenants" value={String(activeUnits.length)} />
            <KPICard label="Monthly Expected" value={currency(monthlyExpected)} />
            <KPICard label="Collected This Month" value={currency(collectedThisMonth)} />
            <KPICard label="Overdue" value={String(overdueCount)} sub={overdueCount > 0 ? 'units past due' : 'all current'} />
          </div>

          {/* Alerts */}
          {alerts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <h3 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                Overdue Rent — {alerts.length} {alerts.length === 1 ? 'unit' : 'units'}
              </h3>
              <div className="space-y-2">
                {alerts.map(a => (
                  <div key={a.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-amber-100">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{a.address}{a.unit_number ? ` · ${a.unit_number}` : ''}</p>
                      <p className="text-xs text-slate-400">{a.tenant_first_name ? `${a.tenant_first_name} ${a.tenant_last_name}` : 'No tenant'} · {currency(a.monthly_rent)}/mo</p>
                    </div>
                    <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-lg">{a.days_overdue}d overdue</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter + Search */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="text" placeholder="Search address, tenant…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <select
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="vacant">Vacant</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {filtered.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-slate-400 text-sm">No properties found.</p>
                <button onClick={() => setShowAdd(true)} className="mt-3 text-indigo-500 text-sm font-semibold hover:text-indigo-700">Add your first property →</button>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left text-xs font-semibold text-slate-500 px-6 py-3">Property</th>
                        <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Tenant</th>
                        <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">Monthly Rent</th>
                        <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Status</th>
                        <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">This Month</th>
                        <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Last Payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(u => {
                        const sc = STATUS_CONFIG[u.status] ?? STATUS_CONFIG.active;
                        return (
                          <tr key={u.id} onClick={() => openDetail(u)} className="border-b border-slate-50 hover:bg-indigo-50/30 cursor-pointer transition-colors">
                            <td className="px-6 py-3.5">
                              <p className="font-semibold text-slate-800">{u.address}{u.unit_number ? ` · ${u.unit_number}` : ''}</p>
                              <p className="text-xs text-slate-400">{[u.city, u.state].filter(Boolean).join(', ')}</p>
                            </td>
                            <td className="px-4 py-3.5 text-slate-600">
                              {u.tenant_first_name ? `${u.tenant_first_name} ${u.tenant_last_name}` : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3.5 text-right font-semibold text-slate-700">{currency(u.monthly_rent)}</td>
                            <td className="px-4 py-3.5">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              {u.status === 'active' ? (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${u.current_month_paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {u.current_month_paid ? 'Paid' : 'Unpaid'}
                                </span>
                              ) : <span className="text-slate-300 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3.5 text-slate-500 text-xs">{u.last_payment_date ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filtered.map(u => {
                    const sc = STATUS_CONFIG[u.status] ?? STATUS_CONFIG.active;
                    return (
                      <div key={u.id} onClick={() => openDetail(u)} className="px-5 py-4 cursor-pointer hover:bg-indigo-50/30 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{u.address}{u.unit_number ? ` · ${u.unit_number}` : ''}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{u.tenant_first_name ? `${u.tenant_first_name} ${u.tenant_last_name}` : 'Vacant'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-slate-700 text-sm">{currency(u.monthly_rent)}<span className="text-xs text-slate-400">/mo</span></p>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${sc.bg} ${sc.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </main>
      )}

      {/* ── Edit Unit Modal ──────────────────────────────────── */}
      {showEdit && selectedUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white">
              <h3 className="text-base font-bold text-slate-800">Edit Property</h3>
              <button onClick={closeEdit} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form ref={editFormRef} onSubmit={handleEditUnit} className="p-6 space-y-6">
              <FormSection title="Property">
                <div className="sm:col-span-2">
                  <Field label="Street Address" name="address" defaultValue={selectedUnit.address} required />
                </div>
                <Field label="City" name="city" defaultValue={selectedUnit.city ?? ''} />
                <Field label="State" name="state" defaultValue={selectedUnit.state ?? ''} />
                <Field label="ZIP" name="zip" defaultValue={selectedUnit.zip ?? ''} />
                <Field label="Unit / Suite #" name="unit_number" defaultValue={selectedUnit.unit_number ?? ''} />
                <SelectField label="Property Type" name="property_type" options={PROPERTY_TYPES} defaultValue={selectedUnit.property_type} />
              </FormSection>
              <FormSection title="Tenant">
                <Field label="First Name" name="tenant_first_name" defaultValue={selectedUnit.tenant_first_name ?? ''} />
                <Field label="Last Name" name="tenant_last_name" defaultValue={selectedUnit.tenant_last_name ?? ''} />
                <Field label="Email" name="tenant_email" type="email" defaultValue={selectedUnit.tenant_email ?? ''} />
                <Field label="Phone" name="tenant_phone" defaultValue={selectedUnit.tenant_phone ?? ''} />
              </FormSection>
              <FormSection title="Lease & Rent">
                <Field label="Monthly Rent ($)" name="monthly_rent" type="number" defaultValue={selectedUnit.monthly_rent} required />
                <Field label="Rent Due Day" name="rent_due_day" type="number" defaultValue={selectedUnit.rent_due_day} />
                <Field label="Lease Start" name="lease_start" type="date" defaultValue={selectedUnit.lease_start ?? ''} />
                <Field label="Lease End" name="lease_end" type="date" defaultValue={selectedUnit.lease_end ?? ''} />
                <SelectField label="Status" name="status" options={['active', 'vacant', 'inactive']} defaultValue={selectedUnit.status} />
              </FormSection>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
                <textarea name="notes" rows={2} defaultValue={selectedUnit.notes ?? ''} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </div>
              {formError && <p className="text-red-500 text-sm">{formError}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={closeEdit} className="flex-1 border border-slate-200 text-slate-600 font-semibold text-sm py-3 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
                <button type="submit" disabled={isPending} className="flex-1 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl transition-colors">
                  {isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Payment Modal ────────────────────────────────── */}
      {showAddPayment && selectedUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Record Payment</h3>
              <button onClick={() => setShowAddPayment(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleAddPayment} className="p-6 space-y-4">
              <Field label="Payment Date" name="payment_date" type="date" defaultValue={todayStr()} required />
              <Field label="Amount Paid ($)" name="amount_paid" type="number" defaultValue={selectedUnit.monthly_rent} required />
              <Field label="Period (YYYY-MM)" name="period_month" defaultValue={currentMonthStr()} required />
              <Field label="Late Fee ($)" name="late_fee" type="number" defaultValue={0} />
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
                <input type="text" name="notes" placeholder="Optional" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddPayment(false)} className="flex-1 border border-slate-200 text-slate-600 font-semibold text-sm py-3 rounded-xl hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={isPending} className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl">
                  {isPending ? 'Saving…' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Payment Modal ───────────────────────────────── */}
      {editPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Edit Payment</h3>
              <button onClick={() => setEditPayment(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleEditPayment} className="p-6 space-y-4">
              <Field label="Payment Date" name="payment_date" type="date" defaultValue={editPayment.payment_date} required />
              <Field label="Amount Paid ($)" name="amount_paid" type="number" defaultValue={editPayment.amount_paid} required />
              <Field label="Period (YYYY-MM)" name="period_month" defaultValue={editPayment.period_month} required />
              <Field label="Late Fee ($)" name="late_fee" type="number" defaultValue={editPayment.late_fee} />
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
                <input type="text" name="notes" defaultValue={editPayment.notes ?? ''} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditPayment(null)} className="flex-1 border border-slate-200 text-slate-600 font-semibold text-sm py-3 rounded-xl hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={isPending} className="flex-1 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl">
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
