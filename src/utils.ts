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

  // Extract team prefix from taskId (e.g., "TEAM" from "TEAM-123")
  const teamPrefix = taskId.split('-')[0].toLowerCase();
  
  // Format the branch name according to the required format: feature/team-XXXX-description
  return `feature/${teamPrefix}-${taskId.split('-')[1]}-${sanitizedTitle}`;
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
 * Format a string to be a valid PR scope:
 * lowercase, containing only letters, numbers, and hyphens
 */
export function formatScope(input: string): string {
  // Convert to lowercase
  let result = input.toLowerCase();
  
  // Replace any characters that aren't lowercase letters, numbers, or hyphens with hyphens
  result = result.replace(/[^a-z0-9-]/g, '-');
  
  // Remove any duplicate hyphens
  result = result.replace(/-+/g, '-');
  
  // Remove leading or trailing hyphens
  result = result.replace(/^-+|-+$/g, '');
  
  return result;
}

/**
 * Creates a PR title from the given parameters
 */
export function createPRTitle(type: string, module: string, taskId: string, description: string): string {
  // Ensure module follows required format
  const formattedModule = formatScope(module);
  
  // Ensure taskId is uppercase
  const formattedTaskId = taskId.toUpperCase();
  
  return `${type}(${formattedModule}): [${formattedTaskId}] ${description}`;
} 