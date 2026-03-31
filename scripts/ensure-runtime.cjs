#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const requiredTargets = [
  'cli.js',
  'cli.js.map',
  'src',
  'vendor',
  'sdk-tools.d.ts',
  'LICENSE.md',
];

const missingTargets = requiredTargets.filter(target => {
  return !fs.existsSync(path.join(rootDir, target));
});

if (missingTargets.length === 0) {
  process.stdout.write('runtime already present, skipping sync:runtime\n');
  process.exit(0);
}

const result = spawnSync(process.execPath, [path.join(__dirname, 'sync-runtime.cjs')], {
  cwd: rootDir,
  stdio: 'inherit',
  env: process.env,
});

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);
