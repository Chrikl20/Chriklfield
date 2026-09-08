'use client';
import { uploadMedia } from './upload-media';
import { UploadStatusList } from './upload-status';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  SlidersHorizontal,
  Upload,
  Film,
  ImagePlus,
  ArrowUpRight,
  Download,
  Heart,
  Check,
  ScanFace,
} from 'lucide-react';
import type { Asset, JobInput, ModelKey } from '@/domain/types';
import { api, useStudio } from './studio-context';
import { CostButton } from './job-controls';
import { PageTitle, Loading, Status } from './ui';
import { ReferenceForm } from './characters';
export function GenerationStudio({ video = false }: { video?: boolean }) {
  const { data } = useStudio();
  if (!data) return <Loading />;
  return <StudioForm key={video ? 'video' : 'image'} video={video} />;
}
function StudioForm({ video }: { video: boolean }) {
  const { data, selected, select, refresh, notify } = useStudio();
  const query = useSearchParams();
  const template = data!.templates.find((t) => t.id === query.get('template'));
  const [model, setModel] = useState<ModelKey>(
      video ? 'video' : query.get('mode') === 'edit' ? 'edit' : 'image',
    ),
    [scene, setScene] = useState(template?.scene || ''),
    [outfit, setOutfit] = useState(template?.outfit || ''),
    [pose, setPose] = useState(template?.pose || ''),
    [prompt, setPrompt] = useState(
      template?.prompt ||
        (video
          ? 'A gentle camera move, natural breathing, subtle motion, consistent appearance.'
          : ''),
    ),
    [format, setFormat] = useState<JobInput['format']>(template?.format || '4:5'),
    [count, setCount] = useState(1),
    [duration, setDuration] = useState(5),
    [audio, setAudio] = useState(false),
    [orientation, setOrientation] = useState<'image' | 'video'>('image'),
    [source, setSource] = useState(query.get('source') || ''),
    [motion, setMotion] = useState(''),
    [version, setVersion] = useState(query.get('version') || ''),
    [scale, setScale] = useState(1),
    [seed, setSeed] = useState(''),
    [settings, setSettings] = useState(false),
    [focused, setFocused] = useState<Asset | null>(null),
    [reference, setReference] = useState<Asset | null>(null),
    [uploading, setUploading] = useState(false),
    [uploadPhase, setUploadPhase] = useState('Wird übertragen …');
  const character = data!.characters.find((c) => c.id === selected),
    versions = data!.versions.filter((v) => v.character_id === selected && v.status === 'ready');
  const assets = data!.assets.filter((a) => a.kind === (video ? 'video' : 'image'));
  const sourceAsset = data!.assets.find((a) => a.id === source);
  const activeJobs = data!.jobs.filter(
    (j) =>
      ['queued', 'submitting', 'unknown', 'running', 'persisting'].includes(j.status) &&
      (video
        ? ['video', 'motion'].includes(j.model)
        : !['video', 'motion', 'train'].includes(j.model)),
  );
  const preview = focused || assets[0];
  const input: Partial<JobInput> = {
    model,
    ...(selected ? { characterId: selected } : {}),
    ...(model === 'image' && version && versions.some((v) => v.id === version)
      ? { versionId: version }
      : {}),
    ...(source ? { sourceAssetId: source } : {}),
    ...(motion ? { motionAssetId: motion } : {}),
    prompt,
    scene,
    outfit,
    pose,
    format,
    count,
    duration,
    audio,
    orientation,
    loraScale: scale,
    ...(seed ? { seed: Number(seed) } : {}),
  };
  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const a = await uploadMedia(file, data!.mode, undefined, setUploadPhase);
      setMotion(a.id);
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="page studio-page">
      <PageTitle
        eyebrow={video ? 'BEWEGUNG & MOMENTE' : 'DEINE IDEE IM BILD'}
        title={video ? 'Video Studio' : 'Image Studio'}
        action={
          <button
            className={`button ${settings ? 'selected' : ''}`}
            onClick={() => setSettings(!settings)}
            aria-expanded={settings}
          >
            <SlidersHorizontal size={17} />
            Einstellungen
          </button>
        }
      />
      <UploadStatusList />
      <div className="studio-layout">
        <section className="studio-controls">
          <div className="segmented">
            {(video
              ? [
                  ['video', 'Bild animieren'],
                  ['motion', 'Motion Control'],
                ]
              : [
                  ['image', 'Charakter'],
                  ['draft', 'Entwurf'],
                  ['edit', 'Referenz bearbeiten'],
                ]
            ).map(([m, t]) => (
              <button
                className={model === m ? 'selected' : ''}
                key={m}
                onClick={() => setModel(m as ModelKey)}
              >
                {t}
              </button>
            ))}
          </div>
          <label>
            Charakter
            <select
              value={selected}
              onChange={(e) => {
                select(e.target.value);
                setVersion('');
              }}
            >
              <option value="">Charakter wählen</option>
              {data!.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {!video && model === 'image' && (
            <label>
              Trainingsversion
              <select
                value={versions.some((v) => v.id === version) ? version : ''}
                onChange={(e) => setVersion(e.target.value)}
              >
                <option value="">Neueste fertige Version</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.version} · Krea 2
                  </option>
                ))}
              </select>
            </label>
          )}
          {!video && model === 'edit' && (
            <div className="control-note">
              <ScanFace size={17} />
              <p>
                Seedream bekommt die freigegebenen Referenzbilder dieses Charakters und übernimmt
                ihr Format automatisch. Prüfe neue Ansichten, bevor du sie der Trainingsbasis
                hinzufügst.
              </p>
            </div>
          )}
          {!video && model === 'draft' && (
            <div className="control-note">
              <Sparkles size={17} />
              <p>
                Ein Entwurf erzeugt eine neue Interpretation. Prompt und Seed sichern keine
                Identität.
              </p>
            </div>
          )}
          {video ? (
            <>
              <label>
                Gespeichertes Startbild
                <select value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">Bild aus der Library wählen</option>
                  {data!.assets
                    .filter((a) => a.kind === 'image')
                    .map((a, i) => (
                      <option value={a.id} key={a.id}>
                        Bild {i + 1}
                        {a.demo ? ' · Demo' : ''}{' '}
                        {a.character_id === selected && character ? `· ${character.name}` : ''}
                      </option>
                    ))}
                </select>
              </label>
              {sourceAsset && (
                <img
                  className="source-thumbnail"
                  src={sourceAsset.url}
                  alt="Ausgewähltes Startbild"
                />
              )}
              {model === 'motion' ? (
                <>
                  <label>
                    Bewegungsreferenz
                    <select value={motion} onChange={(e) => setMotion(e.target.value)}>
                      <option value="">MP4 auswählen</option>
                      {data!.assets
                        .filter((a) => a.kind === 'video')
                        .map((a, i) => (
                          <option value={a.id} key={a.id}>
                            Video {i + 1} · {a.duration || 5} s
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="button upload-button">
                    <Upload size={16} />
                    {uploading ? uploadPhase : 'Bewegung hochladen'}
                    <input
                      type="file"
                      accept="video/mp4"
                      disabled={uploading}
                      onChange={(e) => void upload(e.target.files?.[0])}
                    />
                  </label>
                  <label>
                    Ausrichtung
                    <select
                      value={orientation}
                      onChange={(e) => setOrientation(e.target.value as 'image' | 'video')}
                    >
                      <option value="image">Wie im Bild · max. 10 Sekunden</option>
                      <option value="video">Wie im Video · max. 30 Sekunden</option>
                    </select>
                  </label>
                  <p className="muted">
                    Die serverseitig gemessene Referenzdauer bestimmt den Preis.
                  </p>
                </>
              ) : (
                <label>
                  Videolänge
                  <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                    {[3, 5, 10, 15].map((d) => (
                      <option key={d} value={d}>
                        {d} Sekunden
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={audio}
                  onChange={(e) => setAudio(e.target.checked)}
                />
                {model === 'motion' ? 'Originalton übernehmen' : 'Audio generieren'}
              </label>
            </>
          ) : (
            <>
              <label>
                Szene
                <input
                  value={scene}
                  onChange={(e) => setScene(e.target.value)}
                  placeholder="Licht, Ort und Atmosphäre …"
                  maxLength={400}
                />
              </label>
              <div className="two-columns">
                <label>
                  Outfit
                  <input
                    value={outfit}
                    onChange={(e) => setOutfit(e.target.value)}
                    placeholder="Weisses T-Shirt"
                    maxLength={250}
                  />
                </label>
                <label>
                  Pose
                  <input
                    value={pose}
                    onChange={(e) => setPose(e.target.value)}
                    placeholder="Spontaner Blick"
                    maxLength={250}
                  />
                </label>
              </div>
            </>
          )}
          <label>
            {video ? 'Bewegung beschreiben' : 'Dein Prompt'}
            <textarea
              className="prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                video ? 'Was soll sich bewegen?' : 'Beschreibe das Bild, das du dir vorstellst …'
              }
              maxLength={1800}
            />
            <small className="input-count">{prompt.length} / 1800</small>
          </label>
          {!video && (
            <div className="two-columns">
              <label>
                Format
                <select
                  disabled={model === 'edit'}
                  value={format}
                  onChange={(e) => setFormat(e.target.value as JobInput['format'])}
                >
                  {['4:5', '1:1', '9:16', '16:9'].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label>
                Varianten
                <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'Bild' : 'Bilder'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {settings && (
            <div className="advanced-settings">
              {!video && (
                <>
                  <label>
                    Seed (optional)
                    <input
                      inputMode="numeric"
                      type="number"
                      min={0}
                      max={2147483647}
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      placeholder="Zufällig"
                    />
                  </label>
                  {model === 'image' && (
                    <label>
                      LoRA-Stärke · {scale}
                      <input
                        type="range"
                        min={0}
                        max={4}
                        step={0.1}
                        value={scale}
                        onChange={(e) => setScale(Number(e.target.value))}
                      />
                    </label>
                  )}
                </>
              )}
              <p className="muted">
                {video
                  ? 'Kling erhält dein Startbild, keine Bild-LoRA.'
                  : 'Identitäts- und Körpermerkmale kommen aus der ausgewählten Charakterversion.'}
              </p>
            </div>
          )}
          <div className="generate-area">
            <CostButton
              input={input}
              disabled={!prompt.trim() || uploading || (video && !source)}
            />
            <p>
              <span className="private-dot" /> Privat gespeichert · Preis vor jedem Start
            </p>
          </div>
        </section>
        <section className="preview-area">
          <div className="preview-heading">
            <span>{video ? 'VIDEO-VORSCHAU' : 'DEINE ERGEBNISSE'}</span>
            <span>
              {preview?.demo ? 'DEMO-TESTMEDIUM' : preview ? 'PRIVAT' : 'BEREIT FÜR DEINE IDEE'}
            </span>
          </div>
          <div className="main-preview">
            {preview ? (
              preview.kind === 'video' ? (
                <video controls playsInline src={preview.url} poster="/demo/interior.jpg" />
              ) : (
                <img src={preview.url} alt="Ausgewähltes Ergebnis" />
              )
            ) : (
              <div className="empty-preview">
                {video ? <Film size={42} /> : <ImagePlus size={42} />}
                <h2>{video ? 'Gib deinem Bild Bewegung.' : 'Hier beginnt dein nächstes Bild.'}</h2>
                <p>
                  {video
                    ? 'Wähle links ein gespeichertes Startbild.'
                    : 'Wähle einen Charakter und beschreibe deine Szene.'}
                </p>
              </div>
            )}
            {preview?.demo && <div className="preview-watermark">DEMO / TESTMEDIUM</div>}
          </div>
          {preview && (
            <div className="preview-toolbar">
              <div>
                <strong>{preview.demo ? 'Szenenfoto / Testmedium' : 'Privates Ergebnis'}</strong>
                <small>
                  {preview.width} × {preview.height}
                  {preview.duration ? ` · ${preview.duration} s` : ''}
                </small>
              </div>
              <div>
                <button
                  className={`icon-button ${preview.favorite ? 'favorited' : ''}`}
                  aria-label="Favorit umschalten"
                  onClick={async () => {
                    await api(`assets/${preview.id}`, 'PATCH', { favorite: !preview.favorite });
                    setFocused(null);
                    await refresh();
                  }}
                >
                  <Heart size={19} fill={preview.favorite ? 'currentColor' : 'none'} />
                </button>
                <a
                  className="icon-button"
                  href={`/api/assets/${preview.id}?download=1`}
                  aria-label="Ergebnis herunterladen"
                >
                  <Download size={19} />
                </a>
                {!video && (
                  <Link className="button compact" href={`/video?source=${preview.id}`}>
                    Als Video <ArrowUpRight size={16} />
                  </Link>
                )}
                {!video && selected && (
                  <button
                    className="icon-button"
                    aria-label="Als Referenz prüfen"
                    onClick={() => setReference(preview)}
                  >
                    <ScanFace size={19} />
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="result-strip">
            {assets.slice(0, 8).map((a) => (
              <button
                key={a.id}
                className={preview?.id === a.id ? 'selected' : ''}
                onClick={() => setFocused(a)}
                aria-label="Ergebnis auswählen"
              >
                {a.kind === 'video' ? (
                  <Film size={24} />
                ) : (
                  <img src={a.url} alt="Ergebnisvorschau" />
                )}
                {preview?.id === a.id && <Check size={14} />}
              </button>
            ))}
          </div>
          {activeJobs.length > 0 && (
            <div className="active-jobs" aria-live="polite">
              {activeJobs.map((j) => (
                <div key={j.id}>
                  <span className="spin-ring" />
                  <span>
                    {j.model === 'train' ? 'Training' : 'Generierung'} · {j.credits} Credits
                  </span>
                  <Status value={j.status} />
                </div>
              ))}
            </div>
          )}
          <div className="studio-tip">
            <span>CREATOR NOTE</span>
            <p>
              {video
                ? 'Ein ruhiges Startbild und eine klare Bewegungsbeschreibung helfen beim Bewerten der Ergebnisse.'
                : 'Vergleiche Gesicht, Proportionen und Ausdruck. Nimm gute Ergebnisse gezielt in deine Referenzbasis auf.'}
            </p>
          </div>
        </section>
      </div>
      {reference && (
        <ReferenceForm
          asset={reference}
          characterId={selected}
          reference={data!.references.find(
            (r) => r.asset_id === reference.id && r.character_id === selected,
          )}
          onClose={() => setReference(null)}
          onSaved={async () => {
            setReference(null);
            await refresh();
            notify('Referenz gespeichert.');
          }}
        />
      )}
    </div>
  );
}
