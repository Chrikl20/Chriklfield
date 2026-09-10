import type { Template } from './types';

// Product presets ship with the app; workspace templates remain editable in Admin.
// Covers are inspiration photos, never generated outputs or identity references.
export const CREATOR_PRESETS: Template[] = [
  {
    id: 'off-duty',
    title: 'Off-duty energy',
    category: 'Fashion',
    format: '4:5',
    cover: '/creator/street.webp',
    enabled: true,
    scene: 'A sunlit city sidewalk, candid afternoon light',
    outfit: 'Oversized black hoodie, relaxed trousers, white sneakers, small sunglasses',
    pose: 'Seated casually on a low step, full outfit visible',
    prompt:
      'A candid outfit-of-the-day post. Natural skin texture, relaxed expression, believable phone photography. Keep the selected character identity.',
  },
  {
    id: 'coffee-run',
    title: 'Coffee & catch-up',
    category: 'Lifestyle',
    format: '4:5',
    cover: '/creator/coffee.webp',
    enabled: true,
    scene: 'An outdoor café on a bright afternoon',
    outfit: 'Casual everyday top and sunglasses',
    pose: 'Holding an iced coffee, looking towards the camera, relaxed shoulders',
    prompt:
      'A spontaneous coffee-run post with a personal, everyday feel. Natural light and realistic skin texture. Keep the selected character identity.',
  },
  {
    id: 'daily-fit',
    title: 'Today’s fit',
    category: 'Fashion',
    format: '9:16',
    cover: '/creator/style.webp',
    enabled: true,
    scene: 'City steps in soft daylight',
    outfit: 'Sleeveless knit top, wide-leg cream jeans, white sneakers, canvas tote',
    pose: 'Standing, slight turn towards the camera, shoes and full outfit in frame',
    prompt:
      'A vertical outfit check for a social story. Candid, confident, natural proportions. Keep the whole body in frame and preserve the selected character identity.',
  },
  {
    id: 'close-up',
    title: 'Face the feed',
    category: 'Beauty',
    format: '1:1',
    cover: '/creator/beauty.webp',
    enabled: true,
    scene: 'A simple backdrop with soft violet and blue accent light',
    outfit: 'A simple top, minimal accessories',
    pose: 'Close-up portrait, eyes towards the camera, relaxed expression',
    prompt:
      'An intimate beauty portrait for a profile post. Detailed natural skin texture, subtle makeup, no heavy retouching. Preserve the selected character face.',
  },
  {
    id: 'profile-shot',
    title: 'Main character',
    category: 'Beauty',
    format: '4:5',
    cover: '/creator/man.webp',
    enabled: true,
    scene: 'A neutral dark background with soft directional window light',
    outfit: 'A textured casual knit top',
    pose: 'Head-and-shoulders portrait, direct eye contact, confident expression',
    prompt:
      'A personal profile portrait with natural skin detail and a relaxed, confident presence. Preserve the selected character identity and avoid heavy retouching.',
  },
  {
    id: 'weekend-story',
    title: 'Weekend mood',
    category: 'Lifestyle',
    format: '9:16',
    cover: '/creator/coffee.webp',
    enabled: true,
    scene: 'A sunny terrace during a relaxed weekend break',
    outfit: 'A comfortable off-duty outfit with sunglasses',
    pose: 'Sitting with a drink, mid-laugh, candid framing',
    prompt:
      'A personal day-in-my-life story. Warm daylight, unposed expression, natural skin detail. Leave a little space above the subject for a later caption. Preserve the selected character identity.',
  },
];
