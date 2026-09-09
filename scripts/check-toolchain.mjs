// Offline compatibility checks for pinned security overrides; no credentials/network needed.
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const cliRequire = createRequire(require.resolve('trigger.dev/package.json'));
const buildRequire = createRequire(require.resolve('@trigger.dev/build'));
const prismaRequire = createRequire(buildRequire.resolve('@prisma/config'));
const { deepmerge } = await import(prismaRequire.resolve('deepmerge-ts'));
assert.deepEqual(deepmerge({ env: { a: 1 } }, { env: { b: 2 } }), { env: { a: 1, b: 2 } });
const tar = cliRequire('tar');
const temp = await mkdtemp(join(tmpdir(), 'chriklfield-toolchain-'));
try {
  await mkdir(join(temp, 'out'));
  await writeFile(join(temp, 'fixture.txt'), 'local fixture');
  await tar.create({ cwd: temp, file: join(temp, 'fixture.tgz'), gzip: true }, ['fixture.txt']);
  await tar.extract({ cwd: join(temp, 'out'), file: join(temp, 'fixture.tgz') });
  assert.equal(await readFile(join(temp, 'out', 'fixture.txt'), 'utf8'), 'local fixture');
} finally {
  await rm(temp, { recursive: true, force: true });
}
const esbuild = cliRequire('esbuild');
const result = await esbuild.build({
  entryPoints: ['src/trigger/jobs.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  packages: 'external',
  write: false,
  logLevel: 'silent',
});
assert.equal(result.outputFiles.length, 1);
console.log(
  'Toolchain passed: config merge, archive round-trip, complete worker bundle. No live deployment.',
);
