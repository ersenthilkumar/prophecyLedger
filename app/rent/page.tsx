import { connection } from 'next/server';
import { auth } from '@/auth';
import { getRentUnits, getRentAlerts, getCollectedThisMonth } from '@/app/actions/rent';
import RentTracker from './RentTracker';

export default async function RentPage() {
  await connection();
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
}
