import { execSync } from 'child_process';

/**
 * Validates if a string is a valid Linear task ID (e.g., ENG-123)
 */
export function validateTaskId(taskId: string): boolean {
  return /^[A-Z]+-\d+$/i.test(taskId);
}

/**
 * Extracts a Linear task ID from a Linear branch name format
 * Examples:
 * - feature/team-1234-cool-feature -> team-1234
 * - bugfix/abc-123-fix-something -> ABC-123
 * - team-1234-add-feature -> team-1234
 */
export function extractTaskIdFromBranchName(branchName: string): string | null {
  // First, remove any prefixes like 'feature/' or 'bugfix/'
  const withoutPrefix = branchName.split('/').pop() || branchName;
  
  // Look for a pattern like XYZ-123 anywhere in the branch name
  const match = withoutPrefix.match(/([a-z]+-\d+)/i);
  
  if (match) {
    // Return the match in uppercase (Linear IDs are typically uppercase)
    return match[1].toUpperCase();
  }
  
  return null;
}

/**
 * Creates a sanitized branch name from a task ID and title
 */
export function createBranchName(taskId: string, taskTitle: string): string {
  // Remove special characters, replace spaces with dashes, and convert to lowercase
  const sanitizedTitle = taskTitle
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim();

  return `${taskId.toLowerCase()}-${sanitizedTitle}`;
}

/**
 * Execute a git command and return the output
 */
export function runGitCommand(command: string): string {
  try {
    return execSync(command, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
  } catch (error) {
    throw new Error(`Git command failed: ${command}`);
  }
}

/**
 * Check if we're in a git repository
 */
export function isGitRepository(): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get the current git branch name
 */
export function getCurrentBranch(): string {
  return runGitCommand('git branch --show-current');
}

/**
 * Extracts the Linear task ID from a branch name if present
 */
export function getTaskIdFromBranch(branchName: string): string | null {
  const match = branchName.match(/([A-Z]+-\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Creates a PR title from the given parameters
 */
export function createPRTitle(type: string, module: string, taskId: string, description: string): string {
  return `${type}(${module}): [${taskId}] ${description}`;
} 