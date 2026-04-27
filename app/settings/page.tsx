import { auth } from '@/auth';
import { getRecentUploads } from '@/app/actions/import';
import SettingsView from './SettingsView';

export default async function SettingsPage() {
  const [session, uploads] = await Promise.all([auth(), getRecentUploads()]);
  return <SettingsView userName={session?.user?.name ?? ''} uploads={uploads} />;
}
