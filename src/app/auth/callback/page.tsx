import type { Metadata } from 'next';
import { AuthCallback } from '@/components/auth-callback';

export const metadata: Metadata = {
  title: 'Anmeldung abschliessen · Chriklfield',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function CallbackPage() {
  return <AuthCallback />;
}
