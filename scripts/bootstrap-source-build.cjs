#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const moduleBuiltin = require('node:module');

const rootDir = path.resolve(__dirname, '..');
const runtimeDir = path.join(rootDir, 'runtime');
const runtimeSrcDir = path.join(runtimeDir, 'src');
const runtimeNodeModulesDir = path.join(runtimeDir, 'node_modules');
const outDir = path.join(rootDir, 'temp', 'source-build');
const sourceBuildDependenciesManifestPath = path.join(
  rootDir,
  'scripts',
  'source-build-dependencies.json',
);
const shimsDir = path.join(outDir, 'shims');
const stubsDir = path.join(outDir, 'stubs');
const sourceBuildDependenciesManifest = JSON.parse(
  fs.readFileSync(sourceBuildDependenciesManifestPath, 'utf8'),
);
const builtins = new Set(
  moduleBuiltin.builtinModules.flatMap(specifier => [
    specifier,
    specifier.replace(/^node:/, ''),
  ]),
);
const ignorePackages = new Set([
  'audio-capture.node',
  'user',
]);
const stubPackages = {
  '@ant/claude-for-chrome-mcp': 'ant-claude-for-chrome-mcp.js',
  '@ant/computer-use-input': 'ant-computer-use-input.js',
  '@ant/computer-use-mcp': 'ant-computer-use-mcp.js',
  '@ant/computer-use-mcp/sentinelApps': 'ant-computer-use-mcp-sentinel-apps.js',
  '@ant/computer-use-mcp/types': 'ant-computer-use-mcp-types.js',
  '@ant/computer-use-swift': 'ant-computer-use-swift.js',
  '@anthropic-ai/claude-agent-sdk': 'anthropic-claude-agent-sdk.js',
  '@anthropic-ai/sandbox-runtime': 'anthropic-sandbox-runtime.js',
  'audio-capture-napi': 'audio-capture-napi.js',
  'color-diff-napi': 'color-diff-napi.js',
  'image-processor-napi': 'image-processor-napi.js',
  'modifiers-napi': 'modifiers-napi.js',
  'url-handler-napi': 'url-handler-napi.js',
};
const macro = {
  VERSION: require(path.join(rootDir, 'package.json')).claudeCodeVersion ?? '0.0.0',
  BUILD_TIME: '',
  FEEDBACK_CHANNEL: 'https://github.com/xcanwin/open-claude-code/issues',
  ISSUES_EXPLAINER: 'report issues at https://github.com/xcanwin/open-claude-code/issues',
  NATIVE_PACKAGE_URL: '',
  PACKAGE_URL: require(path.join(rootDir, 'package.json')).name,
  VERSION_CHANGELOG: '',
};

function walkFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectSpecifiers(text) {
  const specifiers = [];
  const patterns = [
    /^\s*import(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm,
    /^\s*export(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) specifiers.push(specifier);
    }
  }

  return specifiers;
}

function toTopLevelPackage(specifier) {
  if (specifier.startsWith('@')) {
    return specifier.split('/').slice(0, 2).join('/');
  }
  return specifier.split('/')[0];
}

