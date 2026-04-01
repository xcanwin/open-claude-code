#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {
  copyIfExists,
  createTempRoot,
  ensureSourceMapComment,
  extractArchiveSync,
  recoverSources,
  resolveArchive,
  rewriteSourceMapPaths,
} = require('./runtime-utils.cjs');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const claudeCodeVersion = packageJson.claudeCodeVersion;
const claudeCodeArchiveFallbackBaseUrl =
  packageJson.claudeCodeArchiveFallbackBaseUrl ?? '';
const runtimeOutputDir = path.join(rootDir, 'runtime');

if (!claudeCodeVersion) {
  process.stderr.write('package.json is missing claudeCodeVersion\n');
  process.exit(1);
}

function logStep(message) {
  process.stdout.write(`[sync-runtime] ${message}\n`);
}

function removeGeneratedTargets() {
  fs.rmSync(runtimeOutputDir, { recursive: true, force: true });
  fs.rmSync(path.join(rootDir, 'temp'), { recursive: true, force: true });
}

function ensureRuntimeOutputDir() {
  fs.rmSync(runtimeOutputDir, { recursive: true, force: true });
  fs.mkdirSync(runtimeOutputDir, { recursive: true });
}

async function main() {
  const tempRoot = createTempRoot();
  logStep(`packing @anthropic-ai/claude-code@${claudeCodeVersion}`);
  const resolvedArchive = await resolveArchive(
    tempRoot,
    claudeCodeVersion,
    claudeCodeArchiveFallbackBaseUrl,
    logStep,
  );
  const archivePath = resolvedArchive.archivePath;
  const runtimeDir = path.join(tempRoot, `open-claude-code-${claudeCodeVersion}`);

  fs.mkdirSync(runtimeDir, { recursive: true });

  logStep('extracting upstream package');
  extractArchiveSync(archivePath, runtimeDir);
  logStep('recovering sources from sourcemap');
  const { recoveredDir } = recoverSources({
    tempRoot,
    runtimeDir,
    packageDirName: path.basename(runtimeDir),
  });

  removeGeneratedTargets();
  ensureRuntimeOutputDir();

  logStep('copying runtime assets');
  copyIfExists(path.join(runtimeDir, 'cli.js'), path.join(runtimeOutputDir, 'cli.js'));
  copyIfExists(path.join(runtimeDir, 'cli.js.map'), path.join(runtimeOutputDir, 'cli.js.map'));
  copyIfExists(path.join(runtimeDir, 'vendor'), path.join(runtimeOutputDir, 'vendor'));
  copyIfExists(path.join(runtimeDir, 'sdk-tools.d.ts'), path.join(runtimeOutputDir, 'sdk-tools.d.ts'));
  copyIfExists(path.join(runtimeDir, 'LICENSE.md'), path.join(runtimeOutputDir, 'LICENSE.md'));
  copyIfExists(path.join(recoveredDir, 'src'), path.join(runtimeOutputDir, 'src'));
  ensureSourceMapComment(path.join(runtimeOutputDir, 'cli.js'));
  rewriteSourceMapPaths(path.join(runtimeOutputDir, 'cli.js.map'));

  if (fs.existsSync(path.join(runtimeOutputDir, 'cli.js'))) {
    fs.chmodSync(path.join(runtimeOutputDir, 'cli.js'), 0o755);
  }

  logStep('done');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
