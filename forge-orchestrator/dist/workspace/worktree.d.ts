export declare function createWorktree(input: {
    repoDir: string;
    branchName: string;
    baseRef: string;
    worktreeParentDir: string;
}): Promise<string>;
export declare function removeWorktree(repoDir: string, worktreePath: string): Promise<void>;
export declare function listWorktrees(repoDir: string): Promise<string[]>;
//# sourceMappingURL=worktree.d.ts.map