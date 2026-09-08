// Keep Next.js usable with supervisors that forward Vite-style preview flags.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const args = process.argv
  .slice(2)
  .filter((arg) => arg !== '--strictPort')
  .map((arg) => (arg === '--host' ? '--hostname' : arg));
if (!args.includes('--hostname')) args.push('--hostname', '0.0.0.0');
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', ...args], {
  stdio: 'inherit',
  env: process.env,
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 1));
