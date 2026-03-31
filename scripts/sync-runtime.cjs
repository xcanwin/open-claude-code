#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const claudeCodeVersion = packageJson.claudeCodeVersion;
const tempRuntimeDir = path.join(rootDir, 'temp', 'runtime');
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

function copyIfExists(from, to) {
  if (!fs.existsSync(from)) return;
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  run('cp', ['-R', from, to]);
}

function removeGeneratedTargets() {
  for (const target of ['cli.js', 'cli.js.map', 'src', 'vendor', 'sdk-tools.d.ts', 'LICENSE.md']) {
    fs.rmSync(path.join(rootDir, target), { recursive: true, force: true });
  }
}

function ensureTempRuntimeDir() {
  fs.rmSync(tempRuntimeDir, { recursive: true, force: true });
  fs.mkdirSync(tempRuntimeDir, { recursive: true });
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'open-claude-code-'));
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

run('tar', ['-xzf', archivePath, '-C', runtimeDir, '--strip-components=1']);
run('npx', ['--yes', 'reverse-sourcemap', '-o', 'recovered', path.basename(runtimeDir) + '/cli.js.map'], {
  cwd: tempRoot,
});

const recoveredDir = findRecoveredDir(recoverRoot, path.basename(runtimeDir));
if (!recoveredDir) {
  process.stderr.write(`missing recovered source tree for ${path.basename(runtimeDir)}\n`);
  process.exit(1);
}

ensureTempRuntimeDir();

copyIfExists(path.join(runtimeDir, 'vendor'), path.join(tempRuntimeDir, 'vendor'));
copyIfExists(path.join(runtimeDir, 'sdk-tools.d.ts'), path.join(tempRuntimeDir, 'sdk-tools.d.ts'));
copyIfExists(path.join(runtimeDir, 'LICENSE.md'), path.join(tempRuntimeDir, 'LICENSE.md'));
copyIfExists(path.join(recoveredDir, 'src'), path.join(tempRuntimeDir, 'src'));
copyIfExists(
  path.join(recoveredDir, 'vendor', 'image-processor-src'),
  path.join(tempRuntimeDir, 'vendor', 'image-processor-src'),
);

run('node', [path.join(rootDir, 'scripts', 'generate-source-stubs.cjs')]);
run('node', [path.join(rootDir, 'scripts', 'bootstrap-source-build.cjs')]);
run(
  'npm',
  ['install', '--package-lock=false', '--no-audit', '--no-fund'],
  { cwd: sourceBuildDir },
);
runWithRetry(
  'npx',
  ['--yes', 'node@20', path.join(sourceBuildDir, 'build.mjs')],
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

removeGeneratedTargets();

copyIfExists(path.join(sourceBuildDir, 'dist', 'cli.js'), path.join(rootDir, 'cli.js'));
copyIfExists(path.join(sourceBuildDir, 'dist', 'cli.js.map'), path.join(rootDir, 'cli.js.map'));
copyIfExists(path.join(tempRuntimeDir, 'vendor'), path.join(rootDir, 'vendor'));
copyIfExists(path.join(tempRuntimeDir, 'sdk-tools.d.ts'), path.join(rootDir, 'sdk-tools.d.ts'));
copyIfExists(path.join(tempRuntimeDir, 'LICENSE.md'), path.join(rootDir, 'LICENSE.md'));
copyIfExists(path.join(tempRuntimeDir, 'src'), path.join(rootDir, 'src'));

if (fs.existsSync(path.join(rootDir, 'cli.js'))) {
  fs.chmodSync(path.join(rootDir, 'cli.js'), 0o755);
}
