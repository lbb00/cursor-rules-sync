import { RepoConfig } from '../config.js';

/**
 * SyncAdapter defines how a specific type of AI tool configuration
 * should be synchronized from a rules repository to a project.
 */
export interface SyncAdapter {
    /** Unique identifier for this adapter, e.g. "cursor-rules" */
    name: string;

    /** Tool name, e.g. "cursor", "copilot" */
    tool: string;

    /** Subtype under the tool, e.g. "rules", "plans", "instructions" */
    subtype: string;

    /** Config key path, e.g. ['cursor', 'rules'] or ['copilot', 'instructions'] */
    configPath: [string, string];

    /** Default source directory in rules repo, e.g. ".cursor/rules", ".cursor/plans", ".github/instructions" */
    defaultSourceDir: string;

    /** Target directory in project (relative to project root), e.g. ".cursor/rules" */
    targetDir: string;

    /** Sync mode: 'directory' for linking folders, 'file' for linking individual files */
    mode: 'directory' | 'file';

    /** For file mode: valid file suffixes to match, e.g. ['.instructions.md', '.md'] */
    fileSuffixes?: string[];

    /**
     * Optional hook to resolve the actual source path.
     * Default behavior: join(repoDir, rootPath, name)
     * For file mode with suffixes, this handles suffix resolution.
     */
    resolveSource?(
        repoDir: string,
        rootPath: string,
        name: string
    ): Promise<ResolvedSource>;

    /**
     * Optional hook to resolve the target name (filename or directory name).
     * Default behavior: use alias if provided, otherwise use name.
     */
    resolveTargetName?(name: string, alias?: string, sourceSuffix?: string): string;

    /** Add a dependency to project config */
    addDependency(
        projectPath: string,
        name: string,
        repoUrl: string,
        alias?: string,
        isLocal?: boolean
    ): Promise<{ migrated: boolean }>;

    /** Remove a dependency from project config */
    removeDependency(
        projectPath: string,
        alias: string
    ): Promise<{ removedFrom: string[]; migrated: boolean }>;

    /** Link entry from repo to project (filesystem) */
    link(options: SyncOptions): Promise<LinkResult>;

    /** Unlink entry from project (filesystem) */
    unlink(projectPath: string, alias: string): Promise<void>;
}

/**
 * Result of resolving a source path
 */
export interface ResolvedSource {
    /** Resolved source name (may include suffix) */
    sourceName: string;

    /** Full path to the source file/directory */
    sourcePath: string;

    /** Detected suffix (for file mode) */
    suffix?: string;
}

/**
 * Result of a link operation
 */
export interface LinkResult {
    /** The resolved source name */
    sourceName: string;

    /** The target name in the project */
    targetName: string;

    /** Whether the link was created (false if skipped due to existing non-symlink) */
    linked: boolean;
}

/**
 * Options for link/unlink operations
 */
export interface SyncOptions {
    /** Project root path */
    projectPath: string;

    /** Name of the rule/instruction/plan in the rules repo */
    name: string;

    /** Repository configuration */
    repo: RepoConfig;

    /** Optional alias for the target */
    alias?: string;

    /** Whether this is a local/private entry (uses .git/info/exclude instead of .gitignore) */
    isLocal?: boolean;
}

/**
 * Registry of all available adapters
 */
export interface AdapterRegistry {
    /** Get adapter by tool and subtype, e.g. ("cursor", "rules") */
    get(tool: string, subtype: string): SyncAdapter | undefined;

    /** Get adapter by name, e.g. "cursor-rules" */
    getByName(name: string): SyncAdapter | undefined;

    /** Get all adapters for a tool, e.g. all adapters for "cursor" */
    getForTool(tool: string): SyncAdapter[];

    /** Get the default adapter for a tool (first subtype) */
    getDefaultForTool(tool: string): SyncAdapter | undefined;

    /** List all registered adapters */
    all(): SyncAdapter[];

    /** Register a new adapter */
    register(adapter: SyncAdapter): void;
}
