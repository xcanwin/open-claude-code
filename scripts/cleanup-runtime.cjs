#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const tempRuntimeDir = path.join(rootDir, 'temp', 'runtime');
const generatedTargets = [
  'cli.js',
  'cli.js.map',
  'src',
  'vendor',
  'sdk-tools.d.ts',
  'LICENSE.md',
];

fs.rmSync(tempRuntimeDir, { recursive: true, force: true });
fs.mkdirSync(tempRuntimeDir, { recursive: true });

for (const target of generatedTargets) {
  const from = path.join(rootDir, target);
  const to = path.join(tempRuntimeDir, target);

  if (!fs.existsSync(from)) continue;

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
}
