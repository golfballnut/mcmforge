import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
import { parseMentions } from '../services/mention-parser.js';
import { createWakeup } from '../services/wakeup.js';
import { logger } from '../utils/logger.js';

let lastCheckedAt = new Date().toISOString();

export async function startMentionWatcher(supabase: SupabaseClient, config: ForgeConfig) {
  logger.info('Mention watcher started (30s interval)');

  setInterval(async () => {
    try {
      // Find comments created since last check
      const { data: comments } = await supabase
        .from('issue_comments')
        .select('id, company_id, issue_id, body, author_agent_id')
        .gt('created_at', lastCheckedAt)
        .order('created_at', { ascending: true });

      if (!comments?.length) {
        lastCheckedAt = new Date().toISOString();
        return;
      }

      // Get all agent names for mention matching
      const { data: agents } = await supabase
        .from('agents')
        .select('id, name, company_id, status');

      if (!agents?.length) return;

      const agentNames = agents.map(a => a.name);

      for (const comment of comments) {
        const mentions = parseMentions(comment.body, agentNames);

        for (const mentionedName of mentions) {
          const agent = agents.find(a =>
            a.name.toLowerCase() === mentionedName.toLowerCase() &&
            a.company_id === comment.company_id
          );

          if (!agent) continue;
          if (agent.status === 'paused' || agent.status === 'terminated') continue;
          // Don't wake yourself
          if (agent.id === comment.author_agent_id) continue;

          logger.info({ agent: agent.name, commentId: comment.id, issueId: comment.issue_id }, 'Mention detected, creating wakeup');

          await createWakeup(supabase, {
            companyId: comment.company_id,
            agentId: agent.id,
            source: 'mention',
            triggerDetail: `Mentioned in comment on issue`,
            reason: `@${agent.name} mentioned in comment`,
            payload: {
              issueId: comment.issue_id,
              commentId: comment.id,
              wakeReason: 'mention',
            },
            idempotencyKey: `mention-${comment.id}-${agent.id}`,
          });
        }
      }

      lastCheckedAt = new Date().toISOString();
    } catch (err) {
      logger.error(err, 'Mention watcher failed');
    }
  }, 30_000);
}
