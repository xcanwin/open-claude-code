#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const runtimeSrcDir = path.join(rootDir, 'runtime', 'src');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const autoStubManifestPath = path.join(rootDir, 'scripts', 'auto-stub-targets.json');
const autoStubManifest = JSON.parse(fs.readFileSync(autoStubManifestPath, 'utf8'));
const allowedAutoStubTargets = new Set(autoStubManifest.autoStubTargets ?? []);

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeStub(relativePath, contents) {
  const filePath = path.join(runtimeSrcDir, relativePath);
  if (fs.existsSync(filePath)) return;
  ensureParent(filePath);
  fs.writeFileSync(filePath, contents);
}

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

function stripTypePrefix(name) {
  return name.replace(/^\s*type\s+/, '').trim();
}

function parseNamedImports(raw) {
  return raw
    .split(',')
    .map(part => stripTypePrefix(part))
    .map(part => part.split(/\s+as\s+/i)[0]?.trim())
    .filter(Boolean);
}

function addRef(refs, specifier, update) {
  if (!specifier) return;
  const current =
    refs.get(specifier) ?? {
      default: false,
      namespace: false,
      named: new Set(),
    };
  update(current);
  refs.set(specifier, current);
}

function collectLocalReferences(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const refs = new Map();

  for (const match of source.matchAll(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const clause = match[1]?.trim();
    const specifier = match[2];
    if (!specifier) continue;

    addRef(refs, specifier, ref => {
      if (!clause) return;
      if (clause.startsWith('{')) {
        for (const name of parseNamedImports(clause.slice(1, -1))) {
          ref.named.add(name);
        }
        return;
      }

      if (clause.startsWith('* as ')) {
        ref.namespace = true;
        ref.default = true;
        return;
      }

      const parts = clause.split(',');
      const defaultImport = stripTypePrefix(parts[0] ?? '');
      if (defaultImport) ref.default = true;
      const namedPart = parts.slice(1).join(',').trim();
      if (namedPart.startsWith('{')) {
        for (const name of parseNamedImports(namedPart.slice(1, -1))) {
          ref.named.add(name);
        }
      }
    });
  }

  for (const match of source.matchAll(/export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[2];
    addRef(refs, specifier, ref => {
      for (const name of parseNamedImports(match[1] ?? '')) {
        ref.named.add(name);
      }
    });
  }

  for (const match of source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)\.([A-Za-z_$][\w$]*)/g)) {
    const specifier = match[1];
    const name = match[2];
    addRef(refs, specifier, ref => {
      if (name) ref.named.add(name);
    });
  }

  for (const match of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const specifier = match[1];
    addRef(refs, specifier, ref => {
      ref.default = true;
    });
  }

  for (const match of source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const specifier = match[1];
    addRef(refs, specifier, ref => {
      ref.default = true;
    });
  }

  return refs;
}

function resolveLocalTarget(fromFile, specifier) {
  if (specifier.startsWith('src/')) {
    return path.join(runtimeSrcDir, specifier.slice(4));
  }
  if (specifier.startsWith('.')) {
    return path.resolve(path.dirname(fromFile), specifier);
  }
  return null;
}

function hasSourceForTarget(targetPath) {
  if (fs.existsSync(targetPath)) return true;
  const ext = path.extname(targetPath);
  const base = ext ? targetPath.slice(0, -ext.length) : targetPath;
  for (const candidate of [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.txt',
    '.md',
    '.json',
  ]) {
    if (fs.existsSync(base + candidate)) return true;
  }
  return false;
}

function makeAutoStub(ref) {
  const lines = ['const stub = {};', 'export default stub;'];
  for (const name of [...ref.named].sort()) {
    if (!/^[$A-Z_a-z][$\w]*$/.test(name)) continue;
    lines.push(`export const ${name} = undefined;`);
  }
  return `${lines.join('\n')}\n`;
}

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function isGeneratedAutoStubFile(targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  const ext = path.extname(targetPath);
  const source = fs.readFileSync(targetPath, 'utf8');
  if (ext === '.txt' || ext === '.md') {
    return source === '' || source === '\n';
  }
  return source.startsWith('const stub = {};\nexport default stub;\n');
}

