#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
for (const target of [
  path.join(rootDir, 'runtime'),
  path.join(rootDir, 'temp', 'source-build'),
]) {
  fs.rmSync(target, { recursive: true, force: true });
}
