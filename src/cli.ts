#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { config } from './config.js';
import { setupLinear } from './linear.js';
import { setupGithub } from './github.js';
import { createPullRequest } from './pr.js';
import { validateTaskId, extractTaskIdFromBranchName } from './utils.js';

// Configuration constants
const OAUTH_PORT = 45678;

const program = new Command();

program
  .name('linear-pr')
  .description('Create GitHub PRs from Linear tasks')
  .version('1.0.0');

program
  .command('setup')
  .description('Configure Linear and GitHub credentials')
  .action(async () => {
    await setupLinear();
    await setupGithub();
    console.log(chalk.green('✅ Setup complete!'));
  });

program
  .command('config-oauth')
  .description('Configure Linear OAuth credentials')
  .action(async () => {
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
  });

program
  .command('create')
  .description('Create a PR from a Linear task or branch name')
  .argument('[taskIdOrBranch]', 'Linear task ID (e.g., ENG-123) or branch name (e.g., feature/eng-123-add-feature)')
  .option('-t, --type <type>', 'PR type (feat, fix, chore, etc.)', 'feat')
  .option('-m, --module <module>', 'Module/component being changed')
  .option('-a, --enforce-assignment', 'Only allow creating PRs for tasks assigned to you', false)
  .option('-e, --exact-branch', 'Use the exact branch name provided instead of generating one', false)
  .option('-v, --verbose', 'Show verbose output', false)
  .action(async (taskIdOrBranch, options) => {
    try {
      // If no taskId provided, prompt for it
      if (!taskIdOrBranch) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'taskIdOrBranch',
            message: 'Enter Linear task ID or branch name:',
            validate: (input) => {
              if (input.includes('/') || input.includes('-')) {
                // Try to extract a task ID if it's a branch format
                const extractedId = extractTaskIdFromBranchName(input);
                return !!extractedId || 'Could not extract a valid Linear task ID from this branch name';
              }
              return validateTaskId(input) || 'Invalid task ID format. Expected format like ENG-123';
            }
          }
        ]);
        taskIdOrBranch = answers.taskIdOrBranch;
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
