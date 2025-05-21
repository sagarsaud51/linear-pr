#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { config } from './config.js';
import { setupLinear, getAssignedTasks } from './linear.js';
import { setupGithub } from './github.js';
import { createPullRequest } from './pr.js';
import { validateTaskId, extractTaskIdFromBranchName } from './utils.js';
import { LinearClient } from '@linear/sdk';
import { Octokit } from 'octokit';

// Configuration constants
const OAUTH_PORT = 45678;

/**
 * Set up Linear with a provided API key
 */
async function setupLinearWithKey(apiKey: string): Promise<void> {
  try {
    // Verify the key works
    const client = new LinearClient({ apiKey });
    const viewer = await client.viewer;
    console.log(chalk.green(`✅ Connected to Linear as ${viewer.name}`));
    
    // Save the token and mark it as an API key
    config.set('linearAccessToken', apiKey);
    config.set('isApiKey', true);
  } catch (error) {
    console.error(chalk.red('Error connecting to Linear with provided API key:'), 
      error instanceof Error ? error.message : 'Invalid token');
    throw new Error('Failed to connect to Linear with provided API key');
  }
}

/**
 * Set up GitHub with a provided token
 */
async function setupGithubWithToken(token: string): Promise<void> {
  try {
    // Verify the token works
    const octokit = new Octokit({ auth: token });
    const { data: user } = await octokit.rest.users.getAuthenticated();
    console.log(chalk.green(`✅ Connected to GitHub as ${user.login}`));
    
    // Save the token
    config.set('githubToken', token);
    config.set('githubUsername', user.login);
    
    // Set default branch to development
    config.set('defaultBranch', 'development');
    console.log(chalk.green(`Default base branch set to development`));
    
    // Note: We're skipping the repository detection step here
    // If needed, user can run `linear-pr setup` interactively to set repo
  } catch (error) {
    console.error(chalk.red('Error connecting to GitHub with provided token:'), 
      error instanceof Error ? error.message : 'Invalid token');
    throw new Error('Failed to connect to GitHub with provided token');
  }
}

const program = new Command();

program
  .name('linear-pr')
  .description('Create GitHub PRs from Linear tasks')
  .version('1.0.0');