if (!fs.existsSync(runtimeSrcDir)) {
  process.stderr.write(`missing recovered source directory: ${runtimeSrcDir}\n`);
  process.exit(1);
}

if (autoStubManifest.claudeCodeVersion !== packageJson.claudeCodeVersion) {
  process.stderr.write(
    [
      'auto stub manifest version mismatch',
      `expected: ${packageJson.claudeCodeVersion}`,
      `received: ${autoStubManifest.claudeCodeVersion ?? 'undefined'}`,
      `manifest: ${autoStubManifestPath}`,
      '',
    ].join('\n'),
  );
  process.exit(1);
}

writeStub(
  'assistant/index.ts',
  `export function markAssistantForced(): void {}
export function isAssistantForced(): boolean {
  return false;
}
export function isAssistantMode(): boolean {
  return false;
}
export async function initializeAssistantTeam(): Promise<undefined> {
  return undefined;
}
export function getAssistantSystemPromptAddendum(): string {
  return '';
}
export function getAssistantActivationPath(): string | undefined {
  return undefined;
}
`,
);

writeStub(
  'assistant/gate.ts',
  `export async function isKairosEnabled(): Promise<boolean> {
  return false;
}
`,
);

writeStub(
  'assistant/sessionDiscovery.ts',
  `export interface AssistantSession {
  id: string;
  title?: string;
}

export async function discoverAssistantSessions(): Promise<AssistantSession[]> {
  return [];
}
`,
);

writeStub(
  'assistant/AssistantSessionChooser.tsx',
  `import React from 'react';
import type { AssistantSession } from './sessionDiscovery.js';

export function AssistantSessionChooser(_props: {
  sessions: AssistantSession[];
  onSelect: (id: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  return <></>;
}
`,
);

writeStub(
  'commands/agents-platform/index.ts',
  `export default {};
`,
);

writeStub(
  'commands/assistant/assistant.tsx',
  `import React from 'react';

export async function computeDefaultInstallDir(): Promise<string> {
  return '.claude-assistant';
}

export function NewInstallWizard(_props: {
  defaultInstallDir: string;
  onComplete: (installDir: string | null) => void;
  onCancel: () => void;
  onError: (error: Error) => void;
}): React.JSX.Element {
  return <></>;
}
`,
);

writeStub(
  'components/agents/SnapshotUpdateDialog.tsx',
  `import React from 'react';

export function buildMergePrompt(agentType: string, scope: string): string {
  return \`Merge the pending memory snapshot update for agent "\${agentType}" (\${scope}).\`;
}

export function SnapshotUpdateDialog(_props: {
  agentType: string;
  scope: string;
  snapshotTimestamp: string;
  onComplete: (choice: 'merge' | 'keep' | 'replace') => void;
  onCancel: () => void;
}): React.JSX.Element {
  return <></>;
}
`,
);

writeStub(
  'ink/global.d.ts',
  `export {};
`,
);

writeStub(
  'ink/devtools.ts',
  `export {};
`,
);

writeStub(
  'ssh/createSSHSession.ts',
  `export class SSHSessionError extends Error {}

function notAvailable(): never {
  throw new SSHSessionError('SSH source module is unavailable in the recovered source build');
}

export async function createSSHSession(): Promise<never> {
  return notAvailable();
}

export function createLocalSSHSession(): never {
  return notAvailable();
}
`,
);

writeStub(
  'server/parseConnectUrl.ts',
  `export function parseConnectUrl(): never {
  throw new Error('Direct connect is unavailable in the recovered source build');
}
`,
);

writeStub(
  'server/server.ts',
  `export function startServer(): never {
  throw new Error('Server mode is unavailable in the recovered source build');
}
`,
);

writeStub(
  'server/sessionManager.ts',
  `export class SessionManager {
  constructor(..._args: unknown[]) {}
  async destroyAll(): Promise<void> {}
}
`,
);

writeStub(
  'server/backends/dangerousBackend.ts',
  `export class DangerousBackend {}
`,
);

writeStub(
  'server/serverBanner.ts',
  `export function printBanner(): void {}
`,
);

writeStub(
  'server/serverLog.ts',
  `export function createServerLogger() {
  return console;
}
`,
);

