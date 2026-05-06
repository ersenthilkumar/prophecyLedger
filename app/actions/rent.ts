'use server';

import { sql } from '@/lib/db';
import { revalidatePath } from 'next/cache';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RentUnit = {
  id: number;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  unit_number: string | null;
  property_type: string;
  tenant_first_name: string | null;
  tenant_last_name: string | null;
  tenant_email: string | null;
  tenant_phone: string | null;
  monthly_rent: number;
  rent_due_day: number;
  lease_start: string | null;
  lease_end: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  last_payment_date: string | null;
  last_payment_amount: number | null;
  current_month_paid: boolean;
};

export type RentPayment = {
  id: number;
  unit_id: number;
  payment_date: string;
  amount_paid: number;
  period_month: string;
  late_fee: number;
  notes: string | null;
  created_at: string;
};

export type RentAlert = {
  id: number;
  address: string;
  unit_number: string | null;
  tenant_first_name: string | null;
  tenant_last_name: string | null;
  monthly_rent: number;
  days_overdue: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function str(fd: FormData, k: string) { return (fd.get(k) as string | null)?.trim() ?? ''; }
function num(fd: FormData, k: string) { return parseFloat(str(fd, k)) || 0; }
function optStr(fd: FormData, k: string) { const v = str(fd, k); return v || null; }
function optInt(fd: FormData, k: string) { const v = str(fd, k); return v ? parseInt(v) : null; }

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getRentUnits(): Promise<RentUnit[]> {
  const rows = await sql`
    SELECT
      u.id,
      u.address, u.city, u.state, u.zip, u.unit_number,
      u.property_type,
      u.tenant_first_name, u.tenant_last_name,
      u.tenant_email, u.tenant_phone,
      u.monthly_rent::float AS monthly_rent,
      u.rent_due_day,
      TO_CHAR(u.lease_start, 'YYYY-MM-DD') AS lease_start,
      TO_CHAR(u.lease_end,   'YYYY-MM-DD') AS lease_end,
      u.status, u.notes,
      u.created_at::text AS created_at,
      (SELECT TO_CHAR(p.payment_date, 'YYYY-MM-DD')
         FROM rent_payments p WHERE p.unit_id = u.id
         ORDER BY p.payment_date DESC LIMIT 1) AS last_payment_date,
      (SELECT p.amount_paid::float
         FROM rent_payments p WHERE p.unit_id = u.id
         ORDER BY p.payment_date DESC LIMIT 1) AS last_payment_amount,
      EXISTS(
        SELECT 1 FROM rent_payments p
        WHERE p.unit_id = u.id
          AND p.period_month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
      ) AS current_month_paid
    FROM rent_units u
    ORDER BY u.address, u.unit_number NULLS FIRST
  `;
  return rows as RentUnit[];
}

export async function getRentPayments(unitId: number): Promise<RentPayment[]> {
  const rows = await sql`
    SELECT
      id, unit_id,
      TO_CHAR(payment_date, 'YYYY-MM-DD') AS payment_date,
      amount_paid::float AS amount_paid,
      period_month,
      COALESCE(late_fee, 0)::float AS late_fee,
      notes,
      created_at::text AS created_at
    FROM rent_payments
    WHERE unit_id = ${unitId}
    ORDER BY payment_date DESC
  `;
  return rows as RentPayment[];
}

export async function getRentAlerts(): Promise<RentAlert[]> {
  const rows = await sql`
    SELECT
      u.id, u.address, u.unit_number,
      u.tenant_first_name, u.tenant_last_name,
      u.monthly_rent::float AS monthly_rent,
      (EXTRACT(DAY FROM CURRENT_DATE) - u.rent_due_day)::int AS days_overdue
    FROM rent_units u
    WHERE u.status = 'active'
      AND EXTRACT(DAY FROM CURRENT_DATE) > u.rent_due_day
      AND NOT EXISTS (
        SELECT 1 FROM rent_payments p
        WHERE p.unit_id = u.id
          AND p.period_month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
      )
    ORDER BY days_overdue DESC
  `;
  return rows as RentAlert[];
}

export async function getCollectedThisMonth(): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(SUM(amount_paid), 0)::float AS total
    FROM rent_payments
    WHERE period_month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
  `;
  return (rows[0]?.total as number) ?? 0;
}

// ─── Unit mutations ───────────────────────────────────────────────────────────

export async function addRentUnit(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await sql`
      INSERT INTO rent_units (
        address, city, state, zip, unit_number, property_type,
        tenant_first_name, tenant_last_name, tenant_email, tenant_phone,
        monthly_rent, rent_due_day,
        lease_start, lease_end, status, notes
      ) VALUES (
        ${str(formData, 'address')},
        ${optStr(formData, 'city')},
        ${optStr(formData, 'state')},
        ${optStr(formData, 'zip')},
        ${optStr(formData, 'unit_number')},
        ${str(formData, 'property_type') || 'Residential'},
        ${optStr(formData, 'tenant_first_name')},
        ${optStr(formData, 'tenant_last_name')},
        ${optStr(formData, 'tenant_email')},
        ${optStr(formData, 'tenant_phone')},
        ${num(formData, 'monthly_rent')},
        ${optInt(formData, 'rent_due_day') ?? 1},
        ${optStr(formData, 'lease_start')},
        ${optStr(formData, 'lease_end')},
        ${str(formData, 'status') || 'active'},
        ${optStr(formData, 'notes')}
      )
    `;
    revalidatePath('/rent');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to save unit.' };
  }
}

export async function updateRentUnit(
  id: number,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await sql`
      UPDATE rent_units SET
        address            = ${str(formData, 'address')},
        city               = ${optStr(formData, 'city')},
        state              = ${optStr(formData, 'state')},
        zip                = ${optStr(formData, 'zip')},
        unit_number        = ${optStr(formData, 'unit_number')},
        property_type      = ${str(formData, 'property_type') || 'Residential'},
        tenant_first_name  = ${optStr(formData, 'tenant_first_name')},
        tenant_last_name   = ${optStr(formData, 'tenant_last_name')},
        tenant_email       = ${optStr(formData, 'tenant_email')},
        tenant_phone       = ${optStr(formData, 'tenant_phone')},
        monthly_rent       = ${num(formData, 'monthly_rent')},
        rent_due_day       = ${optInt(formData, 'rent_due_day') ?? 1},
        lease_start        = ${optStr(formData, 'lease_start')},
        lease_end          = ${optStr(formData, 'lease_end')},
        status             = ${str(formData, 'status') || 'active'},
        notes              = ${optStr(formData, 'notes')}
      WHERE id = ${id}
    `;
    revalidatePath('/rent');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to update unit.' };
  }
}

export async function deleteRentUnit(id: number): Promise<void> {
  await sql`DELETE FROM rent_units WHERE id = ${id}`;
  revalidatePath('/rent');
}

// ─── Payment mutations ────────────────────────────────────────────────────────

export async function addRentPayment(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await sql`
      INSERT INTO rent_payments (unit_id, payment_date, amount_paid, period_month, late_fee, notes)
      VALUES (
        ${parseInt(str(formData, 'unit_id'))},
        ${str(formData, 'payment_date')},
        ${num(formData, 'amount_paid')},
        ${str(formData, 'period_month')},
        ${num(formData, 'late_fee')},
        ${optStr(formData, 'notes')}
      )
    `;
    revalidatePath('/rent');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to save payment.' };
  }
}

export async function updateRentPayment(
  id: number,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await sql`
      UPDATE rent_payments SET
        payment_date = ${str(formData, 'payment_date')},
        amount_paid  = ${num(formData, 'amount_paid')},
        period_month = ${str(formData, 'period_month')},
        late_fee     = ${num(formData, 'late_fee')},
        notes        = ${optStr(formData, 'notes')}
      WHERE id = ${id}
    `;
    revalidatePath('/rent');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to update payment.' };
  }
}

export async function deleteRentPayment(id: number, unitId: number): Promise<void> {
  await sql`DELETE FROM rent_payments WHERE id = ${id}`;
  revalidatePath('/rent');
  revalidatePath(`/rent`);
}
