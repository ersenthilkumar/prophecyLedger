import { connection } from 'next/server';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  await connection();
  return <LoginForm />;
}
