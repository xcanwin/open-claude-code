#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const tar = require('tar');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
);
const defaultClaudeCodeVersion = packageJson.claudeCodeVersion ?? '0.0.0';

function usage(code = 0) {
  const text = [
    'Usage: open-claude-code-recover -v <version> -d <dir>',
    '',
    'Options:',
    `  -v, --version   Claude Code version, default: ${defaultClaudeCodeVersion}`,
    '  -d, --dir       Output directory, default: ./artifacts',
    '  -h, --help      Show this help',
  ].join('\n');
  (code === 0 ? process.stdout : process.stderr).write(`${text}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { version: defaultClaudeCodeVersion, dir: 'artifacts' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') usage(0);
    if (arg === '-v' || arg === '--version') {
      args.version = argv[++i];
      continue;
    }
    if (arg === '-d' || arg === '--dir') {
      args.dir = argv[++i];
      continue;
    }
    usage(1);
  }
  if (!args.version || !args.dir) usage(1);
  return args;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    cwd: rootDir,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function findRecoveredDir(recoverRoot, packageName) {
  const stack = [recoverRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;
    if (path.basename(current) === packageName) return current;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        stack.push(path.join(current, entry.name));
      }
    }
  }
  return null;
}

function copyDirIfExists(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

function extractArchiveSync(file, cwd) {
  tar.x({
    cwd,
    file,
    strip: 1,
    sync: true,
  });
}

const { version, dir } = parseArgs(process.argv.slice(2));
const outDir = path.resolve(rootDir, dir);
const packageName = `open-claude-code-${version}`;
const archiveName = `anthropic-ai-claude-code-${version}.tgz`;
const archivePath = path.join(outDir, archiveName);
const runtimeDir = path.join(outDir, packageName);
const recoverRoot = path.join(outDir, 'recovered');

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(recoverRoot, { recursive: true });

if (!fs.existsSync(archivePath)) {
  run('npm', ['pack', `@anthropic-ai/claude-code@${version}`, '--silent'], {
    cwd: outDir,
  });
}

fs.rmSync(runtimeDir, { recursive: true, force: true });
fs.rmSync(path.join(recoverRoot, packageName), { recursive: true, force: true });
fs.mkdirSync(runtimeDir, { recursive: true });

extractArchiveSync(archivePath, runtimeDir);
run('npx', ['--yes', 'reverse-sourcemap', '-o', 'recovered', `${packageName}/cli.js.map`], {
  cwd: outDir,
});

const recoveredDir = findRecoveredDir(recoverRoot, packageName);
if (!recoveredDir) {
  process.stderr.write(`missing recovered source tree for ${packageName}\n`);
  process.exit(1);
}

copyDirIfExists(path.join(recoveredDir, 'src'), path.join(runtimeDir, 'src'));
copyDirIfExists(
  path.join(recoveredDir, 'vendor', 'image-processor-src'),
  path.join(runtimeDir, 'vendor', 'image-processor-src'),
);

run(process.execPath, [path.join(runtimeDir, 'cli.js'), '--version']);

process.stdout.write(
  [
    '',
    `runnable package: ${runtimeDir}`,
    `recovered tree:   ${recoveredDir}`,
    `run command:      node ${path.join(runtimeDir, 'cli.js')} --version`,
    '',
  ].join('\n'),
);
