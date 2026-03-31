#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tar = require('tar');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const claudeCodeVersion = packageJson.claudeCodeVersion;
const runtimeOutputDir = path.join(rootDir, 'runtime');
const sourceBuildDir = path.join(rootDir, 'temp', 'source-build');

if (!claudeCodeVersion) {
  process.stderr.write('package.json is missing claudeCodeVersion\n');
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    ...options,
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

function logStep(message) {
  process.stdout.write(`[sync-runtime] ${message}\n`);
}

function runWithRetry(command, args, options = {}, retryOptions = {}) {
  const {
    attempts = 1,
    retryOn = () => false,
    label = `${command} ${args.join(' ')}`,
  } = retryOptions;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = spawnSync(command, args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
      ...options,
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

    if (result.status === 0) {
      return (result.stdout ?? '').trim();
    }

    const shouldRetry = attempt < attempts && retryOn(output, result);
    if (shouldRetry) {
      process.stderr.write(
        `${label} failed, retrying (${attempt}/${attempts})\n`,
      );
      continue;
    }

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}

function parsePackFilename(output) {
  const trimmed = output.trim();
  if (!trimmed) {
    process.stderr.write('npm pack returned empty output\n');
    process.exit(1);
  }

  if (trimmed.startsWith('[')) {
    const entries = JSON.parse(trimmed);
    const filename = entries.at(-1)?.filename;
    if (filename) return filename;
  }

  const match = trimmed.match(/([^\s"'[\]]+\.tgz)/);
  if (match) return match[1];

  process.stderr.write(`unable to parse npm pack output: ${trimmed}\n`);
  process.exit(1);
}

function findRecoveredDir(recoverRoot, basename) {
  const stack = [recoverRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;
    if (path.basename(current) === basename) return current;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        stack.push(path.join(current, entry.name));
      }
    }
  }
  return null;
}

function clonePathSync(from, to) {
  const stat = fs.lstatSync(from);

  if (stat.isSymbolicLink()) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.symlinkSync(fs.readlinkSync(from), to);
    return;
  }

  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      clonePathSync(path.join(from, entry.name), path.join(to, entry.name));
    }
    fs.chmodSync(to, stat.mode);
    return;
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  fs.chmodSync(to, stat.mode);
}

function copyIfExists(from, to) {
  if (!fs.existsSync(from)) return;
  fs.rmSync(to, { recursive: true, force: true });
  clonePathSync(from, to);
}

function extractArchiveSync(file, cwd) {
  tar.x({
    cwd,
    file,
    strip: 1,
    sync: true,
  });
}

function removeGeneratedTargets() {
  fs.rmSync(runtimeOutputDir, { recursive: true, force: true });
  fs.rmSync(sourceBuildDir, { recursive: true, force: true });
}

function ensureRuntimeOutputDir() {
  fs.rmSync(runtimeOutputDir, { recursive: true, force: true });
  fs.mkdirSync(runtimeOutputDir, { recursive: true });
}

function removePathIfExists(targetPath) {
  try {
    const stat = fs.lstatSync(targetPath);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(targetPath);
      return;
    }
  } catch {}
  fs.rmSync(targetPath, { recursive: true, force: true });
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'open-claude-code-'));
logStep(`packing @anthropic-ai/claude-code@${claudeCodeVersion}`);
const archiveName = parsePackFilename(
  run('npm', ['pack', `@anthropic-ai/claude-code@${claudeCodeVersion}`, '--silent'], {
    cwd: tempRoot,
    env: {
      ...process.env,
      npm_config_json: '',
      npm_config_dry_run: '',
      npm_config_pack_destination: '',
    },
  }),
);
const archivePath = path.join(tempRoot, archiveName);
const runtimeDir = path.join(tempRoot, `open-claude-code-${claudeCodeVersion}`);
const recoverRoot = path.join(tempRoot, 'recovered');

fs.mkdirSync(runtimeDir, { recursive: true });
fs.mkdirSync(recoverRoot, { recursive: true });

logStep('extracting upstream package');
extractArchiveSync(archivePath, runtimeDir);
logStep('recovering sources from sourcemap');
run('npx', ['--yes', 'reverse-sourcemap', '-o', 'recovered', path.basename(runtimeDir) + '/cli.js.map'], {
  cwd: tempRoot,
});

const recoveredDir = findRecoveredDir(recoverRoot, path.basename(runtimeDir));
if (!recoveredDir) {
  process.stderr.write(`missing recovered source tree for ${path.basename(runtimeDir)}\n`);
  process.exit(1);
}

removeGeneratedTargets();
ensureRuntimeOutputDir();

logStep('copying runtime assets');
copyIfExists(path.join(runtimeDir, 'vendor'), path.join(runtimeOutputDir, 'vendor'));
copyIfExists(path.join(runtimeDir, 'sdk-tools.d.ts'), path.join(runtimeOutputDir, 'sdk-tools.d.ts'));
copyIfExists(path.join(runtimeDir, 'LICENSE.md'), path.join(runtimeOutputDir, 'LICENSE.md'));
copyIfExists(path.join(recoveredDir, 'src'), path.join(runtimeOutputDir, 'src'));
copyIfExists(
  path.join(recoveredDir, 'vendor', 'image-processor-src'),
  path.join(runtimeOutputDir, 'vendor', 'image-processor-src'),
);

logStep('generating source stubs');
run('node', [path.join(rootDir, 'scripts', 'generate-source-stubs.cjs')]);
logStep('bootstrapping source-build workspace');
run('node', [path.join(rootDir, 'scripts', 'bootstrap-source-build.cjs')]);
logStep('installing source-build dependencies');
run(
  'npm',
  ['install', '--package-lock=false', '--no-audit', '--no-fund'],
  { cwd: sourceBuildDir },
);
logStep('building runtime CLI');
runWithRetry(
  process.execPath,
  [path.join(sourceBuildDir, 'build.mjs')],
  { cwd: sourceBuildDir },
  {
    attempts: 5,
    label: 'source build',
    retryOn(output) {
      return (
        output.includes('The service was stopped') ||
        output.includes('The service is no longer running')
      );
    },
  },
);

removePathIfExists(path.join(runtimeOutputDir, 'node_modules'));
logStep('copying build artifacts');
copyIfExists(path.join(sourceBuildDir, 'dist', 'cli.js'), path.join(runtimeOutputDir, 'cli.js'));
copyIfExists(path.join(sourceBuildDir, 'dist', 'cli.js.map'), path.join(runtimeOutputDir, 'cli.js.map'));

if (fs.existsSync(path.join(runtimeOutputDir, 'cli.js'))) {
  fs.chmodSync(path.join(runtimeOutputDir, 'cli.js'), 0o755);
}

logStep('done');
