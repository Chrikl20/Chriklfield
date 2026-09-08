'use client';
import { createClient } from '@supabase/supabase-js';
import { api } from './studio-context';
import { requestKey } from './request-key';
import { uploadMessages, uploadSchema, type UploadStatus } from '@/domain/uploads';
export async function uploadMedia(
  file: File,
  mode: 'demo' | 'live',
  characterId?: string,
  phase: (value: string) => void = () => {},
) {
  const input = {
    mime: file.type,
    bytes: file.size,
    characterId: characterId || null,
    idempotencyKey: requestKey(),
  };
  if (!uploadSchema.safeParse(input).success)
    throw new Error('Bitte JPEG, PNG oder WebP bis 10 MB oder MP4 bis 100 MB verwenden.');
  phase('Wird übertragen …');
  if (mode === 'demo') {
    const res = await fetch(`/api/uploads${characterId ? `?characterId=${characterId}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    const value = await res.json();
    if (!res.ok)
      throw new Error(uploadMessages[value.error] || 'Die Datei konnte nicht verarbeitet werden.');
    return value as { id: string };
  }
  const ticket = await api<UploadStatus & { bucket: string; path: string; token: string }>(
    'uploads',
    'POST',
    input,
  );
  const storage = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15 * 60000) }),
      },
    },
  ).storage;
  // The SDK sends the body directly to Supabase. No media bytes cross a Vercel Function.
  // An ambiguous response may mean the immutable object was accepted; always reconcile it.
  try {
    await storage
      .from(ticket.bucket)
      .uploadToSignedUrl(ticket.path, ticket.token, file, {
        contentType: file.type,
        cacheControl: '0',
      });
  } catch {
    /* The worker determines whether the complete object exists. */
  }
  phase('Datei wird geprüft …');
  await api(`uploads/${ticket.id}/complete`, 'POST', {});
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const status = await api<UploadStatus>(`uploads/${ticket.id}`);
    if (status.state === 'ready') return { id: status.asset_id };
    if (status.state === 'failed')
      throw new Error(
        uploadMessages[status.error_code || ''] || uploadMessages.UPLOAD_PROCESSING_FAILED,
      );
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    'Die Datei wird im Hintergrund weiter geprüft. Den Status findest du in der Library.',
  );
}
