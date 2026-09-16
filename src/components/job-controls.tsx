'use client';
import { requestKey } from './request-key';
import { useState, useRef } from 'react';
import { Sparkles, Diamond, LoaderCircle } from 'lucide-react';
import type { JobInput, Quote } from '@/domain/types';
import { api, useStudio } from './studio-context';
import { Modal } from './ui';
export function CostButton({
  input,
  label = 'Preis berechnen',
  disabled = false,
  beforeAuth,
}: {
  input: Partial<JobInput>;
  label?: string;
  disabled?: boolean;
  beforeAuth?: () => void;
}) {
  const { data, notify, refresh, authenticated, requireAccount, sessionReady } = useStudio();
  const [quote, setQuote] = useState<Quote | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false),
    key = useRef('');
  async function getQuote() {
    if (!authenticated) {
      beforeAuth?.();
      requireAccount();
      return;
    }
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const q = await api<Quote>('quotes', 'POST', input);
      key.current = requestKey();
      setQuote(q);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function start() {
    if (!quote || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await api('jobs', 'POST', { quoteId: quote.id, idempotencyKey: key.current });
      setQuote(null);
      notify(
        data?.mode === 'demo'
          ? 'Demo-Auftrag gestartet. Das Ergebnis ist ein gekennzeichnetes Testmedium.'
          : 'Auftrag gestartet. Du kannst im Studio weiterarbeiten.',
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="button primary generate-button"
        disabled={!sessionReady || (authenticated && disabled) || busy}
        onClick={getQuote}
      >
        {busy ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}{' '}
        {authenticated ? label : 'Generieren'}
      </button>
      {error && !quote && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {quote && (
        <Modal
          title={data?.mode === 'demo' ? 'Demo-Auftrag starten' : 'Auftrag bestätigen'}
          onClose={() => !busy && setQuote(null)}
        >
          <div className="quote-total">
            <Diamond size={25} />
            <strong>{quote.credits}</strong>
            <span>Credits</span>
          </div>
          <p>
            Diese Credits werden reserviert und nach erfolgreicher Sicherung des Ergebnisses
            einmalig abgerechnet. Bei einem endgültigen technischen Fehler werden sie freigegeben.
          </p>
          <div className="quote-detail">
            <span>Danach verfügbar</span>
            <strong>{(data?.balance || 0) - (data?.reserved || 0) - quote.credits} Credits</strong>
          </div>
          <p className="muted">
            Angebot gültig bis{' '}
            {new Date(quote.expires_at).toLocaleTimeString('de-CH', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            .{data?.mode === 'demo' ? ' Simulierter Preis; keine tatsächlichen Kosten.' : ''}
          </p>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="button" disabled={busy} onClick={() => setQuote(null)}>
              Abbrechen
            </button>
            <button
              className="button primary"
              disabled={busy || quote.credits > (data?.balance || 0) - (data?.reserved || 0)}
              onClick={start}
            >
              {busy ? 'Wird gestartet …' : `${quote.credits} Credits reservieren & starten`}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
