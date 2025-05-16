export { config } from './config.js';
export type { Config } from './types.js';

// Export Linear functionality
export { getLinearClient, setupLinear, getTask, attachPRToTask } from './linear.js';

// Export GitHub functionality
export { getGithubClient, setupGithub, createBranch, createPullRequest as createGithubPR } from './github.js';

// Export PR creation utility
export { createPullRequest } from './pr.js';

// Export utility functions
export {
  validateTaskId,
  createBranchName,
  runGitCommand,
  isGitRepository,
  getCurrentBranch,
  getTaskIdFromBranch,
  createPRTitle
} from './utils.js';