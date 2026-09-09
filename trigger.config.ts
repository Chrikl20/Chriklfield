import { defineConfig } from '@trigger.dev/sdk';
import { ffmpeg } from '@trigger.dev/build/extensions/core';
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID || 'configure-trigger-project',
  runtime: 'node',
  dirs: ['./src/trigger'],
  maxDuration: 600,
  retries: {
    enabledInDev: true,
    default: { maxAttempts: 3, minTimeoutInMs: 5000, maxTimeoutInMs: 30000, factor: 2 },
  },
  build: { extensions: [ffmpeg()] },
});
