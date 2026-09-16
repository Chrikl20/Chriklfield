'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  accountHref,
  standalonePage,
  type AccountSession,
  type CreatorPreferences,
} from '@/domain/account';
import { Modal } from './ui';
import type { Snapshot } from '@/domain/types';

const messages: Record<string, string> = {
  UNAUTHENTICATED: 'Bitte melde dich an, um fortzufahren.',
  CONFIG_MISSING:
    'Dein Studio ist noch nicht vollständig eingerichtet. Bitte kontaktiere das Chriklfield-Team.',
  RATE_LIMIT: 'Zu viele Anfragen. Bitte in einer Minute erneut versuchen.',
  STORAGE_LIMIT: 'Dein privater Speicher ist voll. Lösche nicht mehr benötigte Dateien.',
  UPLOAD_CONCURRENCY_LIMIT: 'Es werden bereits drei Dateien verarbeitet. Bitte kurz warten.',
  ACTIVE_UPLOADS_BLOCK_DELETION:
    'Bitte warte mit dem Löschen, bis die Dateiübertragung und Prüfung abgeschlossen sind.',
  PROMPT_TOO_LONG: 'Identität und Szenenbeschreibung sind zusammen zu lang. Bitte kürzen.',
  REFERENCES_CHANGED: 'Die Referenzen haben sich geändert. Bitte das Training neu vorbereiten.',
  HTTPS_WEBHOOK_REQUIRED: 'Die Modellanbindung ist noch nicht vollständig eingerichtet.',
  KLING_IMAGE_LIMITS:
    'Dieses Startbild hat für Kling ungeeignete Abmessungen oder eine zu grosse Datei.',
  INSUFFICIENT_CREDITS: 'Deine verfügbaren Credits reichen dafür nicht aus.',
  PAID_GENERATION_DISABLED: 'Live-Generierungen sind noch nicht freigeschaltet.',
  PRICE_REVIEW_REQUIRED: 'Der Modellpreis muss vor dem Start geprüft werden.',
  MODEL_DISABLED: 'Dieses Modell ist noch nicht aktiviert.',
  CONCURRENCY_LIMIT: 'Es laufen bereits zu viele Aufträge. Bitte warte kurz.',
  SPEND_LIMIT: 'Das festgelegte Kostenlimit ist erreicht.',
  TRAINING_REQUIRED: 'Trainiere zuerst eine Charakterversion.',
  IDENTITY_NOT_CONFIRMED: 'Bestätige zuerst die Identität und Körpermerkmale.',
  NEED_EIGHT_APPROVED_REFERENCES:
    'Für das Training werden 8–80 bestätigte Referenzen mit geprüftem Zuschnitt benötigt.',
  REFERENCE_VIEWS_MISSING: 'Gesicht, Profil, Ganzkörper und Ausdruck müssen abgedeckt sein.',
  APPROVED_REFERENCES_REQUIRED: 'Bestätige zuerst mindestens eine Referenz für weitere Ansichten.',
  ACTIVE_JOBS_BLOCK_DELETION: 'Bitte warte mit dem Löschen, bis deine Aufträge abgeschlossen sind.',
  MOTION_DURATION_LIMIT: 'Die Referenz darf bei Bildausrichtung höchstens 10 Sekunden lang sein.',
  QUOTE_EXPIRED: 'Das Preisangebot ist abgelaufen. Bitte erneut berechnen.',
  CHECKOUT_DISABLED: 'Checkout ist noch nicht freigeschaltet.',
  FORBIDDEN: 'Du hast keinen Zugriff auf diese Daten.',
  VIDEO_LIMITS: 'Video: 3–30 Sekunden, 340–3850 Pixel je Seite, maximal 100 MB.',
  IMAGE_LIMITS: 'Bild: mindestens 300 Pixel je Seite, JPEG, PNG oder WebP.',
  FILE_TOO_LARGE: 'Diese Datei überschreitet das Grössenlimit.',
  BODY_TOO_LARGE: 'Diese Datei überschreitet das Grössenlimit.',
  UNSUPPORTED_MEDIA: 'Bitte JPEG, PNG, WebP oder MP4 verwenden.',
  INTERNAL_ERROR: 'Die Anfrage konnte nicht abgeschlossen werden. Bitte erneut versuchen.',
};
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.error,
      data.message || messages[data.error] || data.error || 'Anfrage fehlgeschlagen',
    );
  return data;
}
interface StudioContext {
  data: Snapshot | null;
  authenticated: boolean;
  sessionReady: boolean;
  preferences: CreatorPreferences | null;
  requireAccount: () => boolean;
  selected: string;
  select: (id: string) => void;
  refresh: () => Promise<void>;
  notice: string;
  notify: (message: string) => void;
  error: string;
}
const Context = createContext<StudioContext | null>(null);
export function StudioProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [session, setSession] = useState<AccountSession>({ authenticated: false });
  const [sessionReady, setSessionReady] = useState(false);
  const [selected, setSelected] = useState('');
  const [notice, notify] = useState('');
  const [error, setError] = useState('');
  const [gateNext, setGateNext] = useState<string | null>(null);
  const pathname = usePathname();
  const refresh = useCallback(async () => {
    try {
      const account = await api<AccountSession>('auth/session');
      setSession(account);
      setError('');
      if (!account.authenticated) {
        setData(null);
        setSelected('');
        return;
      }
      if (standalonePage(pathname)) return;
      const s = await api<Snapshot>('state');
      setData(s);
      setSelected((prev) => {
        let saved = '';
        try {
          saved = localStorage.getItem(`character:${s.userId}`) || '';
        } catch {
          /* Storage is optional. */
        }
        return s.characters.some((c) => c.id === prev)
          ? prev
          : s.characters.find((c) => c.id === saved)?.id || s.characters[0]?.id || '';
      });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') {
        setSession({ authenticated: false });
        setData(null);
        setSelected('');
      } else setError((e as Error).message);
    } finally {
      setSessionReady(true);
    }
  }, [pathname]);
  useEffect(() => {
    if (pathname === '/auth/callback') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize with the authenticated server session.
    void refresh();
  }, [refresh, pathname]);
  useEffect(() => {
    if (!session.authenticated || standalonePage(pathname)) return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [session.authenticated, pathname, refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => notify(''), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  function select(id: string) {
    setSelected(id);
    try {
      if (data) localStorage.setItem(`character:${data.userId}`, id);
    } catch {
      /* Optional preference. */
    }
  }
  function requireAccount() {
    if (session.authenticated) return true;
    setGateNext(window.location.pathname + window.location.search);
    return false;
  }
  return (
    <Context.Provider
      value={{
        data,
        authenticated: session.authenticated,
        sessionReady,
        preferences: session.preferences || null,
        requireAccount,
        selected,
        select,
        refresh,
        notice,
        notify,
        error,
      }}
    >
      {children}
      {gateNext && (
        <Modal title="Deine Idee ist bereit." onClose={() => setGateNext(null)}>
          <p>
            Erstelle deinen Account, um Bilder und Clips zu generieren und deine eigenen Charaktere
            zu speichern.
          </p>
          <p className="muted gate-note">
            Dein Entwurf bleibt in diesem Tab erhalten. Den Preis siehst du vor jedem Start.
          </p>
          <div className="gate-actions">
            <Link
              className="button primary"
              href={accountHref('signup', gateNext)}
              onClick={() => setGateNext(null)}
            >
              Account erstellen
            </Link>
            <Link
              className="button"
              href={accountHref('login', gateNext)}
              onClick={() => setGateNext(null)}
            >
              Ich habe schon einen Account
            </Link>
            <button className="text-button" onClick={() => setGateNext(null)}>
              Weiter umschauen
            </button>
          </div>
        </Modal>
      )}
    </Context.Provider>
  );
}
export function useStudio() {
  const value = useContext(Context);
  if (!value) throw new Error('Studio context missing');
  return value;
}
