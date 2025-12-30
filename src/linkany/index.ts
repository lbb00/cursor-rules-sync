export type { Manifest, InstallEntry, InstallKind } from './manifest/types.js'
export type { Mapping } from './api/add.js'
export type { RemoveOptions } from './api/remove.js'
export type { Result, Step, Logger, CommonOptions, LinkKind } from './types.js'

export { loadManifest } from './manifest/types.js'
export { loadOrCreateManifest, saveManifest, upsertEntry, removeEntry } from './manifest/io.js'

export { add, remove, install, uninstall } from './api/index.js'