writeStub(
  'server/lockfile.ts',
  `export async function writeServerLock(): Promise<void> {}
export async function removeServerLock(): Promise<void> {}
export async function probeRunningServer(): Promise<null> {
  return null;
}
`,
);

writeStub(
  'server/connectHeadless.ts',
  `export async function runConnectHeadless(): Promise<never> {
  throw new Error('Direct connect headless mode is unavailable in the recovered source build');
}
`,
);

writeStub(
  'proactive/index.ts',
  `export function isProactiveActive(): boolean {
  return false;
}

export function activateProactive(): void {}
`,
);

writeStub(
  'tools/TungstenTool/TungstenTool.ts',
  `export class TungstenTool {}
`,
);

writeStub(
  'tools/TungstenTool/TungstenLiveMonitor.tsx',
  `import React from 'react';

export function TungstenLiveMonitor(): React.JSX.Element | null {
  return null;
}
`,
);

writeStub(
  'tools/REPLTool/REPLTool.ts',
  `export class REPLTool {}
`,
);

writeStub(
  'tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.ts',
  `export class SuggestBackgroundPRTool {}
`,
);

writeStub(
  'tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.ts',
  `export class VerifyPlanExecutionTool {}
`,
);

const generatedAutoTargets = new Set();
const encounteredAllowedAutoTargets = new Set();
const unexpectedAutoStubTargets = [];

for (const filePath of walkFiles(runtimeSrcDir)) {
  const refs = collectLocalReferences(filePath);
  for (const [specifier, ref] of refs.entries()) {
    if (!specifier.startsWith('.') && !specifier.startsWith('src/')) continue;
    const targetPath = resolveLocalTarget(filePath, specifier);
    if (!targetPath) continue;
    const relativeTarget = normalizeRelativePath(
      path.relative(runtimeSrcDir, targetPath),
    );
    if (
      allowedAutoStubTargets.has(relativeTarget) &&
      isGeneratedAutoStubFile(targetPath)
    ) {
      encounteredAllowedAutoTargets.add(relativeTarget);
      generatedAutoTargets.add(relativeTarget);
      continue;
    }
    if (hasSourceForTarget(targetPath)) continue;
    if (!allowedAutoStubTargets.has(relativeTarget)) {
      unexpectedAutoStubTargets.push({
        importer: normalizeRelativePath(path.relative(runtimeSrcDir, filePath)),
        specifier,
        target: relativeTarget,
      });
      continue;
    }
    encounteredAllowedAutoTargets.add(relativeTarget);
    if (generatedAutoTargets.has(relativeTarget)) continue;

    ensureParent(targetPath);
    const ext = path.extname(targetPath);
    if (ext === '.txt' || ext === '.md') {
      fs.writeFileSync(targetPath, '');
      generatedAutoTargets.add(relativeTarget);
      continue;
    }

    fs.writeFileSync(targetPath, makeAutoStub(ref));
    generatedAutoTargets.add(relativeTarget);
  }
}

const staleAutoStubTargets = [...allowedAutoStubTargets].filter(
  target => !encounteredAllowedAutoTargets.has(target),
);

