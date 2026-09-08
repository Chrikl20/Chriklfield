'use client';
import { api, useStudio } from './studio-context';
import { uploadMessages } from '@/domain/uploads';
import { useState } from 'react';
export function UploadStatusList() {
  const { data, refresh, notify } = useStudio();
  const [busy, setBusy] = useState('');
  const uploads = data?.uploads || [];
  if (!uploads.length) return null;
  async function resume(id: string) {
    setBusy(id);
    try {
      await api(`uploads/${id}/complete`, 'POST', {});
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="upload-status-list" aria-label="Dateiübertragungen">
      {uploads.map((u) => (
        <div className="upload-status-row" key={u.id}>
          <div>
            <strong>
              {u.kind === 'image' ? 'Bild' : 'Video'} ·{' '}
              {new Date(u.created_at).toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </strong>
            <p role="status">
              {u.state === 'failed'
                ? uploadMessages[u.error_code || ''] || uploadMessages.UPLOAD_PROCESSING_FAILED
                : u.state === 'awaiting'
                  ? 'Übertragung noch nicht bestätigt'
                  : u.state === 'processing'
                    ? 'Datei wird geprüft'
                    : 'Wartet auf Dateiprüfung'}
            </p>
          </div>
          {u.state === 'awaiting' && (
            <button className="button" disabled={!!busy} onClick={() => void resume(u.id)}>
              Übertragung prüfen
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
