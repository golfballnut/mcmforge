import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { logger } from '../utils/logger.js';
const exec = promisify(execFile);
export async function createWorktree(input) {
    const worktreePath = path.join(input.worktreeParentDir, input.branchName);
    // Fetch latest
    await exec('git', ['-C', input.repoDir, 'fetch', 'origin', input.baseRef], { timeout: 60_000 });
    // Create worktree with new branch
    await exec('git', [
        '-C', input.repoDir,
        'worktree', 'add',
        '-b', input.branchName,
        worktreePath,
        `origin/${input.baseRef}`,
    ], { timeout: 60_000 });
    logger.info({ worktreePath, branchName: input.branchName }, 'Created git worktree');
    return worktreePath;
}
export async function removeWorktree(repoDir, worktreePath) {
    await exec('git', ['-C', repoDir, 'worktree', 'remove', '--force', worktreePath], {
        timeout: 30_000,
    }).catch((err) => {
        logger.warn({ err, worktreePath }, 'Failed to remove worktree');
    });
}
export async function listWorktrees(repoDir) {
    const { stdout } = await exec('git', ['-C', repoDir, 'worktree', 'list', '--porcelain'], {
        timeout: 10_000,
    });
    return stdout.split('\n')
        .filter(line => line.startsWith('worktree '))
        .map(line => line.replace('worktree ', ''));
}
//# sourceMappingURL=worktree.js.map