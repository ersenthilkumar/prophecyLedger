import { connection } from 'next/server';
import { getAllPayments, getMissingInterestMonths } from '@/app/actions';
import PaymentsView from './PaymentsView';

export default async function PaymentsPage() {
  await connection();
  const [payments, warnings] = await Promise.all([getAllPayments(), getMissingInterestMonths()]);
  return <PaymentsView payments={payments} warnings={warnings} />;
}
