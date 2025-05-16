import { Octokit } from 'octokit';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { config } from './config.js';
import { isGitRepository, runGitCommand } from './utils.js';
import fs from 'fs';
import path from 'path';

/**
 * Get or create an Octokit client using stored token
 */
export function getGithubClient(): Octokit {
  const token = config.get('githubToken');
  
  if (!token) {
    throw new Error('GitHub is not set up. Run `linear-pr setup` first.');
  }
  
  return new Octokit({ auth: token });
}

/**
 * Set up GitHub authentication by prompting for personal access token
 */
export async function setupGithub(): Promise<void> {
  console.log(chalk.blue('Setting up GitHub integration'));
  console.log(chalk.yellow('To create a GitHub personal access token:'));
  console.log('1. Go to https://github.com/settings/tokens');
  console.log('2. Click "Generate new token" (classic)');
  console.log('3. Select at least the "repo" scope');
  console.log('4. Create and copy your token\n');
  
  const { token } = await inquirer.prompt([
    {
      type: 'password',
      name: 'token',
      message: 'Enter your GitHub personal access token:',
      validate: (input) => !!input || 'Token is required'
    }
  ]);
  
  // Verify the token works
  try {
    const octokit = new Octokit({ auth: token });
    const { data: user } = await octokit.rest.users.getAuthenticated();
    console.log(chalk.green(`✅ Connected to GitHub as ${user.login}`));
    
    // Save the token
    config.set('githubToken', token);
    config.set('githubUsername', user.login);
    
    // If we're in a git repo, try to get the default repository
    if (isGitRepository()) {
      try {
        const remoteUrl = runGitCommand('git remote get-url origin');
        const repoMatch = remoteUrl.match(/github\.com[/:]([\w-]+)\/([\w-]+)(?:\.git)?$/i);
        
        if (repoMatch) {
          const [, owner, repo] = repoMatch;
          const repoPath = `${owner}/${repo}`;
          
          const { confirmRepo } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmRepo',
              message: `Use "${repoPath}" as the default GitHub repository?`,
              default: true
            }
          ]);
          
          if (confirmRepo) {
            config.set('githubRepo', repoPath);
            console.log(chalk.green(`Default GitHub repository set to ${repoPath}`));
          } else {
            await promptForRepository();
          }
        } else {
          await promptForRepository();
        }
      } catch (error) {
        await promptForRepository();
      }
    } else {
      await promptForRepository();
    }
    
    // Set default branch to development
    config.set('defaultBranch', 'development');
    console.log(chalk.green(`Default base branch set to development`));
  } catch (error) {
    console.error(chalk.red('Error connecting to GitHub:'), 
      error instanceof Error ? error.message : 'Invalid token');
    throw new Error('Failed to connect to GitHub');
  }
}

/**
 * Prompt the user to enter a GitHub repository
 */
async function promptForRepository(): Promise<void> {
  const { repoPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'repoPath',
      message: 'Enter your GitHub repository (owner/repo):',
      validate: (input) => {
        return /^[\w-]+\/[\w-]+$/.test(input) || 'Please enter a valid repository path (owner/repo)';
      }
    }
  ]);
  
  config.set('githubRepo', repoPath);
  console.log(chalk.green(`Default GitHub repository set to ${repoPath}`));
}

/**
 * Check if a branch exists locally
 */
function branchExistsLocally(branchName: string): boolean {
  try {
    const branches = runGitCommand('git branch --list').split('\n').map(b => b.trim().replace(/^\*\s+/, ''));
    return branches.includes(branchName);
  } catch (error) {
    return false;
  }
}

/**
 * Check if a branch exists on the remote
 */
