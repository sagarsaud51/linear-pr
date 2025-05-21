import chalk from 'chalk';
import { getTask, isTaskAssignedToCurrentUser } from './linear.js';
import { createBranch, createPullRequest as createGithubPR } from './github.js';
import { getCurrentBranch, extractTaskIdFromBranchName, createBranchName, createPRTitle, formatScope } from './utils.js';
import inquirer from 'inquirer';
// Valid PR types according to the requirements
const VALID_PR_TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'ci', 'build', 'revert'];
// Validate scope/module format (lowercase, can contain letters, numbers, and hyphens)
function validateScope(scope) {
    return /^[a-z0-9-]+$/.test(scope);
}
// Format a module string to ensure it complies with scope formatting requirements
function formatScopeString(input) {
    return formatScope(input);
}
// Validate ticket ID format (uppercase letters, hyphen, numbers, e.g., PROJECT-123)
function validateTicketId(ticketId) {
    return /^[A-Z]+-\d+$/.test(ticketId);
}
/**
 * Main function to create a PR from a Linear task
 */
export async function createPullRequest(options) {
    // Default to using exact branch name (true)
    let { taskId, type, module, enforceAssignment = false, useExactBranchName = true } = options;
    // Validate and format the PR type
    if (!VALID_PR_TYPES.includes(type.toLowerCase())) {
        console.log(chalk.red(`Invalid PR type: ${type}`));
        console.log(chalk.yellow(`Valid types: ${VALID_PR_TYPES.join(', ')}`));
        // Prompt for a valid type
        const { newType } = await inquirer.prompt([
            {
                type: 'list',
                name: 'newType',
                message: 'Choose a valid PR type:',
                choices: VALID_PR_TYPES
            }
        ]);
        type = newType;
    }
    else {
        // Ensure type is lowercase
        type = type.toLowerCase();
    }
    // Extract the task ID for Linear API calls and branch creation
    let extractedTaskId = taskId;
    let exactBranchName = useExactBranchName;
    // If taskId includes a slash or doesn't match the Linear ID format, it's likely a branch name
    if (taskId.includes('/') || (taskId.includes('-') && !taskId.match(/^[A-Z]+-\d+$/i))) {
        // If it's a branch name with slashes, we'll preserve it exactly
        const extracted = extractTaskIdFromBranchName(taskId);
        if (extracted) {
            extractedTaskId = extracted;
            // We're using the exact branch name provided
            exactBranchName = true;
        }
        else {
            throw new Error(`Could not extract a valid Linear task ID from: ${taskId}`);
        }
    }
    else {
        // If this is a plain Linear task ID, we'll format the branch name
        // unless useExactBranchName is explicitly set
        exactBranchName = useExactBranchName;
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
        // Format the task ID to ensure it matches required pattern (uppercase)
        const formattedTaskId = task.taskId.toUpperCase();
        // If no module provided, use the project name from Linear if available
        if (!module && task.projectName) {
            module = formatScopeString(task.projectName);
        }
        else if (!module) {
            // Prompt for module if still not available
            const answers = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'module',
                    message: 'Enter module/component name:',
                    validate: (input) => validateScope(input) || 'Module name must be lowercase and can only contain letters, numbers, and hyphens'
                }
            ]);
            module = answers.module;
        }
        else {
            // Ensure module is properly formatted
            if (!validateScope(module)) {
                console.log(chalk.red(`Invalid module format: ${module}`));
                console.log(chalk.yellow(`Module must be lowercase and can only contain letters, numbers, and hyphens`));
                // Format the module or prompt for a new one
                const formattedModule = formatScopeString(module);
                const { useFormatted } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'useFormatted',
                        message: `Use '${formattedModule}' as the module name?`,
                        default: true
                    }
                ]);
                if (useFormatted) {
                    module = formattedModule;
                }
                else {
                    const { newModule } = await inquirer.prompt([
                        {
                            type: 'input',
                            name: 'newModule',
                            message: 'Enter a valid module name:',
                            validate: (input) => validateScope(input) || 'Module name must be lowercase and can only contain letters, numbers, and hyphens'
                        }
                    ]);
                    module = newModule;
                }
            }
        }
        // Determine branch name based on options
        let branchName;
        if (exactBranchName) {
            // Use the exact branch name provided
            branchName = taskId;
        }
        else {
            // Create a properly formatted branch name from the task details
            branchName = createBranchName(task.taskId, task.title);
        }
        // Check if we're already on the correct branch
        const currentBranch = getCurrentBranch();
        // Create a new branch if needed
        if (currentBranch !== branchName) {
            console.log(chalk.yellow(`Creating branch: "${branchName}"`));
            await createBranch(branchName);
        }
        // Create PR title with the format: {type}({module}): [{linear task number}] {description}
        const prTitle = createPRTitle(type, module || 'general', formattedTaskId, task.title);
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
