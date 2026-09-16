'use client';
import { useEffect, useRef, useState } from 'react';
import { authMessages, readAuthReturn } from '@/domain/auth-link';
import { api } from './studio-context';
import { continueToStudio } from './account-form';
import { safeDestination } from '@/domain/account';

export function AuthCallback() {
  const started = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Capture only supported credentials, then remove them from history before
    // any request or navigation. Tokens are sent in a same-origin POST body.
    const result = readAuthReturn(window.location.href);
    const recovery = new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';
    window.history.replaceState(null, '', '/auth/callback');
    async function complete() {
      if (typeof result === 'string') {
        setError(authMessages[result]);
        return;
      }
      try {
        await api('auth/complete', 'POST', result);
        // Full navigation starts studio requests only after cookies are persisted.
        if (recovery) {
          window.location.replace('/reset-password');
          return;
        }
        let next = '/explore';
        try {
          next = safeDestination(sessionStorage.getItem('chriklfield:returnTo'));
          sessionStorage.removeItem('chriklfield:returnTo');
        } catch {
          /* Default to Explore. */
        }
        await continueToStudio(next);
      } catch (error) {
        setError(error instanceof Error ? error.message : authMessages.AUTH_UNAVAILABLE);
      }
    }
    void complete();
  }, []);
  return (
    <main className="auth-callback">
      <span className="brand-mark" aria-hidden="true">
        cf
      </span>
      <p className="eyebrow">DEIN CREATOR STUDIO</p>
      <h1>{error ? 'Anmeldung nicht abgeschlossen' : 'Dein Studio wird geöffnet …'}</h1>
      {error ? (
        <>
          <p role="alert" className="inline-error">
            {error}
          </p>
          <a className="button primary" href="/login">
            Zur Anmeldung
          </a>
        </>
      ) : (
        <p role="status">Wir prüfen deinen Anmeldelink. Einen Moment bitte.</p>
      )}
      <noscript>Bitte aktiviere JavaScript, um deinen Anmeldelink zu bestätigen.</noscript>
    </main>
  );
}
