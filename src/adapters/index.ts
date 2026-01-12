import { SyncAdapter, AdapterRegistry } from './types.js';
import { cursorRulesAdapter } from './cursor-rules.js';
import { cursorPlansAdapter } from './cursor-plans.js';
import { copilotInstructionsAdapter } from './copilot-instructions.js';
import { ProjectConfig } from '../project-config.js';

// Re-export types and utilities
export * from './types.js';
export { stripCopilotSuffix, hasCopilotSuffix } from './copilot-instructions.js';
export { createBaseAdapter } from './base.js';

/**
 * Default adapter registry with all built-in adapters
 */
class DefaultAdapterRegistry implements AdapterRegistry {
    private adapters: Map<string, SyncAdapter> = new Map();
    private toolMap: Map<string, SyncAdapter[]> = new Map();

    constructor() {
        // Register built-in adapters
        this.register(cursorRulesAdapter);
        this.register(cursorPlansAdapter);
        this.register(copilotInstructionsAdapter);
    }

    register(adapter: SyncAdapter): void {
        this.adapters.set(adapter.name, adapter);

        const toolAdapters = this.toolMap.get(adapter.tool) || [];
        toolAdapters.push(adapter);
        this.toolMap.set(adapter.tool, toolAdapters);
    }

    get(tool: string, subtype: string): SyncAdapter | undefined {
        return this.adapters.get(`${tool}-${subtype}`);
    }

    getByName(name: string): SyncAdapter | undefined {
        return this.adapters.get(name);
    }

    getForTool(tool: string): SyncAdapter[] {
        return this.toolMap.get(tool) || [];
    }

    getDefaultForTool(tool: string): SyncAdapter | undefined {
        const toolAdapters = this.toolMap.get(tool);
        return toolAdapters?.[0];
    }

    all(): SyncAdapter[] {
        return Array.from(this.adapters.values());
    }
}

/**
 * Global adapter registry instance
 */
export const adapterRegistry = new DefaultAdapterRegistry();

/**
 * Get an adapter by tool and subtype
 */
export function getAdapter(tool: string, subtype: string): SyncAdapter {
    const adapter = adapterRegistry.get(tool, subtype);
    if (!adapter) {
        throw new Error(`No adapter found for ${tool}/${subtype}`);
    }
    return adapter;
}

/**
 * Get the default adapter for a tool
 */
export function getDefaultAdapter(tool: string): SyncAdapter {
    const adapter = adapterRegistry.getDefaultForTool(tool);
    if (!adapter) {
        throw new Error(`No adapters found for tool "${tool}"`);
    }
    return adapter;
}

/**
 * Get all adapters for a tool
 */
export function getToolAdapters(tool: string): SyncAdapter[] {
    return adapterRegistry.getForTool(tool);
}
/**
 * Find adapter by checking which config section contains the alias
 */
export function findAdapterForAlias(
    cfg: ProjectConfig,
    alias: string
): { adapter: SyncAdapter; section: string } | null {
    if (cfg.cursor?.rules?.[alias]) {
        return { adapter: cursorRulesAdapter, section: 'cursor.rules' };
    }
    if (cfg.cursor?.plans?.[alias]) {
        return { adapter: cursorPlansAdapter, section: 'cursor.plans' };
    }
    if (cfg.copilot?.instructions?.[alias]) {
        return { adapter: copilotInstructionsAdapter, section: 'copilot.instructions' };
    }
    return null;
}
