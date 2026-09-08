import { NextResponse } from 'next/server';
import { userClient } from '@/lib/supabase/server';
import { appUrl } from '@/server/config';
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code');
  if (code) {
    const { error } = await (await userClient()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${appUrl()}/explore`);
  }
  return NextResponse.redirect(`${appUrl()}/login?error=authentication`);
}
