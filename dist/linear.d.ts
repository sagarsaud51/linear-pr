import { LinearClient } from '@linear/sdk';
/**
 * Get or create a Linear client using stored tokens
 */
export declare function getLinearClient(): Promise<LinearClient>;
/**
 * Set up Linear authentication - supports both API key and OAuth
 */
export declare function setupLinear(): Promise<void>;
/**
 * Get the current authenticated Linear user
 */
export declare function getCurrentUser(): Promise<{
    id: string;
    name: string;
    email: string;
}>;
/**
 * Get Linear task by ID with extended information
 */
export declare function getTask(taskId: string, checkAssignment?: boolean): Promise<{
    id: string;
    taskId: string;
    title: string;
    description: string;
    url: string;
    projectName: string | null;
    isAssigned: boolean;
}>;
/**
 * Check if the current user is assigned to the given task
 */
export declare function isTaskAssignedToCurrentUser(taskId: string): Promise<boolean>;
/**
 * Update a Linear task with a PR link
 */
export declare function attachPRToTask(taskId: string, prUrl: string): Promise<void>;
/**
 * Get all tasks assigned to the current user
 */
export declare function getAssignedTasks(limit?: number): Promise<Array<{
    id: string;
    taskId: string;
    title: string;
    state: string;
    description: string;
    url: string;
    projectName: string | null;
    hasExistingPR: boolean;
    hasPRClosed: boolean;
    prUrl?: string;
}>>;
