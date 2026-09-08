'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Heart, Download, Trash2, ArrowUpRight, ScanFace, Film, Images, Check } from 'lucide-react';
import type { Asset } from '@/domain/types';
import { api, useStudio } from './studio-context';
import { Loading, PageTitle, Modal } from './ui';
import { ReferenceForm } from './characters';
import { UploadStatusList } from './upload-status';
export function Library() {
  const { data, refresh, selected, notify } = useStudio();
  const [filter, setFilter] = useState('Alle'),
    [remove, setRemove] = useState<Asset | null>(null),
    [ref, setRef] = useState<Asset | null>(null),
    [detail, setDetail] = useState<Asset | null>(null);
  if (!data) return <Loading />;
  const assets = data.assets.filter(
    (a) =>
      filter === 'Alle' ||
      (filter === 'Favoriten'
        ? a.favorite
        : filter === 'Bilder'
          ? a.kind === 'image'
          : a.kind === 'video'),
  );
  async function favorite(a: Asset) {
    try {
      await api(`assets/${a.id}`, 'PATCH', { favorite: !a.favorite });
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <div className="page">
      <PageTitle
        eyebrow="DEIN PRIVATES ARCHIV"
        title="Library"
        description={`${data.assets.length} Ergebnisse. Platz für deine nächsten Ideen.`}
      />
      <UploadStatusList />
      <div className="filter-row">
        <div className="tabs">
          {['Alle', 'Bilder', 'Videos', 'Favoriten'].map((f) => (
            <button key={f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <span className="muted">Nur in deinem Workspace sichtbar</span>
      </div>
      <div className="library-grid">
        {assets.map((a, i) => (
          <article key={a.id} className="library-card">
            <button
              className="library-preview"
              onClick={() => setDetail(a)}
              aria-label={`Ergebnis ${i + 1} öffnen`}
            >
              {a.kind === 'image' ? (
                <img src={a.url} alt={`Gespeichertes Bild ${i + 1}`} loading="lazy" />
              ) : (
                <div className="video-poster">
                  <Film size={34} />
                  <span>{a.duration || 5} s</span>
                </div>
              )}
              {a.demo && <span className="media-label">DEMO-TESTMEDIUM</span>}
            </button>
            <div className="library-card-meta">
              <div>
                <strong>
                  {a.kind === 'image' ? 'Bild' : 'Video'} {String(i + 1).padStart(2, '0')}
                </strong>
                <small>
                  {a.width} × {a.height}
                </small>
              </div>
              <button
                className={`icon-button ${a.favorite ? 'favorited' : ''}`}
                aria-label={a.favorite ? 'Favorit entfernen' : 'Als Favorit speichern'}
                onClick={() => void favorite(a)}
              >
                <Heart size={18} fill={a.favorite ? 'currentColor' : 'none'} />
              </button>
            </div>
            <div className="library-actions">
              <a
                className="icon-button"
                href={`/api/assets/${a.id}?download=1`}
                aria-label="Herunterladen"
              >
                <Download size={17} />
              </a>
              {a.kind === 'image' && (
                <>
                  <Link
                    className="icon-button"
                    href={`/video?source=${a.id}`}
                    aria-label="Als Video verwenden"
                  >
                    <Film size={17} />
                  </Link>
                  <button
                    className="icon-button"
                    disabled={!selected}
                    onClick={() => setRef(a)}
                    aria-label="Als Referenz prüfen"
                  >
                    <ScanFace size={17} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={!selected}
                    aria-label="Als Testbild markieren"
                    onClick={async () => {
                      const v = data.versions.find(
                        (v) => v.character_id === selected && v.status === 'ready',
                      );
                      if (!v) {
                        notify('Zuerst eine fertige Charakterversion auswählen.');
                        return;
                      }
                      try {
                        await api('versions/test-image', 'POST', {
                          versionId: v.id,
                          assetId: a.id,
                        });
                        notify('Testbild zur Version hinzugefügt.');
                        await refresh();
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    <Check size={17} />
                  </button>
                </>
              )}
              <button
                className="icon-button danger"
                onClick={() => setRemove(a)}
                aria-label="Ergebnis löschen"
              >
                <Trash2 size={17} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!assets.length && (
        <div className="empty-state">
          <Images size={38} />
          <h2>
            {filter === 'Favoriten' ? 'Deine Favoriten warten auf dich.' : 'Noch keine Ergebnisse.'}
          </h2>
          <p>Deine gespeicherten Bilder und Videos findest du hier.</p>
          <Link className="button primary" href="/image">
            Image Studio öffnen <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
      {remove && (
        <Modal title="Ergebnis löschen?" onClose={() => setRemove(null)}>
          <p>
            Das Ergebnis wird sofort ausgeblendet und anschliessend aus dem privaten Speicher
            entfernt. Zugehörige Referenzen werden entfernt.
          </p>
          <div className="modal-actions">
            <button className="button" onClick={() => setRemove(null)}>
              Abbrechen
            </button>
            <button
              className="button danger"
              onClick={async () => {
                try {
                  await api(`assets/${remove.id}`, 'DELETE');
                  setRemove(null);
                  await refresh();
                  notify('Ergebnis zur Löschung vorgemerkt.');
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Löschen
            </button>
          </div>
        </Modal>
      )}
      {ref && (
        <ReferenceForm
          asset={ref}
          characterId={selected}
          reference={data.references.find(
            (r) => r.asset_id === ref.id && r.character_id === selected,
          )}
          onClose={() => setRef(null)}
          onSaved={async () => {
            setRef(null);
            await refresh();
          }}
        />
      )}
      {detail && (
        <Modal title="Privates Ergebnis" onClose={() => setDetail(null)}>
          <div className="detail-media">
            {detail.kind === 'video' ? (
              <video controls playsInline autoPlay src={detail.url} />
            ) : (
              <img src={detail.url} alt="Ergebnis in grosser Vorschau" />
            )}
          </div>
          <a className="button primary" href={`/api/assets/${detail.id}?download=1`}>
            <Download size={17} />
            Herunterladen
          </a>
        </Modal>
      )}
    </div>
  );
}
