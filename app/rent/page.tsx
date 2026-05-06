import { connection } from 'next/server';
import { auth } from '@/auth';
import { getRentUnits, getRentAlerts, getCollectedThisMonth } from '@/app/actions/rent';
import RentTracker from './RentTracker';

export default async function RentPage() {
  await connection();
  try {
    const [units, alerts, collectedThisMonth, session] = await Promise.all([
      getRentUnits(),
      getRentAlerts(),
      getCollectedThisMonth(),
      auth(),
    ]);
    return (
      <RentTracker
        initialUnits={units}
        alerts={alerts}
        collectedThisMonth={collectedThisMonth}
        userName={session?.user?.name ?? ''}
      />
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const isMissingTable = msg.includes('relation') && msg.includes('does not exist');
    return (
      <div className="min-h-screen bg-[#F2F5FB] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 max-w-lg w-full">
          <h2 className="text-lg font-bold text-slate-800 mb-2">Database setup required</h2>
          {isMissingTable ? (
            <>
              <p className="text-slate-500 text-sm mb-4">
                The <code className="bg-slate-100 px-1 rounded text-xs">rent_units</code> and{' '}
                <code className="bg-slate-100 px-1 rounded text-xs">rent_payments</code> tables don&apos;t exist yet.
                Run the following SQL in your Neon SQL Editor:
              </p>
              <pre className="bg-slate-900 text-emerald-300 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">{`CREATE TABLE IF NOT EXISTS rent_units (
  id                SERIAL PRIMARY KEY,
  address           TEXT NOT NULL,
  city              TEXT, state TEXT, zip TEXT,
  unit_number       TEXT,
  property_type     TEXT DEFAULT 'Residential',
  tenant_first_name TEXT, tenant_last_name TEXT,
  tenant_email      TEXT, tenant_phone TEXT,
  monthly_rent      NUMERIC(10,2) NOT NULL,
  rent_due_day      INTEGER DEFAULT 1,
  lease_start       DATE, lease_end DATE,
  status            TEXT DEFAULT 'active',
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rent_payments (
  id            SERIAL PRIMARY KEY,
  unit_id       INTEGER NOT NULL REFERENCES rent_units(id) ON DELETE CASCADE,
  payment_date  DATE NOT NULL,
  amount_paid   NUMERIC(10,2) NOT NULL,
  period_month  TEXT NOT NULL,
  late_fee      NUMERIC(10,2) DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);`}</pre>
            </>
          ) : (
            <p className="text-red-500 text-sm font-mono">{msg}</p>
          )}
        </div>
      </div>
    );
  }
}
