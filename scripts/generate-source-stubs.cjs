#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const runtimeSrcDir = path.join(rootDir, 'temp', 'runtime', 'src');

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeStub(relativePath, contents) {
  const filePath = path.join(runtimeSrcDir, relativePath);
  if (fs.existsSync(filePath)) return;
  ensureParent(filePath);
  fs.writeFileSync(filePath, contents);
}

if (!fs.existsSync(runtimeSrcDir)) {
  process.stderr.write(`missing recovered source directory: ${runtimeSrcDir}\n`);
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
