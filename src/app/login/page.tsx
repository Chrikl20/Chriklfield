'use client';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api } from '@/components/studio-context';
export default function Login() {
  const [email, setEmail] = useState(''),
    [sent, setSent] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <div className="login-art">
        <img src="/demo/coast.jpg" alt="Küstenlandschaft" />
        <div>
          <span className="brand-mark">cf</span>
          <h1>
            Deine Ideen.
            <br />
            Deine Identität.
          </h1>
          <p>Chriklfield Creator Studio</p>
        </div>
      </div>
      <div className="login-form">
        <span className="eyebrow">CHRIKLFIELD</span>
        <h2>Willkommen im Studio.</h2>
        <p>Melde dich mit einem sicheren E-Mail-Link an.</p>
        {sent ? (
          <div className="notice">Prüfe dein Postfach und öffne den Anmeldelink.</div>
        ) : (
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api('auth/login', 'POST', { email });
                setSent(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              E-Mail-Adresse
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="du@beispiel.ch"
              />
            </label>
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? 'Wird gesendet …' : 'Anmeldelink senden'}
              <ArrowRight size={17} />
            </button>
          </form>
        )}
        <p className="muted">Dein Workspace und deine Medien bleiben privat.</p>
      </div>
    </div>
  );
}
