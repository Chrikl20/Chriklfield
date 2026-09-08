'use client';
import Link from 'next/link';
import { ArrowUpRight, Plus, ImagePlus, Clapperboard, UsersRound, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useStudio } from './studio-context';
import { Loading, PageTitle } from './ui';
export function Explore() {
  const { data } = useStudio();
  const [category, setCategory] = useState('Alle');
  if (!data) return <Loading />;
  const templates = data.templates.filter((t) => category === 'Alle' || t.category === category);
  return (
    <div className="page explore">
      <PageTitle
        eyebrow="DEIN NÄCHSTES PROJEKT"
        title="Was erschaffst du heute?"
        description="Eine Identität. Neue Szenen. Deine Handschrift."
        action={
          <Link className="button primary" href="/characters">
            <Plus size={17} />
            Charakter erstellen
          </Link>
        }
      />
      <div className="quick-actions">
        <Link href="/characters">
          <span className="action-icon">
            <UsersRound />
          </span>
          <div>
            <strong>Dein Charakter</strong>
            <span>Identität & Referenzen verwalten</span>
          </div>
          <ArrowUpRight size={20} />
        </Link>
        <Link href="/image">
          <span className="action-icon">
            <ImagePlus />
          </span>
          <div>
            <strong>Bilder erstellen</strong>
            <span>Aus einer Idee wird eine Szene</span>
          </div>
          <ArrowUpRight size={20} />
        </Link>
        <Link href="/video">
          <span className="action-icon">
            <Clapperboard />
          </span>
          <div>
            <strong>In Bewegung bringen</strong>
            <span>Ein Bild wird zum Video</span>
          </div>
          <ArrowUpRight size={20} />
        </Link>
      </div>
      <div className="section-heading">
        <div>
          <h2>Die nächste Szene beginnt hier.</h2>
          <p>Kuratierte Vorlagen für deinen Charakter.</p>
        </div>
        <span className="pill">{data.templates.length} Vorlagen</span>
      </div>
      <div className="tabs" aria-label="Vorlagenkategorie">
        {['Alle', 'Lifestyle', 'Editorial', 'Portrait'].map((c) => (
          <button
            className={category === c ? 'selected' : ''}
            key={c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="template-grid">
        {templates.map((t, i) => (
          <Link
            className={`template-card template-${t.id}`}
            key={t.id}
            href={`/image?template=${t.id}`}
          >
            <img
              src={t.cover}
              alt={`${t.title}: Szenenreferenz`}
              loading={i > 1 ? 'lazy' : 'eager'}
            />
            <div className="template-shade" />
            <span className="media-label">SZENENREFERENZ</span>
            <span className="template-use">
              <ArrowUpRight size={22} />
            </span>
            <div className="template-copy">
              <span>
                {t.category} <span>·</span> {t.format}
              </span>
              <h3>{t.title}</h3>
              <p>
                Mit deinem Charakter öffnen <ArrowRight size={15} />
              </p>
            </div>
          </Link>
        ))}
      </div>
      <div className="workflow-note">
        <div className="monogram">01—04</div>
        <div>
          <strong>Vom Charakter zum fertigen Clip.</strong>
          <p>Referenzen bestätigen, LoRA trainieren, ein Bild auswählen und animieren.</p>
        </div>
        <Link href="/characters">
          Mit einer Identität anfangen <ArrowRight size={17} />
        </Link>
      </div>
      <p className="photo-credit">
        Szenenfotos: Griffin Wooldridge, Uran Wang und JC Bonassin / Unsplash. Sie zeigen keine
        Modellergebnisse.
      </p>
    </div>
  );
}
