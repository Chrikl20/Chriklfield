import Link from 'next/link';
import credits from '../../../public/creator/credits.json';
import demoCredits from '../../../public/demo/credits.json';

export const metadata = { title: 'Bildnachweise — Chriklfield' };
export default function Credits() {
  return (
    <main className="credit-page">
      <Link href="/explore">← Zurück zum Studio</Link>
      <h1>Bildnachweise</h1>
      <p>
        Die Fotos in Explore und auf der Anmeldung sind visuelle Inspiration. Die abgebildeten
        Personen sind keine auf Chriklfield trainierten Charaktere und geben keine Empfehlung für
        das Produkt ab. Die Fotos werden nicht als Trainingsreferenzen verwendet.
      </p>
      <ul>
        {credits.map((c) => (
          <li key={c.file}>
            <a href={c.source} target="_blank" rel="noreferrer">
              {c.credit}
            </a>
            <small>
              {c.file} · <a href={c.license}>Unsplash-Lizenz</a>
            </small>
          </li>
        ))}
      </ul>
      <h2 style={{ marginTop: 30 }}>Weitere Demo-Fotos</h2>
      <ul>
        {demoCredits.map((c) => (
          <li key={c.file}>
            <a href={c.source} target="_blank" rel="noreferrer">
              {c.author} / Unsplash
            </a>
            <small>
              {c.file} · <a href={c.license}>Unsplash-Lizenz</a>
            </small>
          </li>
        ))}
      </ul>
    </main>
  );
}
