import { test, expect, vi } from 'vitest';
import { runUpload, type UploadServices } from '@/server/media/upload-worker';
import type { UploadIntent } from '@/domain/uploads';
const bytes = Buffer.from([255, 216, 255, 0, 1]);
const u = {
  id: 'intent',
  user_id: 'owner',
  workspace_id: 'workspace',
  character_id: null,
  asset_id: 'durable-asset',
  kind: 'image',
  expected_bytes: bytes.length,
  capacity_bytes: 10485760,
  lease_token: 'lease',
} as UploadIntent;
function services(): UploadServices {
  return {
    claim: vi.fn().mockResolvedValue(u),
    authorize: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue(bytes),
    normalize: vi
      .fn()
      .mockResolvedValue({
        bytes,
        kind: 'image',
        mime: 'image/jpeg',
        extension: 'jpg',
        width: 300,
        height: 300,
        duration: null,
      }),
    persist: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
  };
}
test('checks ownership again after decoding before publishing a file', async () => {
  const s = services();
  await runUpload(u.id, s);
  expect(s.authorize).toHaveBeenCalledTimes(2);
  expect(s.persist).toHaveBeenCalledWith(u, expect.objectContaining({ mime: 'image/jpeg' }));
  expect(s.retry).not.toHaveBeenCalled();
});
test('rejects membership loss before reading private bytes', async () => {
  const s = services();
  vi.mocked(s.authorize).mockRejectedValue(new Error('FORBIDDEN'));
  await runUpload(u.id, s);
  expect(s.read).not.toHaveBeenCalled();
  expect(s.persist).not.toHaveBeenCalled();
  expect(s.retry).toHaveBeenCalledWith(u, 'FORBIDDEN', true);
});
test('rejects content mismatch and corrupt media without publishing', async () => {
  const size = services();
  vi.mocked(size.read).mockResolvedValue(Buffer.from('wrong length'));
  await runUpload(u.id, size);
  expect(size.retry).toHaveBeenCalledWith(u, 'UPLOAD_SIZE_MISMATCH', true);
  const corrupt = services();
  vi.mocked(corrupt.normalize).mockRejectedValue(new Error('INVALID_IMAGE'));
  await runUpload(u.id, corrupt);
  expect(corrupt.persist).not.toHaveBeenCalled();
  expect(corrupt.retry).toHaveBeenCalledWith(u, 'INVALID_IMAGE', true);
});
test('retries unavailable storage and ambiguous persistence using the same durable intent', async () => {
  const s = services();
  vi.mocked(s.persist).mockRejectedValueOnce(new Error('DATABASE_ERROR'));
  await runUpload(u.id, s);
  expect(s.retry).toHaveBeenCalledWith(u, 'DATABASE_ERROR', false);
  await runUpload(u.id, s);
  expect(s.persist).toHaveBeenCalledTimes(2);
  expect(vi.mocked(s.persist).mock.calls.map(([i]) => i.asset_id)).toEqual([
    'durable-asset',
    'durable-asset',
  ]);
  vi.mocked(s.claim).mockResolvedValue(null);
  expect(await runUpload(u.id, s)).toEqual({ claimed: false });
  expect(s.persist).toHaveBeenCalledTimes(2);
});
