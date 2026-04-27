// Plaid webhook disabled — to be re-enabled later.
/*
import { NextRequest, NextResponse } from 'next/server';
import { syncPlaidTransactions } from '@/app/actions/plaid';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false }, { status: 400 });

  const { webhook_type, webhook_code } = body as { webhook_type: string; webhook_code: string };

  if (webhook_type === 'TRANSACTIONS' && webhook_code === 'SYNC_UPDATES_AVAILABLE') {
    await syncPlaidTransactions().catch(console.error);
  }

  return NextResponse.json({ ok: true });
}
*/

export {};
