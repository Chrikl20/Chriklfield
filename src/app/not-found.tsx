import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>Diese Seite gibt es nicht.</h1>
      <Link className="button primary" href="/explore">
        Zurück ins Studio
      </Link>
    </div>
  );
}
