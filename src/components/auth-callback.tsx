'use client';
import { useEffect, useRef, useState } from 'react';
import { authMessages, readAuthReturn } from '@/domain/auth-link';
import { api } from './studio-context';

export function AuthCallback() {
  const started = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Capture only supported credentials, then remove them from history before
    // any request or navigation. Tokens are sent in a same-origin POST body.
    const result = readAuthReturn(window.location.href);
    window.history.replaceState(null, '', '/auth/callback');
    async function complete() {
      if (typeof result === 'string') {
        setError(authMessages[result]);
        return;
      }
      try {
        await api('auth/complete', 'POST', result);
        // Full navigation starts studio requests only after cookies are persisted.
        window.location.replace('/explore');
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
            Neuen Anmeldelink anfordern
          </a>
        </>
      ) : (
        <p role="status">Wir prüfen deinen Anmeldelink. Einen Moment bitte.</p>
      )}
      <noscript>Bitte aktiviere JavaScript, um deinen Anmeldelink zu bestätigen.</noscript>
    </main>
  );
}
