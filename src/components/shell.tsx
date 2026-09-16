'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Compass,
  UsersRound,
  ImagePlus,
  Clapperboard,
  Images,
  Wallet,
  SlidersHorizontal,
  ChevronDown,
  PanelLeftClose,
  Menu,
  LogOut,
  Diamond,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { api, useStudio } from './studio-context';
import { standalonePage, publicStudioPage, accountHref } from '@/domain/account';
import { GuestWorkspace } from './guest-workspace';
import { Loading } from './ui';
const nav = [
  ['/explore', 'Explore', Compass],
  ['/characters', 'Characters', UsersRound],
  ['/image', 'Image Studio', ImagePlus],
  ['/video', 'Video Studio', Clapperboard],
  ['/library', 'Library', Images],
  ['/billing', 'Billing', Wallet],
] as const;
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data, selected, select, notice, error, authenticated, sessionReady } = useStudio();
  const [open, setOpen] = useState(false);
  if (standalonePage(path)) return children;
  const active = nav.find((n) => n[0] === path)?.[1] || (path === '/' ? 'Explore' : 'Admin');
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Zum Inhalt
      </a>
      {open && (
        <button
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
          aria-label="Navigation schliessen"
        />
      )}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Link className="brand" href="/explore" onClick={() => setOpen(false)}>
          <span className="brand-mark">
            c<span>f</span>
          </span>
          <span>
            chriklfield<span className="brand-sub">AI INFLUENCER STUDIO</span>
          </span>
        </Link>
        <div className="workspace-picker">
          <span className="workspace-avatar">C</span>
          <span>
            {authenticated ? 'Mein Studio' : 'Entdecke Chriklfield'}
            <small>
              {data?.mode === 'demo'
                ? 'Demo-Workspace'
                : authenticated
                  ? 'Privater Workspace'
                  : 'Ideen für deinen nächsten Post'}
            </small>
          </span>
        </div>
        <div className="nav-label">CREATE SOMETHING</div>
        <nav aria-label="Hauptnavigation">
          {nav.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={path === href ? 'nav-item active' : 'nav-item'}
              aria-current={path === href ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              <Icon size={19} />
              {label}
              {label === 'Library' && data && (
                <span className="nav-count">{data.assets.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {data?.admin && (
            <Link
              className={`nav-item ${path === '/admin' ? 'active' : ''}`}
              href="/admin"
              onClick={() => setOpen(false)}
            >
              <SlidersHorizontal size={18} />
              Admin
            </Link>
          )}
          {authenticated ? (
            <Link href="/billing" className="credit-box">
              <span>
                <Diamond size={16} /> Verfügbare Credits
              </span>
              <strong>
                {data ? (data.balance - data.reserved).toLocaleString('de-CH') : '—'}
                <small>{data?.plan || 'Free'}</small>
              </strong>
              <span className="muted">{data?.reserved || 0} reserviert</span>
            </Link>
          ) : (
            <div className="guest-sidebar-cta">
              <strong>Mach die Idee zu deiner.</strong>
              <p>Dein Charakter. Deine Looks. Dein Content.</p>
              <Link className="button primary" href={accountHref('signup', path)}>
                Account erstellen
              </Link>
            </div>
          )}
          {authenticated && (
            <div className="sidebar-foot">
              <span className="avatar">C</span>
              <div>
                <Link href="/onboarding">
                  Creator<small>Studio personalisieren</small>
                </Link>
              </div>
              {data?.mode === 'live' ? (
                <button
                  className="icon-button"
                  aria-label="Abmelden"
                  onClick={async () => {
                    await api('auth/logout', 'POST');
                    window.location.replace('/explore');
                  }}
                >
                  <LogOut size={17} />
                </button>
              ) : (
                <PanelLeftClose size={17} />
              )}
            </div>
          )}
        </div>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              onClick={() => setOpen(true)}
              aria-label="Navigation öffnen"
            >
              <Menu size={22} />
            </button>
            <span>Creator Studio</span>
            <span className="slash">/</span>
            <strong>{active}</strong>
          </div>
          <div className="topbar-actions">
            {authenticated ? (
              <>
                <label className="character-picker">
                  <UsersRound size={16} />
                  <select
                    aria-label="Aktiver Charakter"
                    value={selected}
                    onChange={(e) => select(e.target.value)}
                  >
                    <option value="">Kein Charakter</option>
                    {data?.characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                <span className="private-label">Privat</span>
                <span className="avatar small">C</span>
              </>
            ) : (
              <div className="guest-auth-actions">
                <Link className="text-button" href={accountHref('login', path)}>
                  Anmelden
                </Link>
                <Link className="button primary compact" href={accountHref('signup', path)}>
                  Registrieren
                </Link>
              </div>
            )}
          </div>
        </header>
        {data?.mode === 'demo' && (
          <div className="demo-banner">
            <span className="demo-dot" />
            <strong>Lokale Demo</strong>
            <span>Testdaten & Beispielfotos. Keine KI-Generierung oder Zahlung.</span>
          </div>
        )}
        <main id="workspace">
          {publicStudioPage(path) ? (
            children
          ) : !sessionReady ? (
            <Loading />
          ) : !authenticated ? (
            <GuestWorkspace path={path} />
          ) : error ? (
            <div className="empty-state error-state">
              <h1>Dein Workspace ist gerade nicht erreichbar.</h1>
              <p>{error}</p>
              <Link className="button" href="/explore">
                Vorlagen entdecken
              </Link>
            </div>
          ) : (
            children
          )}
        </main>
        {notice && (
          <div role="status" className="toast">
            {notice}
            <X size={15} />
          </div>
        )}
      </div>
    </div>
  );
}
