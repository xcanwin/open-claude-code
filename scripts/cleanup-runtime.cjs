#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
for (const target of [
  'runtime',
  'cli.js',
  'cli.js.map',
  'src',
  'vendor',
  'sdk-tools.d.ts',
  'LICENSE.md',
]) {
  fs.rmSync(path.join(rootDir, target), { recursive: true, force: true });
}
