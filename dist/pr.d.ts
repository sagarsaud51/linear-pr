interface CreatePROptions {
    taskId: string;
    type: string;
    module?: string;
    enforceAssignment?: boolean;
    useExactBranchName?: boolean;
}
/**
 * Main function to create a PR from a Linear task
 */
export declare function createPullRequest(options: CreatePROptions): Promise<void>;
export {};