program
  .command('setup')
  .description('Configure Linear and GitHub credentials')
  .option('--linear-api-key <key>', 'Linear API key (skips interactive prompt)')
  .option('--github-token <token>', 'GitHub personal access token (skips interactive prompt)')
  .action(async (options) => {
    try {
      // If API keys are provided as arguments, use them directly
      if (options.linearApiKey || options.githubToken) {
        console.log(chalk.blue('Setting up with provided credentials'));
        
        // Setup Linear with API key if provided
        if (options.linearApiKey) {
          await setupLinearWithKey(options.linearApiKey);
        } else {
          console.log(chalk.yellow('No Linear API key provided. Run the command again with --linear-api-key or run linear-pr setup without arguments for interactive setup.'));
        }
        
        // Setup GitHub with token if provided
        if (options.githubToken) {
          await setupGithubWithToken(options.githubToken);
        } else {
          console.log(chalk.yellow('No GitHub token provided. Run the command again with --github-token or run linear-pr setup without arguments for interactive setup.'));
        }
        
        if (options.linearApiKey || options.githubToken) {
          console.log(chalk.green('✅ Setup completed with provided credentials!'));
        }
      } else {
        // Interactive setup if no arguments provided
        await setupLinear();
        await setupGithub();
        console.log(chalk.green('✅ Setup complete!'));
      }
    } catch (error) {
      console.error(chalk.red('Error during setup:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('config-oauth')
  .description('Configure Linear OAuth credentials')
  .option('--client-id <id>', 'Linear OAuth client ID')
  .option('--client-secret <secret>', 'Linear OAuth client secret')
  .action(async (options) => {
    try {
      // If client ID and secret are provided as arguments, use them directly
      if (options.clientId && options.clientSecret) {
        console.log(chalk.blue('Setting up Linear OAuth with provided credentials'));
        
        config.set('linearOAuthClientId', options.clientId);
        config.set('linearOAuthClientSecret', options.clientSecret);
        
        console.log(chalk.green('✅ Linear OAuth credentials configured!'));
        console.log(chalk.yellow('Now run `linear-pr setup` to complete authentication.'));
      } else {
        // Interactive setup if no arguments provided
        console.log(chalk.blue('Setting up Linear OAuth credentials'));
        console.log(chalk.yellow('You need to create an OAuth application in Linear:'));
        console.log('1. Go to your workspace settings');
        console.log('2. Select "API" from the menu');
        console.log('3. Create a new OAuth application');
        console.log(`4. Set the redirect URL to: http://localhost:${OAUTH_PORT}/callback\n`);
    
        const { clientId, clientSecret } = await inquirer.prompt([
          {
            type: 'input',
            name: 'clientId',
            message: 'Enter your OAuth Client ID:',
            validate: (input) => !!input || 'Client ID is required'
          },
          {
            type: 'password',
            name: 'clientSecret',
            message: 'Enter your OAuth Client Secret:',
            validate: (input) => !!input || 'Client Secret is required'
          }
        ]);
    
        config.set('linearOAuthClientId', clientId);
        config.set('linearOAuthClientSecret', clientSecret);
    
        console.log(chalk.green('✅ Linear OAuth credentials configured!'));
        console.log(chalk.yellow('Now run `linear-pr setup` to complete authentication.'));
      }
    } catch (error) {
      console.error(chalk.red('Error configuring OAuth:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Display and let the user select from assigned tasks
 */
async function selectFromAssignedTasks() {
  // Show loading spinner
  const spinner = ora('Fetching your assigned tasks...').start();
  
  try {
    // Get assigned tasks
    const tasks = await getAssignedTasks();
    spinner.succeed(chalk.green(`Found ${tasks.length} assigned tasks`));
    
    if (tasks.length === 0) {
      console.log(chalk.yellow('No active tasks assigned to you.'));
      process.exit(0);
    }
    
    // First, ask if the user wants to filter the tasks
    const { searchTerm } = await inquirer.prompt([
      {
        type: 'input',
        name: 'searchTerm',
        message: 'Search for a task (leave empty to show all):',
      }
    ]);
    
    // Filter tasks based on search term if provided
    let filteredTasks = tasks;
    if (searchTerm && searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      filteredTasks = tasks.filter(task => 
        task.taskId.toLowerCase().includes(term) || 
        task.title.toLowerCase().includes(term)
      );
      
      if (filteredTasks.length === 0) {
        console.log(chalk.yellow(`No tasks found matching "${searchTerm}". Showing all tasks.`));
        filteredTasks = tasks;
      } else {
        console.log(chalk.green(`Found ${filteredTasks.length} tasks matching "${searchTerm}"`));
      }
    }
    
    // Ask how to sort the tasks
    const { sortBy } = await inquirer.prompt([
      {
        type: 'list',
        name: 'sortBy',
        message: 'Sort tasks by:',
        choices: [
          { name: 'Task ID', value: 'taskId' },
          { name: 'State', value: 'state' },
          { name: 'Project', value: 'project' }
        ],
        default: 'taskId'
      }
    ]);
    
    // Sort the tasks based on user selection
    filteredTasks.sort((a, b) => {
      if (sortBy === 'taskId') {
        return a.taskId.localeCompare(b.taskId);
      } else if (sortBy === 'state') {
        return a.state.localeCompare(b.state) || a.taskId.localeCompare(b.taskId);
      } else if (sortBy === 'project') {
        const projectA = a.projectName || 'zzzNoProject';
        const projectB = b.projectName || 'zzzNoProject';
        return projectA.localeCompare(projectB) || a.taskId.localeCompare(b.taskId);
      }
      return 0;
    });
    
    // Prepare the choices for display
    const taskChoices = filteredTasks.map(task => {
      // Create a formatted choice with status indicator
      let prStatus = '';
      if (task.hasExistingPR) {
        if (task.hasPRClosed) {
          prStatus = chalk.red(' (PR Closed)');
        } else {
          prStatus = chalk.green(' (PR Open)');
        }
      }
      
      const state = chalk.blue(` [${task.state}]`);
      const projectInfo = task.projectName ? chalk.gray(` (${task.projectName})`) : '';
      
      return {
        name: `${task.taskId}: ${task.title}${prStatus}${state}${projectInfo}`,
        value: task.taskId,
        // Add a disabled property to prevent selecting tasks with closed PRs
        disabled: task.hasPRClosed ? 'This task already has a closed PR' : false
      };
    });
    
    // Prompt user to select a task
    const { selectedTaskId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedTaskId',
        message: 'Select a task to create a PR for:',
        choices: taskChoices,
        pageSize: 15,
        loop: false
      }
    ]);
    
    // Find the selected task
    const selectedTask = filteredTasks.find(task => task.taskId === selectedTaskId);
    
    // Warn if task already has an open PR
    if (selectedTask && selectedTask.hasExistingPR && !selectedTask.hasPRClosed) {
      const { confirmCreate } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmCreate',
          message: `This task already has an open PR${selectedTask.prUrl ? ` (${selectedTask.prUrl})` : ''}. Create another one?`,
          default: false
        }
      ]);
      
      if (!confirmCreate) {
        console.log(chalk.yellow('Operation canceled.'));
        process.exit(0);
      }
    }
    
    // The UI should prevent selecting tasks with closed PRs,
    // but just in case, we'll check again here
    if (selectedTask && selectedTask.hasPRClosed) {
      console.log(chalk.red(`Task ${selectedTaskId} already has a closed PR. Cannot create a new one.`));
      process.exit(1);
    }
    
    return selectedTaskId;
  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch tasks'));
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

program
  .command('create')
  .description('Create a PR from a Linear task or branch name')
  .argument('[taskIdOrBranch]', 'Linear task ID (e.g., ENG-123) or branch name (e.g., feature/eng-123-add-feature)')
  .option('-t, --type <type>', 'PR type (feat, fix, chore, etc.)', 'feat')
  .option('-m, --module <module>', 'Module/component being changed')
  .option('-a, --enforce-assignment', 'Only allow creating PRs for tasks assigned to you', false)
  .option('-e, --exact-branch', 'Use the exact branch name or task ID as provided instead of generating a formatted branch name', false)
  .option('-v, --verbose', 'Show verbose output', false)
  .action(async (taskIdOrBranch, options) => {
    try {
      // If no taskId provided, show task selection
      if (!taskIdOrBranch) {
        taskIdOrBranch = await selectFromAssignedTasks();
      }

      const spinner = ora('Creating pull request...').start();

      await createPullRequest({
        taskId: taskIdOrBranch,
        type: options.type,
        module: options.module,
        enforceAssignment: options.enforceAssignment,
        useExactBranchName: options.exactBranch
      });

      spinner.succeed(chalk.green('Pull request created successfully!'));
    } catch (error) {
      console.error(chalk.red('Error creating PR:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();
