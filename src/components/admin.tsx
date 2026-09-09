'use client';
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Pause, Play, SlidersHorizontal } from 'lucide-react';
import type { ModelPrice, Job, ProviderAttempt, Template } from '@/domain/types';
import { api, useStudio } from './studio-context';
import { Loading, PageTitle, Status, Modal } from './ui';
interface AdminState {
  jobs: Job[];
  attempts: ProviderAttempt[];
  alerts: { id: string; code: string; created_at: string }[];
  prices: ModelPrice[];
  templates: Template[];
  limits: { paused: boolean };
}
export function Admin() {
  const { data, notify } = useStudio();
  const [state, setState] = useState<AdminState | null>(null),
    [tab, setTab] = useState('Aufträge'),
    [price, setPrice] = useState<ModelPrice | null>(null),
    [template, setTemplate] = useState<Template | null>(null),
    [cost, setCost] = useState<ProviderAttempt | null>(null),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setState(await api<AdminState>('admin'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial fetch synchronizes with an external API.
    void load();
  }, [load]);
  async function action(name: string, value?: unknown) {
    try {
      const r = await api<{ message?: string; prices?: unknown }>('admin', 'POST', {
        action: name,
        data: value,
      });
      notify(r.message || 'Gespeichert.');
      await load();
      return r;
    } catch (e) {
      notify((e as Error).message);
    }
  }
  if (!data) return <Loading />;
  if (!data.admin)
    return (
      <div className="empty-state">
        <h1>Kein Zugriff</h1>
      </div>
    );
  if (error) return <p role="alert">{error}</p>;
  if (!state) return <Loading />;
  return (
    <div className="page admin-page">
      <PageTitle
        eyebrow="INTERNER BETRIEB"
        title="Studio Control"
        description="Aufträge, Kosten und Modellfreigaben."
        action={
          <div className="button-row">
            <button className="button" onClick={() => void load()}>
              <RefreshCw size={16} />
              Aktualisieren
            </button>
            <button
              className="button"
              onClick={() => void action('pause', { paused: !state.limits.paused })}
            >
              {state.limits.paused ? <Play size={16} /> : <Pause size={16} />}Neue Starts{' '}
              {state.limits.paused ? 'freigeben' : 'pausieren'}
            </button>
          </div>
        }
      />
      <div className="balance-grid">
        <div className="balance-card">
          <span>Aufträge</span>
          <strong>{state.jobs.length}</strong>
        </div>
        <div className="balance-card">
          <span>Ungeklärte Anbieterkosten</span>
          <strong>{state.attempts.filter((a) => a.cost_status === 'unreconciled').length}</strong>
        </div>
        <div className="balance-card">
          <span>Betriebsmeldungen</span>
          <strong>{state.alerts.length}</strong>
        </div>
      </div>
      <div className="tabs">
        {['Aufträge', 'Kosten', 'Modelle', 'Vorlagen', 'Meldungen'].map((t) => (
          <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Aufträge' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Auftrag</th>
                <th>Modell</th>
                <th>Status</th>
                <th>Credits</th>
                <th>Fehler</th>
              </tr>
            </thead>
            <tbody>
              {state.jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    <code>{j.id.slice(0, 8)}</code>
                  </td>
                  <td>{j.model}</td>
                  <td>
                    <Status value={j.status} />
                  </td>
                  <td>{j.credits}</td>
                  <td>{j.error_code || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!state.jobs.length && <p className="empty-mini">Noch keine Aufträge.</p>}
        </div>
      )}
      {tab === 'Kosten' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Request-ID</th>
                <th>Status</th>
                <th>Kostenansatz</th>
                <th>Bestätigte Kosten</th>
                <th>Abgleich</th>
              </tr>
            </thead>
            <tbody>
              {state.attempts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <code>{a.request_id || 'Unbekannt'}</code>
                  </td>
                  <td>{a.state}</td>
                  <td>${(a.estimated_microusd / 1e6).toFixed(4)}</td>
                  <td>
                    {a.actual_microusd === null
                      ? 'Nicht abgeglichen'
                      : `$${(a.actual_microusd / 1e6).toFixed(4)}`}
                  </td>
                  <td>
                    <button className="button compact" onClick={() => setCost(a)}>
                      Prüfen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="empty-mini">
            Schätzungen sind keine Rechnungsbeträge. Auch fehlgeschlagene Versuche müssen mit fal
            abgeglichen werden.
          </p>
        </div>
      )}
      {tab === 'Modelle' && (
        <>
          <button
            className="button"
            onClick={async () => {
              const r = await action('fetch-prices');
              if (r?.prices) notify(JSON.stringify(r.prices));
            }}
          >
            Aktuelle fal-Preise abrufen
          </button>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Modell</th>
                  <th>Freigabe</th>
                  <th>Preisformel</th>
                  <th>Preisstand</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.prices.map((p) => (
                  <tr key={p.model}>
                    <td>
                      <strong>{p.model}</strong>
                    </td>
                    <td>{p.enabled ? 'Aktiv' : 'Gesperrt'}</td>
                    <td>
                      ${p.unit_microusd / 1e6} / {p.unit}
                    </td>
                    <td>
                      {p.verified_at
                        ? new Date(p.verified_at).toLocaleDateString('de-CH')
                        : 'Ungeprüft'}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`${p.model} konfigurieren`}
                        onClick={() => setPrice(p)}
                      >
                        <SlidersHorizontal size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === 'Vorlagen' && (
        <div className="admin-templates">
          {state.templates.map((t) => (
            <button key={t.id} className="template-editor-card" onClick={() => setTemplate(t)}>
              <img src={t.cover} alt="Szenenreferenz" />
              <strong>{t.title}</strong>
              <span>{t.enabled ? 'Sichtbar' : 'Ausgeblendet'}</span>
            </button>
          ))}
          <button
            className="button"
            onClick={() =>
              setTemplate({
                id: 'neue-vorlage',
                title: 'Neue Vorlage',
                category: 'Lifestyle',
                scene: '',
                outfit: '',
                pose: '',
                prompt: '',
                format: '4:5',
                cover: '/demo/coast.jpg',
                enabled: false,
              })
            }
          >
            Vorlage anlegen
          </button>
        </div>
      )}
      {tab === 'Meldungen' && (
        <div className="alert-list">
          {state.alerts.map((a) => (
            <div key={a.id}>
              <strong>{a.code}</strong>
              <small>{new Date(a.created_at).toLocaleString('de-CH')}</small>
            </div>
          ))}
          {!state.alerts.length && <p className="empty-mini">Keine Betriebsmeldungen.</p>}
        </div>
      )}
      {price && (
        <PriceForm
          price={price}
          onClose={() => setPrice(null)}
          onSave={async (p) => {
            await action('price', p);
            setPrice(null);
          }}
        />
      )}
      {template && (
        <Modal title="Vorlage bearbeiten" onClose={() => setTemplate(null)}>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              await action('template', template);
              setTemplate(null);
            }}
          >
            {(['id', 'title', 'category', 'scene', 'outfit', 'pose', 'prompt'] as const).map(
              (k) => (
                <label key={k}>
                  {k}
                  <input
                    value={template[k]}
                    onChange={(e) => setTemplate({ ...template, [k]: e.target.value })}
                  />
                </label>
              ),
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={template.enabled}
                onChange={(e) => setTemplate({ ...template, enabled: e.target.checked })}
              />
              Veröffentlicht in Explore
            </label>
            <button className="button primary">Speichern</button>
          </form>
        </Modal>
      )}
      {cost && <CostForm attempt={cost} onClose={() => setCost(null)} action={action} />}
    </div>
  );
}
function PriceForm({
  price,
  onClose,
  onSave,
}: {
  price: ModelPrice;
  onClose: () => void;
  onSave: (p: unknown) => void;
}) {
  const [p, setP] = useState(price),
    [reviewed, setReviewed] = useState(false);
  return (
    <Modal title={`${price.model} · Preisprüfung`} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const { version: _, verified_at: __, ...payload } = p;
          void _;
          void __;
          onSave({ ...payload, reviewed });
        }}
      >
        <label>
          Abrechnungseinheit
          <select
            value={p.unit}
            onChange={(e) => setP({ ...p, unit: e.target.value as ModelPrice['unit'] })}
          >
            {['image', 'megapixel', 'step', 'second', 'job'].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        {(
          [
            'unit_microusd',
            'audio_multiplier',
            'resolution_multiplier',
            'max_parallel',
            'budget_microusd',
          ] as const
        ).map((k) => (
          <label key={k}>
            {
              {
                unit_microusd: 'Preis in Mikro-USD pro Einheit',
                audio_multiplier: 'Audio-Faktor',
                resolution_multiplier: 'Training 1024: Preisfaktor',
                max_parallel: 'Parallele Aufträge',
                budget_microusd: 'Modellbudget in Mikro-USD',
              }[k]
            }
            <input
              type="number"
              step="any"
              min={1}
              value={p[k]}
              onChange={(e) => setP({ ...p, [k]: Number(e.target.value) })}
            />
          </label>
        ))}
        <label className="check-label">
          <input
            type="checkbox"
            checked={p.enabled}
            onChange={(e) => setP({ ...p, enabled: e.target.checked })}
          />
          Modell aktivieren
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            required
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          Preis, Einheit, Rundung und Faktoren anhand der offiziellen Anbieterangaben geprüft.
        </label>
        <p className="muted">
          1 USD = 1 000 000 Mikro-USD. Die Freigabe ist sieben Tage gültig. Änderungen gelten für
          neue Angebote.
        </p>
        <button className="button primary">Geprüften Preis speichern</button>
      </form>
    </Modal>
  );
}
function CostForm({
  attempt,
  onClose,
  action,
}: {
  attempt: ProviderAttempt;
  onClose: () => void;
  action: (name: string, data: unknown) => Promise<unknown>;
}) {
  const [cost, setCost] = useState(''),
    [request, setRequest] = useState(''),
    [evidence, setEvidence] = useState('');
  return (
    <Modal title="Anbieterversuch abgleichen" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          await action('cost', {
            attemptId: attempt.id,
            actualMicrousd: Math.round(Number(cost) * 1e6),
          });
          onClose();
        }}
      >
        <label>
          Bestätigter Rechnungsbetrag in USD
          <input
            type="number"
            required
            min={0}
            step="0.000001"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </label>
        <button className="button primary">Kosten bestätigen</button>
      </form>
      {!attempt.request_id && (
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            await action('attach-request', {
              attemptId: attempt.id,
              requestId: request,
              reconciledWithProvider: true,
            });
            onClose();
          }}
        >
          <label>
            Bei fal eindeutig zugeordnete Request-ID
            <input required value={request} onChange={(e) => setRequest(e.target.value)} />
          </label>
          <label className="check-label">
            <input required type="checkbox" />
            Ich habe diesen Versuch beim Anbieter eindeutig zugeordnet.
          </label>
          <button className="button">Request verknüpfen und abgleichen</button>
        </form>
      )}
      {!attempt.request_id && (
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            await action('resolve-unaccepted', {
              attemptId: attempt.id,
              evidence,
              providerConfirmedNoAcceptanceAndNoCharge: true,
            });
            onClose();
          }}
        >
          <label>
            Bestätigung des Anbieters (Ticket-/Belegnummer)
            <input
              required
              minLength={10}
              maxLength={300}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </label>
          <label className="check-label">
            <input required type="checkbox" />
            fal hat bestätigt, dass dieser Versuch weder angenommen noch berechnet wurde. Ein
            Timeout oder 404 genügt nicht.
          </label>
          <button className="button danger">Reservierung mit Beleg freigeben</button>
        </form>
      )}
    </Modal>
  );
}