function isBarePackage(specifier) {
  if (!specifier) return false;
  if (specifier.startsWith('.') || specifier.startsWith('/')) return false;
  if (specifier.startsWith('src/')) return false;
  if (specifier.startsWith('bun:')) return false;

  const topLevel = toTopLevelPackage(specifier);
  if (builtins.has(specifier) || builtins.has(topLevel)) return false;

  return /^[A-Za-z0-9@][A-Za-z0-9@._/-]*$/.test(specifier);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fail(messageLines) {
  process.stderr.write(`${messageLines.join('\n')}\n`);
  process.exit(1);
}

if (!fs.existsSync(runtimeSrcDir)) {
  process.stderr.write(`missing recovered source directory: ${runtimeSrcDir}\n`);
  process.exit(1);
}

if (sourceBuildDependenciesManifest.claudeCodeVersion !== macro.VERSION) {
  fail([
    'source-build dependency manifest version mismatch',
    `expected: ${macro.VERSION}`,
    `received: ${sourceBuildDependenciesManifest.claudeCodeVersion ?? 'undefined'}`,
    `manifest: ${sourceBuildDependenciesManifestPath}`,
  ]);
}

ensureDir(outDir);
ensureDir(shimsDir);
ensureDir(stubsDir);

try {
  const stat = fs.lstatSync(runtimeNodeModulesDir);
  if (!stat.isSymbolicLink()) {
    fs.rmSync(runtimeNodeModulesDir, { recursive: true, force: true });
  }
} catch {}

if (!fs.existsSync(runtimeNodeModulesDir)) {
  fs.symlinkSync(path.relative(path.dirname(runtimeNodeModulesDir), path.join(outDir, 'node_modules')), runtimeNodeModulesDir, 'dir');
}

const importCounts = new Map();

for (const filePath of walkFiles(runtimeSrcDir)) {
  const source = fs.readFileSync(filePath, 'utf8');
  for (const specifier of collectSpecifiers(source)) {
    if (!isBarePackage(specifier)) continue;
    const pkg = toTopLevelPackage(specifier);
    importCounts.set(pkg, (importCounts.get(pkg) ?? 0) + 1);
  }
}

const runtimeDependencies = [...importCounts.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([name]) => name)
  .filter(name => !ignorePackages.has(name) && !(name in stubPackages));
const pinnedRuntimeDependencies = sourceBuildDependenciesManifest.dependencies ?? {};
const pinnedRuntimeDependencyNames = Object.keys(pinnedRuntimeDependencies).sort();
const missingPinnedDependencies = runtimeDependencies.filter(
  name => !pinnedRuntimeDependencies[name],
);
const stalePinnedDependencies = pinnedRuntimeDependencyNames.filter(
  name => !runtimeDependencies.includes(name),
);
const pinnedBuildDevDependencies = sourceBuildDependenciesManifest.devDependencies ?? {};

if (!pinnedBuildDevDependencies.esbuild) {
  fail([
    'source-build dependency manifest is missing devDependencies.esbuild',
    `manifest: ${sourceBuildDependenciesManifestPath}`,
  ]);
}

if (missingPinnedDependencies.length > 0 || stalePinnedDependencies.length > 0) {
  fail([
    'source-build dependency manifest is out of date',
    `manifest: ${sourceBuildDependenciesManifestPath}`,
    missingPinnedDependencies.length > 0
      ? `missing pinned dependencies: ${missingPinnedDependencies.join(', ')}`
      : 'missing pinned dependencies: none',
    stalePinnedDependencies.length > 0
      ? `stale pinned dependencies: ${stalePinnedDependencies.join(', ')}`
      : 'stale pinned dependencies: none',
    'update the manifest before rebuilding runtime',
  ]);
}

writeJson(
  path.join(outDir, 'dependencies.generated.json'),
  runtimeDependencies,
);

writeJson(
  path.join(outDir, 'package.runtime.generated.json'),
  {
    dependencies: Object.fromEntries(
      runtimeDependencies.map(name => [name, pinnedRuntimeDependencies[name]]),
    ),
  },
);

writeJson(
  path.join(outDir, 'imports.generated.json'),
  [...importCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count })),
);

writeJson(path.join(outDir, 'package.json'), {
  name: 'open-claude-code-source-build',
  private: true,
  type: 'module',
  scripts: {
    build: 'node ./build.mjs',
  },
  dependencies: Object.fromEntries(
    runtimeDependencies.map(name => [name, pinnedRuntimeDependencies[name]]),
  ),
  devDependencies: pinnedBuildDevDependencies,
});

writeJson(path.join(outDir, 'tsconfig.json'), {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'react-jsx',
    allowJs: true,
    baseUrl: '.',
    paths: {
      'src/*': ['../../runtime/src/*'],
      'bun:bundle': ['./shims/bun-bundle.js'],
      'bun:ffi': ['./shims/bun-ffi.js'],
    },
    resolveJsonModule: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    skipLibCheck: true,
    noEmit: true,
  },
  include: ['../../runtime/src/**/*', './shims/**/*'],
});

fs.writeFileSync(
  path.join(shimsDir, 'bun-bundle.js'),
  `export function feature(name) {
  const scoped = process.env[\`OCC_FEATURE_\${name}\`];
  const globalDefault = process.env.OCC_FEATURE_ALL;
  const raw = scoped ?? globalDefault ?? '0';
  return /^(1|true|yes|on)$/i.test(String(raw));
}
`,
);

fs.writeFileSync(
  path.join(shimsDir, 'bun-ffi.js'),
  `export function dlopen() {
  throw new Error('bun:ffi is unavailable in the source-build workspace');
}

export default { dlopen };
`,
);

