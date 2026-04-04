import { CLIAdapter } from './types.js';
import { claudeAdapter } from './claude.js';

const adapters: Record<string, CLIAdapter> = {
  claude: claudeAdapter,
};

export function getAdapter(type: string): CLIAdapter {
  const adapter = adapters[type];
  if (!adapter) throw new Error(`Unknown adapter type: ${type}. Available: ${Object.keys(adapters).join(', ')}`);
  return adapter;
}
