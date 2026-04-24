import { claudeAdapter } from './claude.js';
import { geminiAdapter } from './gemini.js';
import { codexAdapter } from './codex.js';
const adapters = {
    claude: claudeAdapter,
    gemini: geminiAdapter,
    codex: codexAdapter,
};
export function getAdapter(type) {
    const adapter = adapters[type];
    if (!adapter)
        throw new Error(`Unknown adapter type: ${type}. Available: ${Object.keys(adapters).join(', ')}`);
    return adapter;
}
//# sourceMappingURL=registry.js.map