'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Check } from 'lucide-react';
import { accountHref, safeDestination, type AccountSession } from '@/domain/account';
import { api } from './studio-context';

export type AccountView = 'login' | 'signup' | 'forgot' | 'reset';
const slides = [
  {
    title: 'Eine Identität.\nUnendlich viele Ideen.',
    tag: '01 / DEIN CHARAKTER',
    cover: '/creator/style.webp',
    copy: 'Entwickle deinen eigenen Influencer und behalte seine Referenzen an einem Ort.',
  },
  {
    title: 'Dein Alltag.\nNeu inszeniert.',
    tag: '02 / DEIN CONTENT',
    cover: '/creator/coffee.webp',
    copy: 'Von Coffee Runs bis Outfit Checks: finde einen Look und mach ihn zu deinem.',
  },
  {
    title: 'Mehr als ein Post.\nDeine nächste Story.',
    tag: '03 / DEINE BEWEGUNG',
    cover: '/creator/street.webp',
    copy: 'Bringe ausgewählte Bilder ins Video Studio und entwickle daraus deinen nächsten Clip.',
  },
];
export async function continueToStudio(next: string) {
  const session = await api<AccountSession>('auth/session');
  if (!session.authenticated)
    throw new Error('Deine Sitzung konnte nicht geladen werden. Bitte melde dich erneut an.');
  window.location.assign(
    session.preferences
      ? safeDestination(next)
      : `/onboarding?next=${encodeURIComponent(safeDestination(next))}`,
  );
}
export function AccountForm({ view }: { view: AccountView }) {
  const search = useSearchParams();
  const next = safeDestination(search.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [slide, setSlide] = useState(0);
  const content = slides[slide];
  const signup = view === 'signup',
    reset = view === 'reset',
    forgot = view === 'forgot';
  const title = signup
    ? 'Dein nächstes Kapitel.'
    : reset
      ? 'Ein neues Passwort.'
      : forgot
        ? 'Zurück in dein Studio.'
        : 'Schön, dass du da bist.';
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      try {
        sessionStorage.setItem('chriklfield:returnTo', next);
      } catch {
        /* Optional navigation hint. */
      }
      const result = await api<{ authenticated?: boolean; confirmationRequired?: boolean }>(
        `auth/${reset ? 'password' : view}`,
        'POST',
        reset ? { password } : forgot ? { email } : { email, password },
      );
      setPassword('');
      if (forgot || (signup && result.confirmationRequired)) {
        setSent(true);
        return;
      }
      await continueToStudio(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-page">
      <section className="account-art" aria-label="Entdecke dein Creator-Studio">
        <Image
          key={content.cover}
          src={content.cover}
          alt="Foto-Inspiration für deinen eigenen Content"
          fill
          sizes="(max-width: 760px) 100vw, 50vw"
          priority
        />
        <Link className="account-brand" href="/explore">
          <span className="brand-mark">cf</span> chriklfield
        </Link>
        <div className="account-art-copy" aria-live="polite">
          <span className="eyebrow">{content.tag}</span>
          <h2>{content.title}</h2>
          <p>{content.copy}</p>
          <div className="slide-dots" aria-label="Studio-Einblicke">
            {slides.map((s, i) => (
              <button
                key={s.tag}
                aria-label={`Einblick ${i + 1}`}
                aria-pressed={slide === i}
                onClick={() => setSlide(i)}
              />
            ))}
          </div>
        </div>
        <Link className="account-photo-note" href="/credits">
          Foto-Inspiration · Bildnachweise
        </Link>
      </section>
      <section className="account-panel">
        <Link className="account-back" href={next}>
          <ArrowLeft size={17} /> Weiter entdecken
        </Link>
        <div className="account-form-content">
          <span className="eyebrow">
            {signup ? 'CREATE YOUR INFLUENCE' : 'DEIN CREATOR STUDIO'}
          </span>
          <h1>{sent ? 'Schau in dein Postfach.' : title}</h1>
          <p className="account-lead">
            {sent
              ? forgot
                ? 'Falls ein Konto zu dieser Adresse besteht, erhältst du einen Link zum Setzen deines Passworts.'
                : 'Falls die Registrierung möglich ist, erhältst du eine E-Mail. Bestätige deine Adresse, um dein Studio zu öffnen. Bereits registriert? Melde dich an oder setze dein Passwort zurück.'
              : signup
                ? 'Erstelle deinen Account. Danach richten wir dein Studio auf deinen Content aus.'
                : forgot
                  ? 'Wir schicken dir einen Link. Auch wenn du bisher nur Anmeldelinks verwendet hast, kannst du damit ein Passwort setzen.'
                  : reset
                    ? 'Wähle ein sicheres Passwort für deinen Account.'
                    : 'Melde dich mit deiner E-Mail-Adresse und deinem Passwort an.'}
          </p>
          {sent ? (
            <div className="account-sent">
              <span className="account-mail">
                <Mail size={27} />
              </span>
              <p>Öffne den Link aus der neuesten E-Mail. Prüfe auch deinen Spam-Ordner.</p>
              <Link className="button primary" href={accountHref('login', next)}>
                Zur Anmeldung <ArrowRight size={17} />
              </Link>
              <Link className="text-button" href="/forgot-password">
                Passwort setzen oder zurücksetzen
              </Link>
            </div>
          ) : (
            <form className="form-stack" onSubmit={submit}>
              {!reset && (
                <label>
                  E-Mail-Adresse
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={254}
                    placeholder="du@beispiel.de"
                    required
                  />
                </label>
              )}
              {!forgot && (
                <label>
                  {reset ? 'Neues Passwort' : 'Passwort'}
                  <span className="password-field">
                    <input
                      type={visible ? 'text' : 'password'}
                      autoComplete={signup || reset ? 'new-password' : 'current-password'}
                      value={password}
                      minLength={signup || reset ? 10 : 1}
                      maxLength={128}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={signup || reset ? 'Mindestens 10 Zeichen' : 'Dein Passwort'}
                      required
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
                      aria-pressed={visible}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                  {(signup || reset) && (
                    <small className="password-hint">
                      <Check size={13} /> Mindestens 10 Zeichen. Eine lange Passphrase funktioniert
                      gut.
                    </small>
                  )}
                </label>
              )}
              {view === 'login' && (
                <Link
                  className="forgot-link"
                  href={`/forgot-password?next=${encodeURIComponent(next)}`}
                >
                  Passwort vergessen?
                </Link>
              )}
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary account-submit" disabled={busy}>
                {busy
                  ? 'Einen Moment …'
                  : signup
                    ? 'Account erstellen'
                    : reset
                      ? 'Passwort speichern'
                      : forgot
                        ? 'Link zum Zurücksetzen senden'
                        : 'Anmelden'}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          <div className="account-switch">
            {signup ? (
              <>
                Schon dabei? <Link href={accountHref('login', next)}>Anmelden</Link>
              </>
            ) : (
              <>
                Neu bei Chriklfield?{' '}
                <Link href={accountHref('signup', next)}>Account erstellen</Link>
              </>
            )}
          </div>
          <p className="account-private">
            <LockKeyhole size={15} /> Eigener Account. Privater Workspace.
          </p>
        </div>
        <small className="account-footnote">
          Erst entdecken, dann erstellen. Generierungen werden vor dem Start bepreist.
        </small>
      </section>
    </main>
  );
}
