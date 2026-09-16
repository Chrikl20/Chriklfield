'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clapperboard,
  Images,
  ScanFace,
  Sparkles,
} from 'lucide-react';
import {
  defaultPreferences,
  preferredFormat,
  safeDestination,
  type CreatorPreferences,
} from '@/domain/account';
import { api, useStudio } from './studio-context';
import { Loading } from './ui';

export function Onboarding() {
  const { sessionReady, authenticated, preferences } = useStudio();
  if (!sessionReady) return <Loading />;
  if (!authenticated)
    return (
      <main className="auth-callback">
        <h1>Dein persönliches Studio</h1>
        <p>Melde dich an, um deine Vorlieben in deinem Account zu speichern.</p>
        <Link className="button primary" href="/login?next=%2Fexplore">
          Anmelden
        </Link>
        <Link href="/explore">Weiter entdecken</Link>
      </main>
    );
  return <Wizard initial={preferences || defaultPreferences} />;
}
function Wizard({ initial }: { initial: CreatorPreferences }) {
  const query = useSearchParams();
  const [answers, setAnswers] = useState(initial);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titles = ['Was möchtest du erschaffen?', 'Was ist dein Vibe?', 'Wo lebt dein Content?'];
  const descriptions = [
    'Wir legen dir den passenden Arbeitsbereich bereit.',
    'Diese Vorlagen zeigen wir dir zuerst. Du kannst trotzdem alle Looks entdecken.',
    'Damit passen wir das Standardformat für neue Bilder an.',
  ];
  const covers = [
    '/creator/style.webp',
    answers.vibe === 'Beauty'
      ? '/creator/beauty.webp'
      : answers.vibe === 'Fashion'
        ? '/creator/street.webp'
        : '/creator/coffee.webp',
    '/creator/man.webp',
  ];
  const goals = [
    {
      value: 'influencer',
      title: 'Mein eigener AI Influencer',
      copy: 'Identität entwickeln, Referenzen sammeln, Charakter trainieren.',
      Icon: ScanFace,
    },
    {
      value: 'images',
      title: 'Bilder für meinen Feed',
      copy: 'Looks, Kampagnen und spontane Content-Ideen ausprobieren.',
      Icon: Images,
    },
    {
      value: 'video',
      title: 'Clips, die auffallen',
      copy: 'Bilder animieren und Bewegungen in Szene setzen.',
      Icon: Clapperboard,
    },
  ] as const;
  async function finish(skip = false) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('auth/profile', 'POST', skip ? defaultPreferences : answers);
      window.location.assign(safeDestination(query.get('next')));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="onboarding-page">
      <header>
        <Link className="account-brand" href="/explore">
          <span className="brand-mark">cf</span> chriklfield
        </Link>
        <button className="text-button" disabled={busy} onClick={() => void finish(true)}>
          Später einrichten
        </button>
      </header>
      <div className="onboarding-card">
        <section className="onboarding-questions">
          <div className="onboarding-progress" aria-label={`Schritt ${step + 1} von 3`}>
            {titles.map((title, i) => (
              <span className={i <= step ? 'complete' : ''} key={title} />
            ))}
          </div>
          <span className="eyebrow">DEIN STUDIO, DEINE REGELN · {step + 1}/3</span>
          <div className="onboarding-step" key={step}>
            <h1>{titles[step]}</h1>
            <p>{descriptions[step]}</p>
            <div className="onboarding-options" role="group" aria-label={titles[step]}>
              {step === 0 &&
                goals.map(({ value, title, copy, Icon }) => (
                  <button
                    key={value}
                    className={answers.goal === value ? 'chosen' : ''}
                    aria-pressed={answers.goal === value}
                    onClick={() => setAnswers({ ...answers, goal: value })}
                  >
                    <Icon size={23} />
                    <span>
                      <strong>{title}</strong>
                      <small>{copy}</small>
                    </span>
                    {answers.goal === value && <Check size={17} />}
                  </button>
                ))}
              {step === 1 &&
                (['Fashion', 'Lifestyle', 'Beauty'] as const).map((vibe) => (
                  <button
                    key={vibe}
                    className={answers.vibe === vibe ? 'chosen' : ''}
                    aria-pressed={answers.vibe === vibe}
                    onClick={() => setAnswers({ ...answers, vibe })}
                  >
                    <Image
                      src={
                        vibe === 'Fashion'
                          ? '/creator/style.webp'
                          : vibe === 'Beauty'
                            ? '/creator/beauty.webp'
                            : '/creator/coffee.webp'
                      }
                      alt=""
                      width={46}
                      height={55}
                    />
                    <span>
                      <strong>{vibe}</strong>
                      <small>
                        {vibe === 'Fashion'
                          ? 'Outfit Checks & Street Looks'
                          : vibe === 'Beauty'
                            ? 'Portraits & Main Character Energy'
                            : 'Coffee Runs & Weekend Stories'}
                      </small>
                    </span>
                    {answers.vibe === vibe && <Check size={17} />}
                  </button>
                ))}
              {step === 2 &&
                (
                  [
                    ['instagram', 'Instagram', '4:5 · Mehr Platz für deinen Feed'],
                    ['tiktok', 'TikTok / Reels', '9:16 · Für den ganzen Screen'],
                    ['youtube', 'YouTube', '16:9 · Platz für deine Story'],
                  ] as const
                ).map(([value, title, copy]) => (
                  <button
                    key={value}
                    className={answers.platform === value ? 'chosen' : ''}
                    aria-pressed={answers.platform === value}
                    onClick={() => setAnswers({ ...answers, platform: value })}
                  >
                    <span className={`format-icon format-${value}`} />
                    <span>
                      <strong>{title}</strong>
                      <small>{copy}</small>
                    </span>
                    {answers.platform === value && <Check size={17} />}
                  </button>
                ))}
            </div>
          </div>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="onboarding-actions">
            <button
              className="text-button"
              disabled={step === 0 || busy}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={16} /> Zurück
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => (step < 2 ? setStep(step + 1) : void finish())}
            >
              {busy ? 'Wird gespeichert …' : step < 2 ? 'Weiter' : 'Mein Studio öffnen'}
              <ArrowRight size={17} />
            </button>
          </div>
          <small className="onboarding-footnote">
            Jederzeit unter „Studio personalisieren“ anpassbar.
          </small>
        </section>
        <aside className="onboarding-visual">
          <Image
            key={covers[step]}
            src={covers[step]}
            alt="Foto-Inspiration für deine Content-Auswahl"
            fill
            sizes="(max-width: 760px) 100vw, 40vw"
          />
          <span className="inspiration-label">FOTO-INSPIRATION</span>
          <div>
            <span className="eyebrow">
              <Sparkles size={14} /> DEIN CREATOR-MIX
            </span>
            <h2>
              {answers.vibe}.<br />
              <em>Made for your feed.</em>
            </h2>
            <p>{goals.find((g) => g.value === answers.goal)?.title}</p>
            <span className="onboarding-format">
              {preferredFormat(answers)} · Dein Standardformat
            </span>
          </div>
        </aside>
      </div>
    </main>
  );
}
