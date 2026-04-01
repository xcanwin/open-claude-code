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
const {
  copyIfExists,
  createTempRoot,
  ensureSourceMapComment,
  extractArchiveSync,
  formatArchiveName,
  recoverSources,
  resolveArchive,
  rewriteSourceMapPaths,
} = require(path.join(rootDir, 'scripts', 'runtime-utils.cjs'));
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
);
const defaultClaudeCodeVersion = packageJson.claudeCodeVersion ?? '0.0.0';
const archiveFallbackBaseUrl = packageJson.claudeCodeArchiveFallbackBaseUrl ?? '';

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

async function main() {
  const { version, dir } = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(rootDir, dir);
  const packageName = `open-claude-code-${version}`;
  const archiveName = formatArchiveName(version);
  const archivePath = path.join(outDir, archiveName);
  const runtimeDir = path.join(outDir, packageName);

  fs.mkdirSync(outDir, { recursive: true });

  if (!fs.existsSync(archivePath)) {
    const tempRoot = createTempRoot('open-claude-code-recover-');
    const resolvedArchive = await resolveArchive(
      tempRoot,
      version,
      archiveFallbackBaseUrl,
    );
    copyIfExists(resolvedArchive.archivePath, archivePath);
  }

  fs.rmSync(runtimeDir, { recursive: true, force: true });
  fs.mkdirSync(runtimeDir, { recursive: true });

  extractArchiveSync(archivePath, runtimeDir);
  const { recoveredDir } = recoverSources({
    tempRoot: outDir,
    runtimeDir,
    packageDirName: packageName,
  });
  copyIfExists(path.join(recoveredDir, 'src'), path.join(runtimeDir, 'src'));
  ensureSourceMapComment(path.join(runtimeDir, 'cli.js'));
  rewriteSourceMapPaths(path.join(runtimeDir, 'cli.js.map'));

  const result = spawnSync(process.execPath, [path.join(runtimeDir, 'cli.js'), '--version'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  process.stdout.write(
    [
      '',
      `runnable package: ${runtimeDir}`,
      `recovered tree:   ${recoveredDir}`,
      `run command:      node ${path.join(runtimeDir, 'cli.js')} --version`,
      '',
    ].join('\n'),
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
