'use client';
import { requestKey } from './request-key';
import { useEffect, useState } from 'react';
import { Diamond, ArrowUpRight, ShieldCheck, Check } from 'lucide-react';
import { api, useStudio } from './studio-context';
import { Loading, PageTitle } from './ui';
type Price = { key: string; amount: number; currency: string; credits: number; interval?: string };
export function Billing() {
  const { data, notify } = useStudio();
  const [prices, setPrices] = useState<Price[]>([]),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ prices: Price[] }>('billing/prices')
      .then((r) => setPrices(r.prices))
      .catch(() => {});
  }, []);
  if (!data) return <Loading />;
  async function pay(product?: 'credits' | 'creator') {
    setBusy(true);
    try {
      const r = await api<{ url?: string; message?: string }>(
        product ? 'billing/checkout' : 'billing/portal',
        'POST',
        product ? { product, idempotencyKey: requestKey() } : undefined,
      );
      if (r.url) {
        const u = new URL(r.url);
        if (
          u.protocol !== 'https:' ||
          !['checkout.stripe.com', 'billing.stripe.com'].includes(u.hostname)
        )
          throw new Error('Ungültiger Zahlungslink');
        location.assign(r.url);
      } else notify(r.message || 'Demo: Keine Zahlung.');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function price(key: string) {
    const p = prices.find((p) => p.key === key);
    return p
      ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: p.currency }).format(
          p.amount / 100,
        )
      : data?.mode === 'demo'
        ? 'Demo'
        : 'Preis einrichten';
  }
  return (
    <div className="page billing-page">
      <PageTitle
        eyebrow="ALLES IM BLICK"
        title="Dein Plan. Deine Credits."
        description="Jeder Auftrag hat einen klaren Preis vor dem Start."
        action={
          <button className="button" disabled={busy} onClick={() => void pay()}>
            Abonnement verwalten <ArrowUpRight size={17} />
          </button>
        }
      />
      <div className="balance-grid">
        <div className="balance-card accent">
          <span>
            <Diamond size={17} />
            Verfügbar
          </span>
          <strong>
            {(data.balance - data.reserved).toLocaleString('de-CH')}
            <small>Credits</small>
          </strong>
          <p>Bereit für dein nächstes Projekt.</p>
        </div>
        <div className="balance-card">
          <span>Für laufende Aufträge reserviert</span>
          <strong>
            {data.reserved.toLocaleString('de-CH')}
            <small>Credits</small>
          </strong>
          <p>Abrechnung nach erfolgreicher Sicherung.</p>
        </div>
        <div className="balance-card">
          <span>Aktueller Tarif</span>
          <strong>{data.plan}</strong>
          <p>
            {data.mode === 'demo'
              ? 'Lokale Testumgebung ohne Zahlungen.'
              : 'Credits werden nach bestätigtem Zahlungseingang gebucht.'}
          </p>
        </div>
      </div>
      <div className="pricing-grid">
        <section className="plan-card">
          <span className="eyebrow">FÜR DEINEN WORKFLOW</span>
          <h2>Creator</h2>
          <div className="plan-price">
            {price('creator')}
            <small>{prices.some((p) => p.key === 'creator') ? '/ Monat' : ''}</small>
          </div>
          <ul>
            <li>
              <Check size={17} />3 000 Credits pro bezahltem Monat
            </li>
            <li>
              <Check size={17} />
              Eigene Charaktere und Versionen
            </li>
            <li>
              <Check size={17} />
              Bilder, Videos und private Library
            </li>
          </ul>
          <button className="button primary" disabled={busy} onClick={() => void pay('creator')}>
            Creator wählen
          </button>
        </section>
        <section className="plan-card">
          <span className="eyebrow">FÜR DEINE NÄCHSTE IDEE</span>
          <h2>1 000 Credits</h2>
          <div className="plan-price">
            {price('credits')}
            <small>{prices.some((p) => p.key === 'credits') ? 'einmalig' : ''}</small>
          </div>
          <p>
            Zusätzliche Credits für Training, Bilder und Videos. Der Verbrauch hängt vom gewählten
            Modell und Auftrag ab.
          </p>
          <button className="button" disabled={busy} onClick={() => void pay('credits')}>
            Credits nachkaufen
          </button>
        </section>
      </div>
      <div className="billing-note">
        <ShieldCheck size={21} />
        <p>
          Credits werden ausschliesslich über bestätigte Zahlungen gutgeschrieben. Rückerstattungen
          korrigieren das Guthaben. Reservierte Credits bleiben für laufende Aufträge gebunden.
        </p>
      </div>
      <div className="section-heading">
        <h2>Letzte Bewegungen</h2>
        <span className="muted">{data.ledger.length} Einträge</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Vorgang</th>
              <th>Zeitpunkt</th>
              <th className="align-right">Credits</th>
            </tr>
          </thead>
          <tbody>
            {data.ledger.map((l) => (
              <tr key={l.id}>
                <td>
                  {{
                    reserve: 'Reservierung',
                    capture: 'Verbrauch',
                    release: 'Freigabe',
                    payment: 'Kauf',
                    refund: 'Rückerstattung',
                  }[l.kind] || l.kind}
                </td>
                <td>{new Date(l.created_at).toLocaleString('de-CH')}</td>
                <td className="align-right">
                  {l.amount > 0 ? '+' : ''}
                  {l.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.ledger.length && (
          <p className="empty-mini">Hier erscheinen dein Verbrauch und bestätigte Zahlungen.</p>
        )}
      </div>
    </div>
  );
}