const stubFiles = {
  'ant-claude-for-chrome-mcp.js': `const UNAVAILABLE = 'Claude in Chrome is unavailable in open-claude-code.';

export const BROWSER_TOOLS = [];

export function createClaudeForChromeMcpServer() {
  return {
    setRequestHandler() {},
    async connect() {},
    async close() {},
  };
}

export class Logger {
  silly() {}
  debug() {}
  info() {}
  warn() {}
  error() {}
}

export default {
  BROWSER_TOOLS,
  createClaudeForChromeMcpServer,
  Logger,
  UNAVAILABLE,
};
`,
  'ant-computer-use-input.js': `function unsupported() {
  throw new Error('@ant/computer-use-input is unavailable in open-claude-code');
}

const api = {
  isSupported: false,
  click: unsupported,
  doubleClick: unsupported,
  drag: unsupported,
  key: unsupported,
  keys: unsupported,
  moveMouse: unsupported,
  scroll: unsupported,
  type: unsupported,
};

export default api;
export const isSupported = false;
`,
  'ant-computer-use-mcp.js': `const UNAVAILABLE = 'Computer use is unavailable in open-claude-code.';

export const DEFAULT_GRANT_FLAGS = {
  clipboardRead: false,
  clipboardWrite: false,
  systemKeyCombos: false,
};

export const API_RESIZE_PARAMS = {
  maxEdge: 1568,
  minEdge: 768,
};

export function targetImageSize(width, height) {
  return [width, height];
}

export function buildComputerUseTools() {
  return [];
}

export function bindSessionContext() {
  return async () => ({
    content: [{ type: 'text', text: UNAVAILABLE }],
    isError: true,
  });
}

export function createComputerUseMcpServer() {
  return {
    setRequestHandler() {},
    async connect() {},
    async close() {},
  };
}
`,
  'ant-computer-use-mcp-sentinel-apps.js': `export function getSentinelCategory() {
  return null;
}
`,
  'ant-computer-use-mcp-types.js': `export const DEFAULT_GRANT_FLAGS = {
  clipboardRead: false,
  clipboardWrite: false,
  systemKeyCombos: false,
};
`,
  'ant-computer-use-swift.js': `function unsupported() {
  throw new Error('@ant/computer-use-swift is unavailable in open-claude-code');
}

const api = {
  tcc: {
    checkAccessibility: () => false,
    checkScreenRecording: () => false,
  },
  apps: {
    listInstalled: async () => [],
    listRunning: async () => [],
  },
  captureExcluding: unsupported,
  captureRegion: unsupported,
  resolvePrepareCapture: unsupported,
};

export default api;
`,
  'anthropic-claude-agent-sdk.js': `export {};
`,
  'anthropic-sandbox-runtime.js': `export class SandboxViolationStore {}

export const SandboxRuntimeConfigSchema = {
  parse(value) {
    return value;
  },
};

const emptyDependencyCheck = () => ({ errors: [], warnings: [] });
const emptyFsConfig = () => ({ allowRead: [], denyRead: [], allowWrite: [], denyWrite: [] });
const emptyNetworkConfig = () => ({ allowedDomains: [], deniedDomains: [] });

export const SandboxManager = {
  async initialize() {},
  updateConfig() {},
  async reset() {},
  async wrapWithSandbox(command) {
    return command;
  },
  checkDependencies: emptyDependencyCheck,
  isSupportedPlatform() {
    return false;
  },
  getFsReadConfig: emptyFsConfig,
  getFsWriteConfig: emptyFsConfig,
  getNetworkRestrictionConfig: emptyNetworkConfig,
  getAllowUnixSockets() {
    return undefined;
  },
  getAllowLocalBinding() {
    return undefined;
  },
  getIgnoreViolations() {
    return undefined;
  },
  getEnableWeakerNestedSandbox() {
    return undefined;
  },
  getProxyPort() {
    return undefined;
  },
  getSocksProxyPort() {
    return undefined;
  },
  getLinuxHttpSocketPath() {
    return undefined;
  },
  getLinuxSocksSocketPath() {
    return undefined;
  },
  async waitForNetworkInitialization() {
    return true;
  },
  getSandboxViolationStore() {
    return new SandboxViolationStore();
  },
  annotateStderrWithSandboxFailures(_command, stderr) {
    return stderr;
  },
  cleanupAfterCommand() {},
};
`,
  'audio-capture-napi.js': `export function isNativeAudioAvailable() {
  return false;
}

export function isNativeRecordingActive() {
  return false;
}

export function startNativeRecording() {
  return false;
}

export function stopNativeRecording() {}
`,
  'color-diff-napi.js': `export {
  ColorDiff,
  ColorFile,
  getSyntaxTheme,
  getNativeModule,
} from '../../../runtime/src/native-ts/color-diff/index.ts';
`,
  'image-processor-napi.js': `import sharp from 'sharp';

export { sharp };
export default sharp;

export function getNativeModule() {
  return null;
}
`,
  'modifiers-napi.js': `export function prewarm() {}

export function isModifierPressed() {
  return false;
}
`,
  'url-handler-napi.js': `export function waitForUrlEvent() {
  return null;
}
`,
};

