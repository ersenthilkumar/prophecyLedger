import { getSuggestedPayments, getPendingSuggestionsCount } from '@/app/actions/import';
import { getLoans } from '@/app/actions';
import { auth } from '@/auth';
import SuggestionsView from './SuggestionsView';

export default async function SuggestionsPage() {
  const [suggestions, count, loans, session] = await Promise.all([
    getSuggestedPayments(),
    getPendingSuggestionsCount(),
    getLoans(),
    auth(),
  ]);
  return (
    <SuggestionsView
      suggestions={suggestions}
      totalPending={count}
      loans={loans}
      userName={session?.user?.name ?? ''}
    />
  );
}
