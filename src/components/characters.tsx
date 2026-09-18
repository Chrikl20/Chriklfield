'use client';
import { useState } from 'react';
import {
  Plus,
  Upload,
  Check,
  ArrowUpRight,
  Trash2,
  UserRound,
  ScanFace,
  Layers3,
} from 'lucide-react';
import Link from 'next/link';
import type { Asset, Character, Reference, ReferenceKind, CropMode } from '@/domain/types';
import { api, useStudio } from './studio-context';
import { PageTitle, Loading, Modal, Status } from './ui';
import { CostButton } from './job-controls';
import { uploadMedia } from './upload-media';
import { UploadStatusList } from './upload-status';
export function Characters() {
  const { data, selected, select, refresh, notify } = useStudio();
  const [editing, setEditing] = useState<Character | 'new' | null>(null),
    [reference, setReference] = useState<Asset | null>(null),
    [uploading, setUploading] = useState(false),
    [uploadPhase, setUploadPhase] = useState('Wird übertragen …'),
    [remove, setRemove] = useState(false);
  if (!data) return <Loading />;
  const character = data.characters.find((c) => c.id === selected),
    refs = data.references.filter((r) => r.character_id === selected),
    versions = data.versions.filter((v) => v.character_id === selected);
  const assets = data.assets.filter((a) => a.character_id === selected && a.kind === 'image');
  async function upload(files: FileList | null) {
    if (!files || !selected) return;
    setUploading(true);
    try {
      for (const f of files) {
        await uploadMedia(f, data!.mode, selected, setUploadPhase);
      }
      await refresh();
      notify('Referenzen hochgeladen. Bitte Bildbeschreibung und Zuschnitt bestätigen.');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="page">
      <PageTitle
        eyebrow="DEINE AI INFLUENCER"
        title="Deine Characters"
        description="Entwickle deine Influencer. Bewahre ihre Identität über neue Looks, Posts und Clips hinweg."
        action={
          <button className="button primary" onClick={() => setEditing('new')}>
            <Plus size={17} />
            Neuer Charakter
          </button>
        }
      />
      <UploadStatusList />
      <div className="character-layout">
        <aside className="character-list">
          {data.characters.map((c) => (
            <button
              key={c.id}
              className={`character-list-item ${selected === c.id ? 'selected' : ''}`}
              onClick={() => select(c.id)}
            >
              <span className="character-initial">{c.name.slice(0, 1)}</span>
              <span>
                <strong>{c.name}</strong>
                <small>
                  {data.versions.filter((v) => v.character_id === c.id).length} Versionen
                </small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
          {!data.characters.length && (
            <div className="empty-mini">Noch keine Charaktere. Erstelle deine erste Identität.</div>
          )}
          <p className="muted">
            Gesichts- und Körperkonsistenz bleiben Qualitätsziele, die du mit Testbildern prüfst.
          </p>
        </aside>
        <div className="character-workspace">
          {character ? (
            <>
              <section className="identity-card">
                <div className="character-initial large">{character.name.slice(0, 1)}</div>
                <div>
                  <span className="eyebrow">CHARAKTERPROFIL</span>
                  <h2>{character.name}</h2>
                  <p>{character.identity || 'Identität noch nicht beschrieben.'}</p>
                  <p className="muted">
                    {character.body || 'Körpermerkmale noch nicht beschrieben.'}
                  </p>
                  <span
                    className={`status ${character.confirmed ? 'status-ready' : 'status-draft'}`}
                  >
                    {character.confirmed ? 'Merkmale bestätigt' : 'Bestätigung offen'}
                  </span>
                </div>
                <div className="identity-actions">
                  <button className="button" onClick={() => setEditing(character)}>
                    Bearbeiten
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label="Charakter löschen"
                    onClick={() => setRemove(true)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </section>
              <div className="section-heading">
                <div>
                  <h2>
                    Referenzbasis{' '}
                    <span className="count">{refs.filter((r) => r.approved).length}</span>
                  </h2>
                  <p>Gesicht, Profil, Ganzkörper und Ausdruck abdecken.</p>
                </div>
                <label className="button upload-button">
                  <Upload size={16} />
                  {uploading ? uploadPhase : 'Bilder hochladen'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={uploading}
                    onChange={(e) => void upload(e.target.files)}
                  />
                </label>
              </div>
              <div className="reference-grid">
                {assets.map((asset) => {
                  const ref = refs.find((r) => r.asset_id === asset.id);
                  return (
                    <button
                      key={asset.id}
                      className="reference-card"
                      onClick={() => setReference(asset)}
                    >
                      <img src={asset.url} alt="Charakterreferenz zur Prüfung" />
                      <span className={ref?.approved ? 'ref-check checked' : 'ref-check'}>
                        {ref?.approved ? <Check size={14} /> : <ScanFace size={14} />}
                      </span>
                      <div>
                        <strong>
                          {ref?.kind
                            ? {
                                face: 'Gesicht',
                                profile: 'Profil',
                                body: 'Ganzkörper',
                                expression: 'Ausdruck',
                              }[ref.kind]
                            : 'Bitte prüfen'}
                        </strong>
                        <small>
                          {ref?.crop_confirmed ? 'Zuschnitt bestätigt' : 'Zuschnitt offen'}
                        </small>
                      </div>
                    </button>
                  );
                })}
                <label className="reference-add">
                  <Plus size={24} />
                  <span>Referenz hinzufügen</span>
                  <small>JPEG, PNG, WebP · max. 10 MB</small>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(e) => void upload(e.target.files)}
                  />
                </label>
              </div>
              <div className="reference-hint">
                <ScanFace size={20} />
                <p>
                  <strong>Jede Referenz braucht deine Freigabe.</strong> Prüfe Ausdruck,
                  Proportionen und eindeutige Personenzuordnung. Weitere KI-Ansichten findest du
                  im Image Studio unter „Referenz bearbeiten“.
                </p>
                <Link href="/image?mode=edit" className="button compact">
                  Ansichten erstellen <ArrowUpRight size={16} />
                </Link>
              </div>
              <div className="training-panel">
                <div>
                  <span className="eyebrow">HIGGSFIELD · SOUL ID</span>
                  <h2>Eine neue Soul-ID-Version trainieren</h2>
                  <p>
                    20–80 freigegebene Fotos mit derselben Person, unterschiedlichen Winkeln,
                    Ausdrücken und Ganzkörperansichten. Chriklfield übergibt die Referenzen direkt
                    an Higgsfield Soul ID.
                  </p>
                </div>
                <div className="training-options">
                  <div className="control-note">
                    <ScanFace size={17} />
                    <p>
                      {refs.filter((r) => r.approved && r.crop_confirmed).length} / 20
                      Mindest-Referenzen freigegeben.
                    </p>
                  </div>
                  <CostButton
                    label="Soul ID trainieren"
                    input={{ model: 'train', characterId: selected }}
                    disabled={
                      !character.confirmed ||
                      uploading ||
                      refs.filter((r) => r.approved && r.crop_confirmed).length < 20
                    }
                  />
                </div>
              </div>
              <div className="section-heading">
                <h2>Versionen</h2>
                <Layers3 size={20} />
              </div>
              <div className="version-list">
                {versions.map((v) => (
                  <div key={v.id}>
                    <div>
                      <strong>Version {v.version}</strong>
                      <small>
                        {v.base_model} · {v.test_asset_ids.length} ausgewählte Testbilder
                      </small>
                    </div>
                    <Status value={v.status} />
                    <Link className="button compact" href={`/image?version=${v.id}`}>
                      Im Studio öffnen <ArrowUpRight size={15} />
                    </Link>
                  </div>
                ))}
                {!versions.length && (
                  <p className="muted">Dein erstes Training legt Version 1 an.</p>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <UserRound size={40} />
              <h2>Gib deiner Idee eine Identität.</h2>
              <p>Lege einen Charakter an und sammle seine Referenzen.</p>
              <button className="button primary" onClick={() => setEditing('new')}>
                Charakter erstellen
              </button>
            </div>
          )}
        </div>
      </div>
      {editing && (
        <CharacterForm
          character={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={async (c) => {
            await refresh();
            select(c.id);
            setEditing(null);
          }}
        />
      )}
      {reference && (
        <ReferenceForm
          asset={reference}
          characterId={selected}
          reference={refs.find((r) => r.asset_id === reference.id)}
          onClose={() => setReference(null)}
          onSaved={async () => {
            setReference(null);
            await refresh();
          }}
        />
      )}
      {remove && character && (
        <Modal title={`${character.name} löschen?`} onClose={() => setRemove(false)}>
          <p>
            Referenzen, Soul-ID-Verknüpfung und zugehörige Ergebnisse werden zur Löschung vorgemerkt.
            Laufende Aufträge müssen zuerst abgeschlossen sein.
          </p>
          <div className="modal-actions">
            <button className="button" onClick={() => setRemove(false)}>
              Abbrechen
            </button>
            <button
              className="button danger"
              onClick={async () => {
                try {
                  await api(`characters/${character.id}`, 'DELETE');
                  setRemove(false);
                  await refresh();
                  notify('Charakter zur Löschung vorgemerkt.');
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Charakter löschen
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function CharacterForm({
  character,
  onClose,
  onSave,
}: {
  character?: Character;
  onClose: () => void;
  onSave: (c: Character) => void;
}) {
  const [name, setName] = useState(character?.name || ''),
    [identity, setIdentity] = useState(character?.identity || ''),
    [body, setBody] = useState(character?.body || ''),
    [confirmed, setConfirmed] = useState(character?.confirmed || false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title={character ? 'Identität bearbeiten' : 'Neuer Charakter'} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const c = await api<Character>(
              `characters${character ? `/${character.id}` : ''}`,
              character ? 'PATCH' : 'POST',
              { name, identity, body, confirmed },
            );
            onSave(c);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Name
          <input
            autoFocus
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Zum Beispiel Nova"
          />
        </label>
        <label>
          Identitätsmerkmale
          <textarea
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            maxLength={1500}
            placeholder="Gesicht, Haare, eindeutige wiederkehrende Merkmale …"
          />
        </label>
        <label>
          Körpermerkmale
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            placeholder="Bestätigte Proportionen und Körpermerkmale …"
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Ich bestätige diese Merkmale und habe die Rechte an den verwendeten Referenzen.
        </label>
        <p className="muted">
          Kleidung, Pose und Umgebung legst du später pro Szene fest. Bestehende Trainingsversionen
          behalten ihren eigenen Identitätsstand.
        </p>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Abbrechen
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Speichert …' : 'Identität speichern'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ReferenceForm({
  asset,
  characterId,
  reference,
  onClose,
  onSaved,
}: {
  asset: Asset;
  characterId: string;
  reference?: Reference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<ReferenceKind>(reference?.kind || 'face'),
    [caption, setCaption] = useState(reference?.caption || ''),
    [crop, setCrop] = useState<CropMode>(reference?.crop_mode || 'contain'),
    [approved, setApproved] = useState(reference?.approved || false),
    [cropConfirmed, setCropConfirmed] = useState(reference?.crop_confirmed || false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Referenz prüfen" onClose={onClose}>
      <div className="reference-review">
        <div>
          <div className="crop-preview">
            <img src={asset.url} style={{ objectFit: crop }} alt="Quadratische Trainingsvorschau" />
          </div>
          <p className="muted">So wird das Bild für das Training vorbereitet.</p>
        </div>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api('references', 'POST', {
                characterId,
                assetId: asset.id,
                kind,
                caption,
                cropMode: crop,
                approved,
                cropConfirmed,
              });
              onSaved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Ansicht
            <select value={kind} onChange={(e) => setKind(e.target.value as ReferenceKind)}>
              <option value="face">Gesicht</option>
              <option value="profile">Profil</option>
              <option value="body">Ganzkörper</option>
              <option value="expression">Ausdruck</option>
            </select>
          </label>
          <label>
            Bildbeschreibung
            <textarea
              required
              value={caption}
              maxLength={1500}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Charakter, Ausdruck, sichtbare Kleidung, Pose und Umgebung beschreiben."
            />
          </label>
          <label>
            Quadratische Vorbereitung
            <select
              value={crop}
              onChange={(e) => {
                setCrop(e.target.value as CropMode);
                setCropConfirmed(false);
              }}
            >
              <option value="contain">Ganzes Bild mit Rand erhalten</option>
              <option value="cover">Mittig quadratisch zuschneiden</option>
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={cropConfirmed}
              onChange={(e) => setCropConfirmed(e.target.checked)}
            />
            Gesicht und wichtige Körperdetails bleiben sichtbar.
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />
            Als passende Referenz freigeben.
          </label>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            Referenz speichern
          </button>
        </form>
      </div>
    </Modal>
  );
}
