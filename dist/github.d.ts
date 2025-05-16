import { Octokit } from 'octokit';
/**
 * Get or create an Octokit client using stored token
 */
export declare function getGithubClient(): Octokit;
/**
 * Set up GitHub authentication by prompting for personal access token
 */
export declare function setupGithub(): Promise<void>;
/**
 * Create a branch for a Linear task
 */
export declare function createBranch(branchName: string, baseBranch?: string): Promise<void>;
/**
 * Create a GitHub pull request
 */
export declare function createPullRequest(title: string, body: string, branch: string, baseBranch?: string, isDraft?: boolean): Promise<string>;