if (unexpectedAutoStubTargets.length > 0 || staleAutoStubTargets.length > 0) {
  process.stderr.write(
    [
      'auto stub manifest is out of date',
      `manifest: ${autoStubManifestPath}`,
      unexpectedAutoStubTargets.length > 0
        ? `unexpected missing targets: ${JSON.stringify(unexpectedAutoStubTargets, null, 2)}`
        : 'unexpected missing targets: none',
      staleAutoStubTargets.length > 0
        ? `stale manifest targets: ${staleAutoStubTargets.join(', ')}`
        : 'stale manifest targets: none',
      'update the manifest before rebuilding runtime',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

writeStub(
  'tools/WorkflowTool/constants.ts',
  `export const WORKFLOW_TOOL_NAME = 'workflow';
`,
);

writeStub(
  'tools/DiscoverSkillsTool/prompt.ts',
  `export const DISCOVER_SKILLS_TOOL_NAME = 'discover_skills';
`,
);

writeStub(
  'utils/protectedNamespace.ts',
  `export function checkProtectedNamespace(): boolean {
  return false;
}
`,
);

writeStub(
  'entrypoints/sdk/coreTypes.generated.ts',
  `export {};
`,
);

writeStub(
  'entrypoints/sdk/runtimeTypes.ts',
  `export {};
`,
);

writeStub(
  'entrypoints/sdk/settingsTypes.generated.ts',
  `export interface Settings {
  [key: string]: unknown;
}
`,
);

writeStub(
  'entrypoints/sdk/toolTypes.ts',
  `export {};
`,
);

writeStub(
  'types/connectorText.ts',
  `export interface ConnectorTextBlock {
  type: 'connector_text';
  text?: string;
}

export interface ConnectorTextDelta {
  type: 'connector_text_delta';
  text?: string;
}

export function isConnectorTextBlock(_value: unknown): _value is ConnectorTextBlock {
  return false;
}
`,
);

writeStub(
  'utils/filePersistence/types.ts',
  `export const DEFAULT_UPLOAD_CONCURRENCY = 4;
export const FILE_COUNT_LIMIT = 1000;
export const OUTPUTS_SUBDIR = 'outputs';

export interface PersistedFile {
  path: string;
  fileId?: string;
}

export interface FailedPersistence {
  path: string;
  error: string;
}

export interface FilesPersistedEventData {
  persistedFiles: PersistedFile[];
  failed: FailedPersistence[];
}

export type TurnStartTime = number;
`,
);

writeStub(
  'utils/ultraplan/prompt.txt',
  `Ultraplan prompt placeholder.
`,
);

writeStub(
  'services/compact/cachedMicrocompact.ts',
  `export interface CacheEditsBlock {
  block?: unknown;
}

export interface PinnedCacheEdits {
  userMessageIndex: number;
  block: CacheEditsBlock;
}

export interface CachedMCState {
  pinnedEdits: PinnedCacheEdits[];
  registeredTools: Set<string>;
}

export function createCachedMCState(): CachedMCState {
  return {
    pinnedEdits: [],
    registeredTools: new Set(),
  };
}

export function registerToolResult(state: CachedMCState, toolUseId: string): void {
  state.registeredTools.add(toolUseId);
}

export function registerToolMessage(): void {}

export function getToolResultsToDelete(): string[] {
  return [];
}

export function createCacheEditsBlock(): CacheEditsBlock | null {
  return null;
}

export function markToolsSentToAPI(): void {}

export function resetCachedMCState(state: CachedMCState): void {
  state.pinnedEdits = [];
  state.registeredTools.clear();
}
`,
);

writeStub(
  'services/compact/snipCompact.ts',
  `export function isSnipRuntimeEnabled(): boolean {
  return false;
}

export function shouldNudgeForSnips(): boolean {
  return false;
}

export function snipCompactIfNeeded(): null {
  return null;
}
`,
);

writeStub(
  'services/contextCollapse/index.ts',
  `export function getStats() {
  return {
    collapsedSpans: 0,
    stagedSpans: 0,
    health: {
      totalErrors: 0,
      totalEmptySpawns: 0,
      emptySpawnWarningEmitted: false,
    },
  };
}

export function subscribe(): () => void {
  return () => {};
}

export function isContextCollapseEnabled(): boolean {
  return false;
}

export async function applyCollapsesIfNeeded<T>(value: T): Promise<T> {
  return value;
}

export function recoverFromOverflow<T>(value: T): T {
  return value;
}

export function resetContextCollapse(): void {}
`,
);

writeStub(
  'services/contextCollapse/persist.ts',
  `export function restoreFromEntries(): void {}
`,
);

writeStub(
  'services/contextCollapse/operations.ts',
  `export function getContextCollapseOperations(): never[] {
  return [];
}
`,
);

writeStub(
  'skills/bundled/verify/SKILL.md',
  `# Verify

This bundled skill content was not present in the recovered source tree.
`,
);

writeStub(
  'skills/bundled/verify/examples/cli.md',
  `CLI verify example placeholder.
`,
);

writeStub(
  'skills/bundled/verify/examples/server.md',
  `Server verify example placeholder.
`,
);

process.stdout.write(`source stubs ensured under ${runtimeSrcDir}\n`);
