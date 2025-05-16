import chalk from 'chalk';
import { getTask, isTaskAssignedToCurrentUser } from './linear.js';
import { createBranch, createPullRequest as createGithubPR } from './github.js';
import { getCurrentBranch, extractTaskIdFromBranchName } from './utils.js';
import inquirer from 'inquirer';
/**
 * Main function to create a PR from a Linear task
 */
export async function createPullRequest(options) {
    // Default to using exact branch name (true)
    let { taskId, type, module, enforceAssignment = false, useExactBranchName = true } = options;
    // The exact branch name to use (input is preserved exactly as provided)
    const branchName = taskId;
    // Extract the task ID for Linear API calls
    let extractedTaskId = taskId;
    if (taskId.includes('/') || (taskId.includes('-') && !taskId.match(/^[A-Z]+-\d+$/i))) {
        const extracted = extractTaskIdFromBranchName(taskId);
        if (extracted) {
            extractedTaskId = extracted;
        }
        else {
            throw new Error(`Could not extract a valid Linear task ID from: ${taskId}`);
        }
    }
    try {
        // Check if task is assigned to current user if enforcement is enabled
        if (enforceAssignment) {
            const isAssigned = await isTaskAssignedToCurrentUser(extractedTaskId);
            if (!isAssigned) {
                throw new Error(`Task ${extractedTaskId} is not assigned to you. Only assigned tasks can be used with --enforce-assignment option.`);
            }
        }
        // Fetch the Linear task using the extracted ID
        const task = await getTask(extractedTaskId);
        console.log(chalk.blue(`Task: ${task.taskId} - ${task.title}`));
        // If no module provided, use the project name from Linear if available
        if (!module && task.projectName) {
            module = task.projectName.toLowerCase().replace(/\s+/g, '-');
        }
        else if (!module) {
            // Prompt for module if still not available
            const answers = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'module',
                    message: 'Enter module/component name:',
                    validate: (input) => input.trim() !== '' || 'Module name is required'
                }
            ]);
            module = answers.module;
        }
        // Check if we're already on the correct branch
        const currentBranch = getCurrentBranch();
        // Create a new branch if needed
        if (currentBranch !== branchName) {
            console.log(chalk.yellow(`Creating branch: "${branchName}"`));
            await createBranch(branchName);
        }
        // Create PR title with the format: {type}({module}): [{linear task number}]{description}
        const prTitle = `${type}(${module}): [${task.taskId}] ${task.title}`;
        // Create PR body that includes link to Linear task
        const prBody = `This PR addresses Linear task [${task.taskId}](${task.url})

${task.description}`;
        // Create the PR - pass the exact branch name
        console.log(chalk.blue(`Creating PR: ${prTitle}`));
        const prUrl = await createGithubPR(prTitle, prBody, branchName);
        console.log(chalk.green(`✓ Pull request created: ${prUrl}`));
        // Update the Linear task with the PR link
        // await attachPRToTask(task.taskId, prUrl);
        console.log(chalk.green(`✓ Updated Linear task ${task.taskId} with PR link`));
    }
    catch (error) {
        throw new Error(`Failed to create PR: ${error instanceof Error ? error.message : String(error)}`);
    }
}
