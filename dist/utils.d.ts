/**
 * Validates if a string is a valid Linear task ID (e.g., ENG-123)
 */
export declare function validateTaskId(taskId: string): boolean;
/**
 * Extracts a Linear task ID from a Linear branch name format
 * Examples:
 * - feature/team-1234-cool-feature -> team-1234
 * - bugfix/abc-123-fix-something -> ABC-123
 * - team-1234-add-feature -> team-1234
 */
export declare function extractTaskIdFromBranchName(branchName: string): string | null;
/**
 * Creates a sanitized branch name from a task ID and title
 */
export declare function createBranchName(taskId: string, taskTitle: string): string;
/**
 * Execute a git command and return the output
 */
export declare function runGitCommand(command: string): string;
/**
 * Check if we're in a git repository
 */
export declare function isGitRepository(): boolean;
/**
 * Get the current git branch name
 */
export declare function getCurrentBranch(): string;
/**
 * Extracts the Linear task ID from a branch name if present
 */
export declare function getTaskIdFromBranch(branchName: string): string | null;
/**
 * Creates a PR title from the given parameters
 */
export declare function createPRTitle(type: string, module: string, taskId: string, description: string): string;
