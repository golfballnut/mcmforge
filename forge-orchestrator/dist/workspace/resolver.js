import { createWorktree } from './worktree.js';
import { logger } from '../utils/logger.js';
export async function resolveWorkspace(supabase, config, agent, run) {
    // 1. Check if agent has a cwd in adapter_config
    const agentCwd = agent.adapter_config?.cwd;
    if (agentCwd) {
        return { cwd: agentCwd, strategy: 'project_primary' };
    }
    // 2. Check if run has a project context
    const projectId = run.context_snapshot?.projectId;
    if (projectId) {
        const { data: project } = await supabase
            .from('projects')
            .select('workspace_dir, repo_url, repo_branch')
            .eq('id', projectId)
            .single();
        if (project?.workspace_dir) {
            // Check if we should use a worktree
            const issueId = run.context_snapshot?.issueId;
            if (issueId) {
                // Check execution_workspaces for existing worktree
                const { data: existing } = await supabase
                    .from('execution_workspaces')
                    .select('cwd, worktree_path')
                    .eq('issue_id', issueId)
                    .eq('status', 'active')
                    .single();
                if (existing?.cwd) {
                    return { cwd: existing.cwd, worktreePath: existing.worktree_path || undefined, strategy: 'git_worktree' };
                }
                // Create new worktree for this issue
                try {
                    const branchName = `forge/${agent.name.toLowerCase().replace(/\s+/g, '-')}/${issueId.slice(0, 8)}`;
                    const worktreePath = await createWorktree({
                        repoDir: project.workspace_dir,
                        branchName,
                        baseRef: project.repo_branch || 'main',
                        worktreeParentDir: config.worktreeParentDir,
                    });
                    // Record in execution_workspaces
                    await supabase.from('execution_workspaces').insert({
                        company_id: agent.company_id,
                        project_id: projectId,
                        issue_id: issueId,
                        name: branchName,
                        status: 'active',
                        strategy: 'git_worktree',
                        cwd: worktreePath,
                        repo_url: project.repo_url,
                        base_ref: project.repo_branch || 'main',
                        branch_name: branchName,
                        worktree_path: worktreePath,
                    });
                    return { cwd: worktreePath, branchName, worktreePath, strategy: 'git_worktree' };
                }
                catch (err) {
                    logger.warn({ err, projectId, issueId }, 'Failed to create worktree, falling back to project dir');
                }
            }
            return { cwd: project.workspace_dir, strategy: 'project_primary' };
        }
    }
    // 3. Fallback to agent home dir
    return { cwd: config.agentHomeDir, strategy: 'agent_home' };
}
//# sourceMappingURL=resolver.js.map