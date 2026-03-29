# Skill: Orchestrator (Auto-Classification)

Task router for MCM Forge dispatcher. Used to classify incoming tasks into skill_name, task_type, cli_target, needs_approval, review_tier. Invoked automatically when a task has no skill_name set. Not called directly by agents.

## Output
Return ONLY valid JSON: `{"skill_name": "tdd-workflow", "cli_target": "claude", "task_type": "code", "needs_approval": false, "review_tier": "medium", "reasoning": "..."}`

## Key Fields
- **task_type**: code | research | content | ops | proposal | chat
- **cli_target**: claude | gemini | codex
- **review_tier**: low (research/ops) | medium (code) | high (migrations/deploy)
