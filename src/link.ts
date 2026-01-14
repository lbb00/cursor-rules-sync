/**
 * Link module - re-exports from sync engine
 *
 * This file exists for backward compatibility.
 * New code should import directly from './sync-engine.js' or use adapters.
 */

export { linkEntry, unlinkEntry, importEntry, ImportOptions } from './sync-engine.js';
