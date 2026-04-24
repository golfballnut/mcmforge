import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
export interface ResolvedWorkspace {
    cwd: string;
    branchName?: string;
    worktreePath?: string;
    strategy: 'project_primary' | 'git_worktree' | 'agent_home';
}
export declare function resolveWorkspace(supabase: SupabaseClient, config: ForgeConfig, agent: any, run: any): Promise<ResolvedWorkspace>;
//# sourceMappingURL=resolver.d.ts.map