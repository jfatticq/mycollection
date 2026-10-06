// Apply schema only to the checkout's isolated Miniflare database. Never remote.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const hosting = JSON.parse(readFileSync(resolve(root, '.openai/hosting.json'), 'utf8'));
if (!hosting.d1) throw new Error('This checkout has no D1 binding.');
const directory = resolve(root, '.sites-runtime');
mkdirSync(directory, { recursive: true });
const config = resolve(directory, 'local-d1.json');
writeFileSync(config, JSON.stringify({
  name: 'mycollection-local-schema',
  compatibility_date: '2026-05-15',
  d1_databases: [{
    binding: hosting.d1,
    database_name: 'site-creator-d1',
    database_id: '00000000-0000-4000-8000-000000000000',
    migrations_dir: resolve(root, 'drizzle'),
  }],
}, null, 2));
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve('wrangler/bin/wrangler.js'),
  'd1', 'migrations', 'apply', hosting.d1, '--local', '--config', config,
  '--persist-to', resolve(root, '.wrangler/state')], {
  cwd: root, stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false',
    WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: resolve(root, '.wrangler/logs'),
    CLOUDFLARE_CF_FETCH_ENABLED: 'false' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
