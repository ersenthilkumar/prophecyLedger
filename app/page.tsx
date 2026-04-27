import { getLoans, getAlerts } from './actions';
import LoanTracker from './components/LoanTracker';
import { auth } from '@/auth';

export default async function Home() {
  const [loans, alerts, session] = await Promise.all([getLoans(), getAlerts(), auth()]);
  return <LoanTracker initialLoans={loans} alerts={alerts} userName={session?.user?.name ?? ''} />;
}
