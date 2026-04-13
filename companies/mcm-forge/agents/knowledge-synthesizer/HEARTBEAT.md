# Knowledge Synthesizer — Daily Heartbeat

Run daily at 9am ET, after Factory Analyst.

## Step 0: Read Lessons

Read `LESSONS.md` in your agent directory. Apply any relevant lessons.

## Step 1: Find Unsynthesized Issues

Query for `done` issues that are NOT yet in any knowledge entry's `source_issue_ids`:

```bash
# All done issues
curl -s "$SUPA_URL/rest/v1/issues?status=eq.done&select=id,title,description,tags,acceptance_criteria,proof_summary,verify_command,company_id" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge"
```

```bash
# All existing knowledge source IDs
curl -s "$SUPA_URL/rest/v1/knowledge?select=source_issue_ids" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge"
```

Compute the difference: done issues whose ID doesn't appear in any `source_issue_ids` array.

## Step 2: For Each Unsynthesized Issue

Fetch full context:

```bash
# Comments (the agent's step-by-step work)
curl -s "$SUPA_URL/rest/v1/issue_comments?issue_id=eq.<ID>&select=body,created_at&order=created_at.asc" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge"
```

```bash
# Attachments (proof)
curl -s "$SUPA_URL/rest/v1/issue_attachments?issue_id=eq.<ID>&select=filename,category" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge"
```

**Skip** issues with <3 comments and 0 attachments — not enough signal.

## Step 3: Extract Knowledge

For each qualifying issue, determine:
1. **Root cause** — what was actually broken?
2. **What worked** — the fix that shipped
3. **What didn't work** — failed approaches (from BLOCKED comments or multiple Step 5 iterations)
4. **Tags** — 2-5 domain tags. Check existing tags first:

```bash
# Get existing tags to maintain consistency
curl -s "$SUPA_URL/rest/v1/knowledge?select=tags" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge"
```

5. **Confidence** — `proven` if proof_summary exists + acceptance criteria verified. `suspected` if partial.

## Step 4: Check for Duplicates

Before creating, search for tag overlap:

```bash
curl -s "$SUPA_URL/rest/v1/knowledge?tags=ov.{<tag1>,<tag2>}&select=id,title,tags,source_issue_ids" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge"
```

If a match has >50% tag overlap AND similar title:
- PATCH the existing entry: append to `source_issue_ids`, enrich the body, update `updated_at`
- Do NOT create a new entry

## Step 5: Create or Update Knowledge Entry

**Create new:**
```bash
curl -s "$SUPA_URL/rest/v1/knowledge" -X POST \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d '{
    "company_id": "<COMPANY_ID>",
    "title": "<TITLE>",
    "body": "<MARKDOWN_BODY>",
    "tags": ["<tag1>","<tag2>"],
    "source_issue_ids": ["<ISSUE_ID>"],
    "source_type": "issue_synthesis",
    "confidence": "proven",
    "created_by_agent_id": "<OWN_AGENT_ID>"
  }'
```

**Update existing:**
```bash
curl -s "$SUPA_URL/rest/v1/knowledge?id=eq.<KNOWLEDGE_ID>" -X PATCH \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d '{
    "body": "<ENRICHED_BODY>",
    "source_issue_ids": ["<EXISTING_IDS>", "<NEW_ISSUE_ID>"],
    "updated_at": "<NOW>"
  }'
```

## Step 6: Log Events

For each knowledge entry created, log an event on the source issue:

```bash
curl -s "$SUPA_URL/rest/v1/issue_events" -X POST \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d '{"issue_id":"<ISSUE_ID>","event_type":"knowledge_created","actor_type":"routine","actor_id":"knowledge-synthesizer","new_value":"<KNOWLEDGE_ID>"}'
```

## Step 7: Post Daily Digest

Post summary to own Forge issue:

```
## Knowledge Synthesis — <DATE>
- Issues processed: <N>
- New entries created: <N>
- Existing entries enriched: <N>
- Skipped (insufficient data): <N>
- Total knowledge entries: <N>
- Coverage: <N>/<M> done issues synthesized (<X>%)
```

## Step 8: Append Lessons

Append this run's lessons to `LESSONS.md` using the format in `vault/agents/skills/lessons-learned-loop.md`.
