'use client';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, LockKeyhole } from 'lucide-react';
import { useStudio } from './studio-context';

const introductions: Record<string, [string, string, string]> = {
  '/characters': [
    'Dein Influencer beginnt mit einer Identität.',
    'Sammle Referenzen, halte Gesichts- und Körpermerkmale fest und trainiere deine eigenen Charakterversionen.',
    'Charakter erstellen',
  ],
  '/library': [
    'Dein Content. An einem Ort.',
    'Speichere Bilder und Clips privat, markiere Favoriten und bringe deine besten Bilder direkt ins Video Studio.',
    'Meine Library öffnen',
  ],
  '/billing': [
    'Du entscheidest, was du erstellst.',
    'Vor jeder Generierung erhältst du ein verbindliches Credit-Angebot. Erst mit deiner Bestätigung startet der Auftrag.',
    'Credits & Verbrauch ansehen',
  ],
};
export function GuestWorkspace({ path }: { path: string }) {
  const { requireAccount } = useStudio();
  const [title, copy, action] = introductions[path] || [
    'Dein privater Arbeitsbereich.',
    'Melde dich an, um auf deinen Workspace zuzugreifen.',
    'Anmelden',
  ];
  return (
    <section className="guest-workspace page">
      <div className="guest-workspace-art">
        <Image
          src="/creator/style.webp"
          alt="Foto-Inspiration für deinen Creator-Workflow"
          fill
          sizes="(max-width: 720px) 90vw, 400px"
        />
        <span>FOTO-INSPIRATION</span>
      </div>
      <div>
        <span className="eyebrow">DEIN NÄCHSTER SCHRITT</span>
        <h1>{title}</h1>
        <p>{copy}</p>
        <button className="button primary" onClick={requireAccount}>
          {action}
          <ArrowUpRight size={18} />
        </button>
        <Link className="text-button" href="/explore">
          Vorlagen entdecken
        </Link>
        <small>
          <LockKeyhole size={14} /> Deine Charaktere und Ergebnisse bleiben privat.
        </small>
      </div>
    </section>
  );
}
