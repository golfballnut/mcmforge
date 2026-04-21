import { describe, it, expect, vi, beforeEach } from 'vitest';
import { claudeAdapter } from '../adapters/claude.js';
import { codexAdapter } from '../adapters/codex.js';
import { geminiAdapter } from '../adapters/gemini.js';
import { getAdapter } from '../adapters/registry.js';

// Mock child-process so adapters don't actually spawn CLIs
vi.mock('../utils/child-process.js', () => ({
  runChildProcess: vi.fn().mockResolvedValue({
    stdout: '',
    stderr: '',
    exitCode: 0,
    signal: null,
    timedOut: false,
  }),
}));

vi.mock('../utils/template.js', () => ({
  renderTemplate: (_tpl: string, _ctx: unknown) => 'rendered-prompt',
}));

import { runChildProcess } from '../utils/child-process.js';

const baseInput = {
  runId: 'run-1',
  agent: { id: 'agent-1', companyId: 'company-1', name: 'Test Agent', adapter_config: {} },
  config: {},
  promptTemplate: null,
  bootstrapPrompt: null,
  instructionsFile: null,
  skills: [],
  sessionId: null,
  sessionParams: null,
  context: {},
  cwd: '/tmp',
  agentHome: '/tmp/agent-home',
  signal: new AbortController().signal,
  onLog: vi.fn(),
  onSpawn: vi.fn().mockResolvedValue(undefined),
};

describe('adapter registry', () => {
  it('returns claude adapter for type=claude', () => {
    expect(getAdapter('claude').type).toBe('claude');
  });

  it('returns codex adapter for type=codex', () => {
    expect(getAdapter('codex').type).toBe('codex');
  });

  it('returns gemini adapter for type=gemini', () => {
    expect(getAdapter('gemini').type).toBe('gemini');
  });

  it('throws for unknown adapter type', () => {
    expect(() => getAdapter('unknown-llm')).toThrow(/Unknown adapter type/);
  });
});

describe('claudeAdapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes cliFlags to the spawned command', async () => {
    await claudeAdapter.execute({
      ...baseInput,
      config: { cliFlags: ['--disallowed-tools', 'Bash'] },
    });
    const [call] = (runChildProcess as ReturnType<typeof vi.fn>).mock.calls;
    expect(call[0].args).toContain('--disallowed-tools');
    expect(call[0].args).toContain('Bash');
  });

  it('does not add cliFlags when config.cliFlags is absent', async () => {
    await claudeAdapter.execute({ ...baseInput, config: {} });
    const [call] = (runChildProcess as ReturnType<typeof vi.fn>).mock.calls;
    // Should still have core args like --print and --output-format
    expect(call[0].args).toContain('--print');
    expect(call[0].args).not.toContain('--disallowed-tools');
  });

  it('uses --resume when sessionId is present', async () => {
    await claudeAdapter.execute({ ...baseInput, sessionId: 'sess-abc' });
    const [call] = (runChildProcess as ReturnType<typeof vi.fn>).mock.calls;
    expect(call[0].args).toContain('--resume');
    expect(call[0].args).toContain('sess-abc');
  });
});

describe('codexAdapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses --full-auto when sandboxMode is not set', async () => {
    await codexAdapter.execute({ ...baseInput, config: {} });
    const [call] = (runChildProcess as ReturnType<typeof vi.fn>).mock.calls;
    expect(call[0].args).toContain('--full-auto');
    expect(call[0].args).not.toContain('--sandbox');
  });

  it('uses --sandbox workspace-write when sandboxMode=workspace-write', async () => {
    await codexAdapter.execute({
      ...baseInput,
      config: { sandboxMode: 'workspace-write' },
    });
    const [call] = (runChildProcess as ReturnType<typeof vi.fn>).mock.calls;
    expect(call[0].args).toContain('--sandbox');
    expect(call[0].args).toContain('workspace-write');
    expect(call[0].args).not.toContain('--full-auto');
  });

  it('passes cliFlags to the spawned command', async () => {
    await codexAdapter.execute({
      ...baseInput,
      config: { cliFlags: ['--timeout', '30'] },
    });
    const [call] = (runChildProcess as ReturnType<typeof vi.fn>).mock.calls;
    expect(call[0].args).toContain('--timeout');
    expect(call[0].args).toContain('30');
  });

  it('appends prompt as the last positional argument', async () => {
    await codexAdapter.execute({ ...baseInput, config: {} });
    const [call] = (runChildProcess as ReturnType<typeof vi.fn>).mock.calls;
    const args: string[] = call[0].args;
    expect(args[args.length - 1]).toBe('rendered-prompt');
  });
});

describe('geminiAdapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes -p and --yolo flags by default', async () => {
    await geminiAdapter.execute({ ...baseInput, config: {} });
    const [call] = (runChildProcess as ReturnType<typeof vi.fn>).mock.calls;
    expect(call[0].args).toContain('-p');
    expect(call[0].args).toContain('--yolo');
  });

  it('passes cliFlags to the spawned command', async () => {
    await geminiAdapter.execute({
      ...baseInput,
      config: { cliFlags: ['--approval-mode', 'plan'] },
    });
    const [call] = (runChildProcess as ReturnType<typeof vi.fn>).mock.calls;
    expect(call[0].args).toContain('--approval-mode');
    expect(call[0].args).toContain('plan');
  });

  it('sets provider=google in result', async () => {
    const result = await geminiAdapter.execute({ ...baseInput, config: {} });
    expect(result.provider).toBe('google');
  });
});
