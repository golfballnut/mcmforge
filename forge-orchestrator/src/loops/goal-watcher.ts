import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
import { logger } from '../utils/logger.js';

export async function startGoalWatcher(
  supabase: SupabaseClient,
  config: ForgeConfig & { runOnce?: boolean },
) {
  const watch = async () => {
    try {
      // Fetch all active/in_progress goals
      const { data: goals, error } = await supabase
        .from('goals')
        .select('id, title, status, parent_id')
        .in('status', ['active', 'in_progress']);

      if (error) {
        logger.error({ error }, 'Goal watcher: failed to fetch goals');
        return;
      }

      if (!goals?.length) return;

      const completedGoalIds: string[] = [];

      for (const goal of goals) {
        // Fetch all issues linked to this goal
        const { data: issues } = await supabase
          .from('issues')
          .select('id, status')
          .eq('goal_id', goal.id);

        // Skip goals with no linked issues
        if (!issues?.length) continue;

        // Check if ALL issues are done
        const allDone = issues.every((issue) => issue.status === 'done');
        if (!allDone) continue;

        // Mark goal as completed
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('goals')
          .update({
            status: 'completed',
            completed_at: now,
            updated_at: now,
          })
          .eq('id', goal.id);

        if (updateError) {
          logger.error({ error: updateError, goalId: goal.id }, 'Goal watcher: failed to complete goal');
          continue;
        }

        logger.info({ goalId: goal.id, title: goal.title }, 'Goal auto-completed — all issues done');
        completedGoalIds.push(goal.id);
      }

      // Check parent goals: if all siblings are completed, auto-complete the parent
      if (completedGoalIds.length > 0) {
        await checkParentGoals(supabase, goals, completedGoalIds);
      }
    } catch (err) {
      logger.error(err, 'Goal watcher failed');
    }
  };

  await watch();

  if (config.runOnce) return;

  logger.info('Goal watcher started (60s interval)');
  setInterval(watch, 60_000);
}

async function checkParentGoals(
  supabase: SupabaseClient,
  activeGoals: { id: string; title: string; status: string; parent_id: string | null }[],
  justCompletedIds: string[],
) {
  // Collect unique parent_ids from the just-completed goals
  const parentIds = new Set<string>();
  for (const id of justCompletedIds) {
    const goal = activeGoals.find((g) => g.id === id);
    if (goal?.parent_id) parentIds.add(goal.parent_id);
  }

  if (parentIds.size === 0) return;

  for (const parentId of parentIds) {
    // Fetch all sibling goals with the same parent
    const { data: siblings } = await supabase
      .from('goals')
      .select('id, status')
      .eq('parent_id', parentId);

    if (!siblings?.length) continue;

    // Check if ALL siblings are completed
    const allSiblingsDone = siblings.every((s) => s.status === 'completed');
    if (!allSiblingsDone) continue;

    // Fetch parent goal to verify it's still active
    const { data: parent } = await supabase
      .from('goals')
      .select('id, title, status')
      .eq('id', parentId)
      .single();

    if (!parent || !['active', 'in_progress'].includes(parent.status)) continue;

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('goals')
      .update({
        status: 'completed',
        completed_at: now,
        updated_at: now,
      })
      .eq('id', parentId);

    if (error) {
      logger.error({ error, parentId }, 'Goal watcher: failed to complete parent goal');
      continue;
    }

    logger.info({ parentId, title: parent.title }, 'Parent goal auto-completed — all sub-goals done');
  }
}
