'use client';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Clapperboard,
  ScanFace,
  Images,
  MoveUpRight,
} from 'lucide-react';
import { useState } from 'react';
import { CREATOR_PRESETS } from '@/domain/creator-presets';
import { useStudio } from './studio-context';
import { preferredStudio } from '@/domain/account';

export function Explore() {
  const { data, selected, preferences, authenticated } = useStudio();
  const [category, setCategory] = useState('Alle');
  const presets = [...CREATOR_PRESETS]
    .sort(
      (a, b) => Number(b.category === preferences?.vibe) - Number(a.category === preferences?.vibe),
    )
    .filter((p) => category === 'Alle' || p.category === category);
  const character = data?.characters.find((c) => c.id === selected);
  const startImage = data?.assets.find((a) => a.kind === 'image' && a.character_id === selected);

  return (
    <div className="page creator-explore">
      <div className="creator-heading">
        <div>
          <span className="eyebrow">CHRIKLFIELD / EXPLORE</span>
          <h1>Dein nächster Content.</h1>
        </div>
        <Link className="button" href="/characters">
          <Plus size={17} /> Charakter erstellen
        </Link>
      </div>
      {preferences && (
        <div className="personalized-banner">
          <span>
            <strong>Dein Mix: {preferences.vibe}</strong>
            <small>
              Passende Vorlagen zuerst · Startwerte für{' '}
              {preferences.platform === 'tiktok'
                ? 'TikTok'
                : preferences.platform === 'youtube'
                  ? 'YouTube'
                  : 'Instagram'}
            </small>
          </span>
          <Link className="button compact" href={preferredStudio(preferences)}>
            Loslegen <ArrowRight size={15} />
          </Link>
          <Link className="text-button" href="/onboarding">
            Anpassen
          </Link>
        </div>
      )}
      {!authenticated && (
        <p className="guest-explore-note">
          Schau dich um. Wähle einen Look. Erstelle deinen Account, wenn du loslegen möchtest.
        </p>
      )}
      <section className="creator-features" aria-label="Dein Creator-Workflow">
        <article className="creator-hero">
          <div className="hero-portraits" aria-hidden="true">
            <Image
              src="/creator/style.webp"
              alt=""
              fill
              sizes="(max-width: 720px) 80vw, 35vw"
              loading="eager"
              className="hero-style"
            />
            <Image
              src="/creator/street.webp"
              alt=""
              fill
              sizes="(max-width: 720px) 60vw, 25vw"
              loading="eager"
              className="hero-street"
            />
          </div>
          <span className="inspiration-label">FOTO-INSPIRATION</span>
          <div className="hero-content">
            <span className="feature-kicker">
              <ScanFace size={15} /> AI INFLUENCER
            </span>
            <h2>
              Dein Charakter.
              <br />
              <em>Dein Feed.</em>
            </h2>
            <p>
              Entwickle deine eigene Identität.
              <br />
              Erstelle die Looks, Posts und Clips dazu.
            </p>
            <Link className="button primary" href="/characters">
              Charakter entwickeln <ArrowUpRight size={18} />
            </Link>
          </div>
          <span className="hero-bottomline">IDENTITÄT → BILDER → VIDEOS</span>
        </article>
        <Link
          className="creator-video-feature"
          href={startImage ? `/video?source=${startImage.id}` : '/video'}
        >
          <Image
            src="/creator/coffee.webp"
            alt="Foto-Inspiration: ein persönlicher Café-Moment"
            fill
            sizes="(max-width: 720px) 100vw, 25vw"
            loading="eager"
          />
          <span className="inspiration-label">FOTO-INSPIRATION</span>
          <span className="feature-arrow">
            <ArrowUpRight size={23} />
          </span>
          <div className="video-feature-copy">
            <span className="feature-kicker">
              <Clapperboard size={16} /> IMAGE TO VIDEO
            </span>
            <h2>
              Bring deinen
              <br />
              Feed in Bewegung.
            </h2>
            <span className="feature-cta">
              Bild animieren <ArrowRight size={17} />
            </span>
          </div>
        </Link>
      </section>
      <div className="creator-shortcuts">
        <Link href="/characters">
          <span className="shortcut-icon">
            <ScanFace size={22} />
          </span>
          <div>
            <strong>Deine Influencer</strong>
            <small>Identität & Referenzen</small>
          </div>
          <ArrowUpRight size={18} />
        </Link>
        <Link href="/image">
          <span className="shortcut-icon">
            <Images size={22} />
          </span>
          <div>
            <strong>Den nächsten Post erstellen</strong>
            <small>Charakter, Outfit, Szene</small>
          </div>
          <ArrowUpRight size={18} />
        </Link>
        <Link href="/video">
          <span className="shortcut-icon">
            <Clapperboard size={22} />
          </span>
          <div>
            <strong>Aus Bildern werden Clips</strong>
            <small>Animation & Motion Control</small>
          </div>
          <ArrowUpRight size={18} />
        </Link>
      </div>
      <section className="creator-preset-section" aria-labelledby="presets-title">
        <div className="creator-section-heading">
          <div>
            <span className="eyebrow">PICK A VIBE</span>
            <h2 id="presets-title">Ein Look. Dein nächster Post.</h2>
            <p>Wähle eine Vorlage und mach sie zu deiner.</p>
          </div>
          <span className="preset-count">
            {CREATOR_PRESETS.length} Content-Ideen <MoveUpRight size={17} />
          </span>
        </div>
        <div className="creator-filter-row">
          <div className="creator-filters" aria-label="Vorlagenkategorie">
            {['Alle', 'Fashion', 'Lifestyle', 'Beauty'].map((c) => (
              <button
                key={c}
                aria-pressed={category === c}
                className={category === c ? 'selected' : ''}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <span className="active-creator">
            <span className="private-dot" />
            {character ? `Mit ${character.name} erstellen` : 'Mit deinem Charakter erstellen'}
          </span>
        </div>
        <div className="creator-preset-grid" aria-live="polite">
          {presets.map((p) => (
            <Link
              className="creator-preset"
              key={p.id}
              href={`/image?preset=${p.id}`}
              aria-label={`${p.title} – Vorlage öffnen`}
            >
              <div className="preset-image">
                <Image
                  src={p.cover}
                  alt={`Foto-Inspiration für ${p.title}`}
                  fill
                  sizes="(max-width: 540px) 50vw, (max-width: 1100px) 30vw, 18vw"
                />
                <span className="preset-format">{p.format}</span>
                <span className="preset-open">
                  <ArrowUpRight size={21} />
                </span>
                <span className="preset-media-note">FOTO-INSPIRATION</span>
              </div>
              <div className="preset-caption">
                <h3>{p.title}</h3>
                <span>
                  {p.category}
                  <ArrowUpRight size={14} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="creator-next-step">
        <span className="next-step-icon">
          <ScanFace size={28} />
        </span>
        <div>
          <h2>Ein Charakter. Viele Möglichkeiten.</h2>
          <p>Referenzen bestätigen, Identität trainieren und neue Looks ausprobieren.</p>
        </div>
        <Link className="button" href="/characters">
          Zu deinen Characters <ArrowRight size={17} />
        </Link>
      </section>
      {!!data?.templates.length && (
        <details className="workspace-templates">
          <summary>
            Weitere Studio-Vorlagen <span>{data?.templates.length}</span>
          </summary>
          <div className="workspace-template-links">
            {data?.templates.map((t) => (
              <Link key={t.id} href={`/image?template=${t.id}`}>
                <span>
                  <strong>{t.title}</strong>
                  <small>
                    {t.category} · {t.format}
                  </small>
                </span>
                <ArrowUpRight size={18} />
              </Link>
            ))}
          </div>
        </details>
      )}
      <p className="creator-photo-note">
        Die Fotos dienen als Inspiration. Sie zeigen keine generierten Charaktere oder garantierten
        Ergebnisse. <Link href="/credits">Bildnachweise</Link>
      </p>
    </div>
  );
}
