import { notFound } from 'next/navigation';
import { getLoanById, getPayments } from '@/app/actions';
import LedgerView from './LedgerView';

export default async function LedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loanId = parseInt(id);
  if (isNaN(loanId)) notFound();

  const [loan, payments] = await Promise.all([getLoanById(loanId), getPayments(loanId)]);
  if (!loan) notFound();

  return <LedgerView loan={loan} payments={payments} />;
}
