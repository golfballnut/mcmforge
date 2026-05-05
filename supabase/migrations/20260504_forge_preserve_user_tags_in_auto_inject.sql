-- M0.3: preserve user-supplied tags on forge.issues insert.
--
-- The auto-classifier in fn_auto_knowledge_inject keyword-scans title/description
-- against forge.tag_keywords and overwrites NEW.tags with the matched set.
-- This silently drops user-curated metadata (e.g. tags=['validation','noop']
-- got rewritten to ['ios'] on DIR-VAL-1).
--
-- Fix: skip the tag-overwrite branch when the user already supplied tags.
-- Knowledge-injection comments and specialist-routing logic are unchanged —
-- they continue to use keyword-derived matched_tags for relevance.

CREATE OR REPLACE FUNCTION forge.fn_auto_knowledge_inject()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  combined_text text;
  matched_tags text[] := '{}';
  knowledge_row record;
  comment_body text := '';
  entry_count int := 0;
  tag_row record;
  file_row record;
  best_agent record;
  fallback_agent record;
  routing_comment text := '';
  has_knowledge boolean := false;
  rec_agent_id uuid := NULL;
  rec_agent_name text := NULL;
BEGIN
  BEGIN
    combined_text := lower(NEW.title || ' ' || COALESCE(NEW.description, ''));

    FOR tag_row IN SELECT tag, keywords FROM forge.tag_keywords LOOP
      IF EXISTS (
        SELECT 1 FROM unnest(tag_row.keywords) kw
        WHERE combined_text LIKE '%' || kw || '%'
      ) THEN
        matched_tags := array_append(matched_tags, tag_row.tag);
      END IF;
    END LOOP;

    FOR file_row IN SELECT file_pattern, tag FROM forge.file_tag_mappings LOOP
      IF combined_text LIKE '%' || file_row.file_pattern || '%' THEN
        IF NOT file_row.tag = ANY(matched_tags) THEN
          matched_tags := array_append(matched_tags, file_row.tag);
        END IF;
      END IF;
    END LOOP;

    -- M0.3 change: only overwrite tags when user did NOT supply any.
    IF array_length(matched_tags, 1) > 0
       AND (NEW.tags IS NULL OR array_length(NEW.tags, 1) = 0) THEN
      UPDATE forge.issues SET tags = matched_tags WHERE id = NEW.id;
    END IF;

    FOR knowledge_row IN
      SELECT title, body, tags, confidence
      FROM forge.knowledge
      WHERE tags && matched_tags
        AND confidence != 'disproven'
        AND company_id = NEW.company_id
      ORDER BY
        CASE confidence WHEN 'proven' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 5
    LOOP
      entry_count := entry_count + 1;
      comment_body := comment_body || E'\n### ' || entry_count || '. '
        || knowledge_row.title
        || ' (' || COALESCE(knowledge_row.confidence, 'unknown') || ')'
        || E'\n'
        || left(COALESCE(knowledge_row.body, ''), 150)
        || CASE WHEN length(COALESCE(knowledge_row.body, '')) > 150 THEN '...' ELSE '' END
        || E'\n**Tags:** ' || array_to_string(knowledge_row.tags, ', ')
        || E'\n';
    END LOOP;

    has_knowledge := entry_count > 0;

    IF entry_count > 0 THEN
      comment_body := '## Required Reading (' || entry_count || ' entries)'
        || E'\nAuto-injected based on tags: **' || array_to_string(matched_tags, ', ') || '**'
        || E'\n'
        || comment_body
        || E'\n---\n_Search the knowledge base for these tags if you need more context._';

      INSERT INTO forge.issue_comments (issue_id, company_id, body, author_user_id)
      VALUES (NEW.id, NEW.company_id, comment_body, 'system');
    END IF;

    -- STEP 2: SPECIALIST ROUTING
    -- FIX: Pick highest priority agent REGARDLESS of status, then check active/paused
    IF array_length(matched_tags, 1) > 0 THEN

      -- Find the BEST agent by priority (any status)
      SELECT a.id, a.name, a.status, tam.priority, tam.tag as matched_tag
      INTO best_agent
      FROM forge.tag_agent_mappings tam
      JOIN forge.agents a ON a.id = tam.agent_id
      WHERE tam.tag = ANY(matched_tags)
      ORDER BY tam.priority DESC
      LIMIT 1;

      -- Get Feature Builder as fallback
      SELECT a.id, a.name, a.status
      INTO fallback_agent
      FROM forge.agents a
      WHERE a.name = 'Feature Builder'
        AND a.company_id = NEW.company_id
      LIMIT 1;

      IF best_agent.id IS NOT NULL THEN
        rec_agent_id := best_agent.id;

        IF best_agent.status IN ('active', 'idle') THEN
          -- CASE 1: Best specialist is active
          rec_agent_name := best_agent.name;
          routing_comment := '## Recommended Specialist: ' || best_agent.name
            || E'\nThis agent owns the domain matching tags: **' || array_to_string(matched_tags, ', ') || '**'
            || E'\nStatus: ' || best_agent.status
            || E'\nMatched on: ' || best_agent.matched_tag || ' (priority ' || best_agent.priority || ')'
            || E'\n\nTo assign: set `assignee_agent_id` to `' || best_agent.id || '`'
            || E'\n\n_This agent reads its own LESSONS.md on wake — domain knowledge is pre-loaded._';

        ELSE
          -- CASE 2: Best specialist exists but is paused
          rec_agent_name := best_agent.name || ' (PAUSED)';
          routing_comment := '## Specialist Paused — Fallback to Generalist'
            || E'\n**' || best_agent.name || '** covers tags `' || array_to_string(matched_tags, ', ') || '` but is currently **' || best_agent.status || '**.'
            || E'\nMatched on: ' || best_agent.matched_tag || ' (priority ' || best_agent.priority || ')'
            || E'\n\nConsider activating the specialist before dispatching — they have domain-specific LESSONS.md that will reduce iterations.'
            || E'\n\n**Fallback:** ' || COALESCE(fallback_agent.name, 'Feature Builder')
            || ' (generalist, status: ' || COALESCE(fallback_agent.status, 'unknown') || ')'
            || E'\nTo assign fallback: `assignee_agent_id` = `' || COALESCE(fallback_agent.id::text, 'unknown') || '`'
            || E'\nTo activate specialist: `UPDATE forge.agents SET status = ''active'' WHERE id = ''' || best_agent.id || '''`';
        END IF;

      ELSE
        -- No mapping at all
        IF has_knowledge THEN
          routing_comment := '## No Specialist — Generalist with Knowledge'
            || E'\nNo specialist is mapped to tags `' || array_to_string(matched_tags, ', ') || '`.'
            || E'\nKnowledge base has entries for this domain (see Required Reading above).'
            || E'\n\n**Assign to:** ' || COALESCE(fallback_agent.name, 'Feature Builder')
            || ' (generalist, status: ' || COALESCE(fallback_agent.status, 'unknown') || ')'
            || E'\nTo assign: `assignee_agent_id` = `' || COALESCE(fallback_agent.id::text, 'unknown') || '`'
            || E'\n\n_Consider onboarding a specialist for this domain to reduce future iterations._';
        ELSE
          routing_comment := '## WARNING: Unknown Domain'
            || E'\nNo specialist and no knowledge base entries exist for tags `' || array_to_string(matched_tags, ', ') || '`.'
            || E'\n\n**Before dispatching, consider:**'
            || E'\n1. Onboard a specialist using `vault/agents/skills/agent-onboarding.md`'
            || E'\n2. Add domain knowledge to the knowledge base'
            || E'\n3. Or assign to ' || COALESCE(fallback_agent.name, 'Feature Builder') || ' (generalist) at higher iteration cost'
            || E'\n\n**Risk:** Sending a generalist into an unknown domain without knowledge = DIRA-177 repeat.'
            || E'\nTo assign generalist anyway: `assignee_agent_id` = `' || COALESCE(fallback_agent.id::text, 'unknown') || '`';
        END IF;
      END IF;

      IF routing_comment != '' THEN
        INSERT INTO forge.issue_comments (issue_id, company_id, body, author_user_id)
        VALUES (NEW.id, NEW.company_id, routing_comment, 'system');
      END IF;

    END IF;

    UPDATE forge.issues SET
      knowledge_entry_count = entry_count,
      recommended_agent_id = rec_agent_id,
      recommended_agent_name = rec_agent_name
    WHERE id = NEW.id;

  EXCEPTION WHEN OTHERS THEN
    INSERT INTO forge.trigger_errors (trigger_name, issue_id, error_message)
    VALUES ('auto_knowledge_inject', NEW.id, SQLERRM);
  END;

  RETURN NEW;
END;
$function$;
