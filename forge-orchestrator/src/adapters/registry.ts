import { CLIAdapter } from './types.js';
import { claudeAdapter } from './claude.js';
import { geminiAdapter } from './gemini.js';
import { codexAdapter } from './codex.js';

const adapters: Record<string, CLIAdapter> = {
  claude: claudeAdapter,
  gemini: geminiAdapter,
  codex: codexAdapter,
};

export function getAdapter(type: string): CLIAdapter {
  const adapter = adapters[type];
  if (!adapter) throw new Error(`Unknown adapter type: ${type}. Available: ${Object.keys(adapters).join(', ')}`);
  return adapter;
}