function branchExistsOnRemote(branchName: string): boolean {
  try {
    runGitCommand('git fetch');
    const remoteBranches = runGitCommand('git branch -r').split('\n').map(b => b.trim().replace(/^origin\//, ''));
    return remoteBranches.includes(branchName);
  } catch (error) {
    return false;
  }
}

/**
 * Create a sample commit if there are no changes yet
 */
async function createSampleCommitIfNeeded(taskId: string, description: string): Promise<void> {
  try {
    // Check if there are any commits on this branch that aren't on the base branch
    try {
      const commitDiff = runGitCommand('git rev-list HEAD ^origin/development --count');
      // If we have commits already, no need to create more
      if (parseInt(commitDiff.trim(), 10) > 0) {
        return;
      }
    } catch (error) {
      // If the command fails, continue with creating a commit
    }

    // Create an empty commit with --allow-empty
    runGitCommand(`git commit --allow-empty -m "chore: Draft PR for ${taskId}"`);
  } catch (error) {
    console.warn(chalk.yellow(`Error creating empty commit: ${error instanceof Error ? error.message : String(error)}`));
  }
}

/**
 * Create a branch for a Linear task
 */
export async function createBranch(branchName: string, baseBranch: string = config.get('defaultBranch') || 'development'): Promise<void> {
  if (!isGitRepository()) {
    throw new Error('Not in a git repository');
  }
  
  try {
    // Check if the branch already exists locally or remotely
    if (branchExistsLocally(branchName)) {
      console.log(chalk.yellow(`Branch "${branchName}" already exists locally.`));
      runGitCommand(`git checkout "${branchName}"`);
      return;
    }
    
    if (branchExistsOnRemote(branchName)) {
      console.log(chalk.yellow(`Branch "${branchName}" exists on remote.`));
      runGitCommand(`git checkout -b "${branchName}" "origin/${branchName}"`);
      return;
    }
    
    // Always update the base branch to the latest version
    try {
      // Fetch the latest from the default branch
      runGitCommand(`git fetch origin ${baseBranch}`);
      
      // Make sure we have a local copy of the base branch
      if (!branchExistsLocally(baseBranch)) {
        runGitCommand(`git branch ${baseBranch} origin/${baseBranch}`);
      } else {
        // If the local base branch exists, update it to match remote
        const currentBranch = runGitCommand('git branch --show-current');
        if (currentBranch === baseBranch) {
          runGitCommand('git pull origin');
        } else {
          runGitCommand(`git fetch origin ${baseBranch}:${baseBranch}`);
        }
      }
      
      // Create and checkout the new branch from the updated base branch
      runGitCommand(`git checkout -b "${branchName}" origin/${baseBranch}`);
    } catch (error) {
      // Try alternative branch creation methods
      try {
        // Try from origin/baseBranch directly
        runGitCommand(`git checkout -b "${branchName}" origin/${baseBranch}`);
      } catch (originError) {
        try {
          // Try from local baseBranch
          runGitCommand(`git checkout -b "${branchName}" ${baseBranch}`);
        } catch (localError) {
          // Last resort: create from current HEAD
          runGitCommand(`git checkout -b "${branchName}"`);
        }
      }
    }
  } catch (error) {
    throw new Error(`Failed to create branch: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create a GitHub pull request
 */
export async function createPullRequest(
  title: string,
  body: string,
  branch: string,
  baseBranch: string = config.get('defaultBranch') || 'development',
  isDraft: boolean = true
): Promise<string> {
  const octokit = getGithubClient();
  const repoPath = config.get('githubRepo');
  
  if (!repoPath) {
    throw new Error('GitHub repository not configured. Run `linear-pr setup` first.');
  }
  
  const [owner, repo] = repoPath.split('/');
  
  try {
    // Extract task ID from PR title
    const taskIdMatch = title.match(/\[([\w-]+)\]/);
    const taskId = taskIdMatch ? taskIdMatch[1] : 'TASK';
    const taskDescription = title.replace(/^\w+\([^)]+\): \[[^\]]+\]\s*/, '');
    
    // Create a sample commit if needed
    await createSampleCommitIfNeeded(taskId, taskDescription);
    
    // Push the branch to remote before creating PR
    try {
      console.log(chalk.blue(`Pushing branch "${branch}" to remote...`));
      runGitCommand(`git push -u origin "${branch}"`);
    } catch (error) {
      console.warn(chalk.yellow(`Failed to push branch. Attempting to create PR anyway.`));
    }
    
    // Make a direct call to get repository info to determine the default branch
    try {
      const { data: repoInfo } = await octokit.rest.repos.get({
        owner,
        repo
      });
      
      // For forks, the head needs to refer to the fork owner, not the upstream owner
      const headUser = repoInfo.fork ? repoInfo.owner.login : owner;
      
      // Format the head parameter properly - for forks we need to use the fork owner's username
      const headReference = `${headUser}:${branch}`;
      
      // Make one last attempt with raw approach
      if (branch.includes('/')) {
        // Direct API call to create the PR
        const { data: pullRequest } = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
          owner,
          repo,
          head: headReference,
          base: baseBranch,
          title,
          body,
          draft: isDraft
        });
        
        return pullRequest.html_url;
      }
      
      // Standard PR creation
      const { data: pullRequest } = await octokit.rest.pulls.create({
        owner,
        repo,
        title,
        body,
        head: headReference,
        base: baseBranch,
        draft: isDraft
      });
      
      return pullRequest.html_url;
    } catch (repoError) {
      // Fallback to simple approach
      const { data: pullRequest } = await octokit.rest.pulls.create({
        owner,
        repo,
        title,
        body,
        head: branch, // Use just the branch name in last resort
        base: baseBranch,
        draft: isDraft
      });
      
      return pullRequest.html_url;
    }
  } catch (error) {
    if (error instanceof Error) {
      // If the error message contains JSON, try to extract more details
      const jsonMatch = error.message.match(/{.*}/);
      if (jsonMatch) {
        try {
          const errorDetails = JSON.parse(jsonMatch[0]);
          throw new Error(`Failed to create pull request: ${JSON.stringify(errorDetails, null, 2)}`);
        } catch (parseError) {
          // If JSON parsing fails, just use the original error
          throw new Error(`Failed to create pull request: ${error.message}`);
        }
      }
      
      // Otherwise, just use the original error message
      throw new Error(`Failed to create pull request: ${error.message}`);
    }
    
    throw new Error(`Failed to create pull request: ${String(error)}`);
  }
} 