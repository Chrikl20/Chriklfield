import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { required } from './config';

// Confirmation/recovery links may be opened in another browser. Their fragment
// credentials are verified by /auth/complete before an SSR cookie is established.
export function emailClient() {
  return createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      auth: {
        flowType: 'implicit',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
