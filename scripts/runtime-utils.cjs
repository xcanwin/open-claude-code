const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tar = require('tar');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    ...options,
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return (result.stdout ?? '').trim();
}

function runWithRetry(command, args, options = {}, retryOptions = {}) {
  const {
    attempts = 1,
    retryOn = () => false,
    label = `${command} ${args.join(' ')}`,
  } = retryOptions;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = spawnSync(command, args, {
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

function formatArchiveName(version) {
  return `anthropic-ai-claude-code-${version}.tgz`;
}

function formatArchiveFallbackUrl(baseUrl, version) {
  if (!baseUrl) return null;
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const archiveName = formatArchiveName(version);
  return `${normalizedBaseUrl}/${archiveName.slice(0, -4)}/${archiveName}`;
}

function tryPackArchive(tempRoot, version) {
  const result = spawnSync(
    'npm',
    ['pack', `@anthropic-ai/claude-code@${version}`, '--silent'],
    {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...process.env,
        npm_config_json: '',
        npm_config_dry_run: '',
        npm_config_pack_destination: '',
      },
    },
  );

  if (result.status === 0) {
    return {
      archivePath: path.join(tempRoot, parsePackFilename(result.stdout ?? '')),
      source: 'npm',
    };
  }

  return {
    source: 'npm',
    status: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}

function downloadArchiveFallback(tempRoot, version, fallbackBaseUrl) {
  const url = formatArchiveFallbackUrl(fallbackBaseUrl, version);
  if (!url) {
    process.stderr.write(
      'package.json is missing claudeCodeArchiveFallbackBaseUrl\n',
    );
    process.exit(1);
  }

  const archiveName = parsePackFilename(
    runWithRetry(
      'npm',
      ['pack', url, '--silent'],
      {
        cwd: tempRoot,
        env: {
          ...process.env,
          npm_config_json: '',
          npm_config_dry_run: '',
          npm_config_pack_destination: '',
        },
      },
      {
        attempts: 3,
        label: `fallback archive download for @anthropic-ai/claude-code@${version}`,
      },
    ),
  );

  return {
    archivePath: path.join(tempRoot, archiveName),
    source: 'github-release',
    url,
  };
}

async function resolveArchive(tempRoot, version, fallbackBaseUrl, logStep) {
  if (process.env.OPEN_CLAUDE_CODE_FORCE_ARCHIVE_FALLBACK === '1') {
    logStep?.(
      `downloading fallback archive for @anthropic-ai/claude-code@${version}`,
    );
    return downloadArchiveFallback(tempRoot, version, fallbackBaseUrl);
  }

  const packed = tryPackArchive(tempRoot, version);
  if (packed.archivePath) return packed;

  process.stderr.write(
    `npm pack failed for @anthropic-ai/claude-code@${version}, trying fallback archive\n`,
  );
  if (packed.output) {
    process.stderr.write(`${packed.output}\n`);
  }

  logStep?.(
    `downloading fallback archive for @anthropic-ai/claude-code@${version}`,
  );
  return downloadArchiveFallback(tempRoot, version, fallbackBaseUrl);
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

function createTempRoot(prefix = 'open-claude-code-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function ensureSourceMapComment(jsPath, mapFileName = 'cli.js.map') {
  const source = fs.readFileSync(jsPath, 'utf8');
  if (source.includes('//# sourceMappingURL=')) return;
  const normalized = source.endsWith('\n') ? source : `${source}\n`;
  fs.writeFileSync(
    jsPath,
    `${normalized}//# sourceMappingURL=${mapFileName}\n`,
  );
}

function rewriteSourceMapPaths(mapPath) {
  const sourceMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  if (!Array.isArray(sourceMap.sources)) return;

  sourceMap.sources = sourceMap.sources.map(source => {
    if (typeof source !== 'string') return source;
    if (source.startsWith('../src/')) {
      return `./src/${source.slice('../src/'.length)}`;
    }
    if (source.startsWith('../vendor/')) {
      return `./vendor/${source.slice('../vendor/'.length)}`;
    }
    return source;
  });

  fs.writeFileSync(mapPath, `${JSON.stringify(sourceMap)}\n`);
}

function recoverSources({
  tempRoot,
  runtimeDir,
  packageDirName,
}) {
  const recoverRoot = path.join(tempRoot, 'recovered');
  fs.mkdirSync(recoverRoot, { recursive: true });

  run(
    'npx',
    ['--yes', 'reverse-sourcemap', '-o', 'recovered', `${packageDirName}/cli.js.map`],
    { cwd: tempRoot },
  );

  const recoveredDir = findRecoveredDir(recoverRoot, packageDirName);
  if (!recoveredDir) {
    process.stderr.write(
      `missing recovered source tree for ${packageDirName}\n`,
    );
    process.exit(1);
  }

  return {
    recoverRoot,
    recoveredDir,
    runtimeDir,
  };
}

module.exports = {
  copyIfExists,
  createTempRoot,
  ensureSourceMapComment,
  extractArchiveSync,
  formatArchiveName,
  parsePackFilename,
  recoverSources,
  resolveArchive,
  rewriteSourceMapPaths,
  run,
  runWithRetry,
};
