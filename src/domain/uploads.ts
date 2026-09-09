import { z } from 'zod';
export const uploadSchema = z
  .object({
    mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
    bytes: z
      .number()
      .int()
      .positive()
      .max(100 * 1024 * 1024),
    characterId: z.uuid().nullable().default(null),
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict()
  .refine((v) => v.mime === 'video/mp4' || v.bytes <= 10 * 1024 * 1024, 'FILE_TOO_LARGE');
export interface UploadStatus {
  id: string;
  asset_id: string;
  character_id: string | null;
  kind: 'image' | 'video';
  state: 'awaiting' | 'queued' | 'processing' | 'ready' | 'failed';
  error_code: string | null;
  created_at: string;
}
export interface UploadIntent extends UploadStatus {
  workspace_id: string;
  user_id: string;
  mime: string;
  expected_bytes: number;
  capacity_bytes: number;
  bucket: string;
  path: string;
  lease_token: string | null;
  lease_until: string | null;
  expires_at: string;
  cleanup_after: string;
}
export const uploadStatusFields = 'id,asset_id,character_id,kind,state,error_code,created_at';
export function uploadStatus(u: UploadIntent): UploadStatus {
  return {
    id: u.id,
    asset_id: u.asset_id,
    character_id: u.character_id,
    kind: u.kind,
    state: u.state,
    error_code: u.error_code,
    created_at: u.created_at,
  };
}
export const uploadMessages: Record<string, string> = {
  UPLOAD_EXPIRED: 'Die Dateiübertragung ist abgelaufen. Bitte erneut hochladen.',
  UPLOAD_PROCESSING_FAILED: 'Die Datei konnte nicht geprüft werden. Bitte erneut hochladen.',
  UPLOAD_SIZE_MISMATCH: 'Die übertragene Datei ist unvollständig oder hat eine andere Grösse.',
  UNSUPPORTED_MEDIA: 'Bitte JPEG, PNG, WebP oder MP4 verwenden.',
  INVALID_IMAGE: 'Dieses Bild kann nicht sicher gelesen werden.',
  INVALID_VIDEO: 'Dieses Video kann nicht sicher gelesen werden.',
  IMAGE_LIMITS: 'Bild: mindestens 300 Pixel je Seite, maximal 10 MB und 40 Megapixel.',
  VIDEO_LIMITS: 'Video: 3–30 Sekunden, 340–3850 Pixel je Seite, maximal 100 MB.',
  FILE_TOO_LARGE: 'Diese Datei überschreitet das Grössenlimit.',
  STORAGE_LIMIT:
    'Der private Speicher ist voll; vorübergehend belegter Upload-Speicher wird automatisch freigegeben.',
  FORBIDDEN: 'Der Zugriff auf diesen Workspace ist nicht mehr möglich.',
};
