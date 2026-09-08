'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Snapshot } from '@/domain/types';
const messages: Record<string, string> = {
  CONFIG_MISSING:
    'Der Live-Modus benötigt die Zugangsdaten aus .env.example. Für die lokale Vorschau: npm run demo.',
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
export async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message || messages[data.error] || data.error || 'Anfrage fehlgeschlagen');
  return data;
}
interface StudioContext {
  data: Snapshot | null;
  selected: string;
  select: (id: string) => void;
  refresh: () => Promise<void>;
  notice: string;
  notify: (message: string) => void;
  error: string;
}
const Context = createContext<StudioContext | null>(null);
export function StudioProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Snapshot | null>(null),
    [selected, setSelected] = useState(''),
    [notice, notify] = useState(''),
    [error, setError] = useState('');
  const pathname = usePathname(),
    router = useRouter();
  const refresh = useCallback(async () => {
    try {
      const s = await api<Snapshot>('state');
      setData(s);
      setError('');
      setSelected((prev) =>
        s.characters.some((c) => c.id === prev)
          ? prev
          : s.characters.find((c) => c.id === localStorage.getItem(`character:${s.userId}`))?.id ||
            s.characters[0]?.id ||
            '',
      );
    } catch (e) {
      const message = (e as Error).message;
      if (message === 'UNAUTHENTICATED') {
        router.replace('/login');
        return;
      }
      setError(message);
    }
  }, [router]);
  useEffect(() => {
    if (pathname !== '/login') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize the session with the external API.
      void refresh();
      const timer = setInterval(() => void refresh(), 5000);
      return () => clearInterval(timer);
    }
  }, [refresh, pathname]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => notify(''), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  function select(id: string) {
    setSelected(id);
    if (data) localStorage.setItem(`character:${data.userId}`, id);
  }
  return (
    <Context.Provider value={{ data, selected, select, refresh, notice, notify, error }}>
      {children}
    </Context.Provider>
  );
}
export function useStudio() {
  const value = useContext(Context);
  if (!value) throw new Error('Studio context missing');
  return value;
}