for (const [fileName, contents] of Object.entries(stubFiles)) {
  fs.writeFileSync(path.join(stubsDir, fileName), contents);
}

fs.writeFileSync(
  path.join(outDir, 'build.mjs'),
  `import { mkdir, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtimeRoot = path.resolve(__dirname, '../../runtime');
const runtimeSrc = path.join(runtimeRoot, 'src');
const distDir = path.join(__dirname, 'dist');
const stubAliases = ${JSON.stringify(
  Object.fromEntries(
    Object.entries(stubPackages).map(([specifier, fileName]) => [
      specifier,
      ['./stubs', fileName],
    ]),
  ),
  null,
  2,
)};

const featureFlagsOffPlugin = {
  name: 'feature-flags-off',
  setup(buildApi) {
    buildApi.onLoad({ filter: /\\.[cm]?[jt]sx?$/ }, async args => {
      const source = await readFile(args.path, 'utf8');
      const patchedSource = source
        .replace(/\\bfeature\\(\\s*(['"])[A-Z0-9_]+\\1\\s*\\)/g, 'false')
        .replace(
          /'-d2e, --debug-to-stderr'/g,
          ${JSON.stringify("'--debug-to-stderr'")},
        );
      return {
        contents: patchedSource,
        loader: args.path.endsWith('.tsx')
          ? 'tsx'
          : args.path.endsWith('.ts')
            ? 'ts'
            : args.path.endsWith('.jsx')
              ? 'jsx'
              : 'js',
      };
    });
  },
};

await mkdir(distDir, { recursive: true });

  const buildOptions = {
  entryPoints: [path.join(runtimeSrc, 'entrypoints', 'cli.tsx')],
  outfile: path.join(distDir, 'cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  sourcesContent: false,
  logLevel: 'info',
  legalComments: 'none',
  banner: {
    js: '#!/usr/bin/env node\\nimport { createRequire as __createRequire } from \"node:module\";\\nconst require = __createRequire(import.meta.url);',
  },
  define: {
    MACRO: '${JSON.stringify(macro)}',
    'process.env.USER_TYPE': '"external"',
    'process.env.CLAUDE_CODE_VERIFY_PLAN': '"false"',
  },
  alias: {
    ...Object.fromEntries(
      Object.entries(stubAliases).map(([specifier, segments]) => [
        specifier,
        path.join(__dirname, ...segments),
      ]),
    ),
    'bun:bundle': path.join(__dirname, 'shims', 'bun-bundle.js'),
    'bun:ffi': path.join(__dirname, 'shims', 'bun-ffi.js'),
  },
  loader: {
    '.md': 'text',
    '.txt': 'text',
    '.node': 'file',
  },
  plugins: [featureFlagsOffPlugin],
  tsconfig: path.join(__dirname, 'tsconfig.json'),
};

const MAX_BUILD_ATTEMPTS = 5;

for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt += 1) {
  try {
    await build(buildOptions);
    break;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable =
      message.includes('The service was stopped') ||
      message.includes('The service is no longer running');
    if (!retryable || attempt === MAX_BUILD_ATTEMPTS) {
      throw error;
    }

    process.stderr.write(
      \`esbuild stopped unexpectedly, retrying build (\${attempt}/\${MAX_BUILD_ATTEMPTS})\\n\`,
    );
    await delay(500 * attempt);
  }
}
`,
);

process.stdout.write(`source build workspace generated at ${outDir}\n`);
