#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const cliPath = path.join(rootDir, 'runtime', 'cli.js');

if (!fs.existsSync(cliPath)) {
  process.stderr.write(
    [
      'open-claude-code runtime is missing.',
      'Run `npm run sync:runtime` to generate runtime/cli.js before invoking this command directly.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--enable-source-maps', cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env,
});

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);
