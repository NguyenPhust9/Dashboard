import { redirect } from 'next/navigation';

// Authentication is intentionally disabled for this internal dashboard.
export default function LoginPage() {
  redirect('/');
}
