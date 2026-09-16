import { describe, expect, it } from 'vitest';
import {
  defaultPreferences,
  preferredFormat,
  preferredStudio,
  readPreferences,
  safeDestination,
} from '@/domain/account';
import { readStudioDraft } from '@/domain/studio-draft';

describe('account navigation and personalization', () => {
  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/api/auth/logout',
    '/auth/callback#access_token=bad',
    '/login',
    '/image\n',
  ])('rejects unsafe return target %s', (input) => expect(safeDestination(input)).toBe('/explore'));
  it('keeps the selected template but strips tokens and arbitrary query data', () => {
    expect(
      safeDestination('/image?preset=daily-fit&access_token=secret&next=https://evil.test#secret'),
    ).toBe('/image?preset=daily-fit');
  });
  it('validates stored preferences and applies real format and workspace defaults', () => {
    expect(readPreferences({ ...defaultPreferences, admin: true })).toBeNull();
    expect(readPreferences({ ...defaultPreferences, vibe: '<script>' })).toBeNull();
    expect(preferredFormat({ ...defaultPreferences, platform: 'tiktok' })).toBe('9:16');
    expect(preferredFormat({ ...defaultPreferences, platform: 'youtube' })).toBe('16:9');
    expect(preferredStudio({ ...defaultPreferences, goal: 'video' })).toBe('/video');
  });
  it('expires guest drafts and never restores extra fields as credentials or user identity', () => {
    const value = {
      model: 'draft',
      scene: '',
      outfit: '',
      pose: '',
      prompt: 'My idea',
      format: '4:5',
      count: 1,
      duration: 5,
      audio: false,
      orientation: 'image',
      access_token: 'secret',
      userId: 'someone',
    };
    const encoded = JSON.stringify({ expires: 2000, value });
    const result = readStudioDraft(encoded, 1000);
    expect(result?.prompt).toBe('My idea');
    expect(result).not.toHaveProperty('access_token');
    expect(result).not.toHaveProperty('userId');
    expect(readStudioDraft(encoded, 3000)).toBeNull();
    expect(readStudioDraft('broken')).toBeNull();
  });
});
