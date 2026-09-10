'use client';
import { useState } from 'react';
import { ArrowRight, ScanFace, Clapperboard, LockKeyhole } from 'lucide-react';
import Image from 'next/image';
import { api } from '@/components/studio-context';
export default function Login() {
  const [email, setEmail] = useState(''),
    [sent, setSent] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-page influencer-login">
      <div className="influencer-login-art">
        <div className="login-brand">
          <span className="brand-mark">cf</span>
          <strong>chriklfield</strong>
          <span>AI INFLUENCER STUDIO</span>
        </div>
        <div className="login-content-cards" aria-hidden="true">
          <div className="login-look">
            <Image
              src="/creator/style.webp"
              alt=""
              fill
              sizes="(max-width: 720px) 65vw, 35vw"
              loading="eager"
            />
            <span>
              OUTFIT CHECK <b>9:16</b>
            </span>
          </div>
          <div className="login-moment">
            <Image
              src="/creator/coffee.webp"
              alt=""
              fill
              sizes="(max-width: 720px) 40vw, 25vw"
              loading="eager"
            />
            <span>
              COFFEE RUN <b>4:5</b>
            </span>
          </div>
        </div>
        <div className="login-art-copy">
          <span className="feature-kicker">
            <ScanFace size={17} /> CREATE YOUR INFLUENCE
          </span>
          <h1>
            Dein Charakter.
            <br />
            <em>Dein Feed.</em>
          </h1>
          <p>Eigene AI Influencer. Neue Looks. Dein Content.</p>
          <div className="login-workflow">
            <span>01 Identität</span>
            <ArrowRight size={14} />
            <span>02 Bilder</span>
            <ArrowRight size={14} />
            <span>03 Clips</span>
            <Clapperboard size={16} />
          </div>
        </div>
        <a className="login-photo-note" href="/credits">
          Foto-Inspiration · Bildnachweise
        </a>
      </div>
      <div className="login-form">
        <span className="eyebrow">DEIN CONTENT BEGINNT HIER</span>
        <h2>Willkommen im Studio.</h2>
        <p>Deine Charaktere, Bilder und Clips an einem Ort. Melde dich mit einem E-Mail-Link an.</p>
        {sent ? (
          <div className="notice">Prüfe dein Postfach und öffne den Anmeldelink.</div>
        ) : (
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
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
        <p className="login-private">
          <LockKeyhole size={15} /> Dein Workspace. Deine Medien. Privat.
        </p>
      </div>
    </div>
  );
}
