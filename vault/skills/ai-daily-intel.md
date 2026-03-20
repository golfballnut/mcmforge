# Skill: ai-daily-intel

## Goal
Scan AI news sources daily, filter for what matters to MCM Forge, and deliver an actionable intelligence brief.

## Trigger Keywords
ai news, ai update, daily intel, what happened in ai, ai brief, morning intel, tech news

## Context
MCM Forge runs 5 companies using Claude Code, Gemini CLI, Codex CLI on a Mac Mini. We care about:
- **Agent frameworks**: OpenClaw, Claude Code, Cursor, Windsurf, Copilot, Devin, Codex
- **Model releases**: Anthropic, OpenAI, Google, Meta, Mistral — new models, benchmarks, pricing changes
- **Tools we use**: Supabase, Vercel, Playwright, MCP servers, PM2, Node.js
- **Ecommerce**: Shopify API changes, ShipStation updates (Links Choice, Golf Ball Nut, Hot Golf Brands)
- **APIs & protocols**: MCP protocol, ACP protocol, Agent SDK, tool-use improvements
- **Security**: Prompt injection research, agent security, OAuth changes
- **Cost**: Pricing changes on any model/API we use or might use

## Sources (fetched by scripts/fetch-ai-feeds.ts)
- Anthropic blog RSS
- OpenAI blog RSS
- Google AI blog RSS
- Hacker News top stories (AI-filtered)
- GitHub releases: anthropics/claude-code, openai/codex
- TechCrunch AI section
- The Verge AI section
- r/ClaudeAI, r/LocalLLaMA (RSS)
- Changelog podcast feed
- NVIDIA AI blog

## Output Format
```
## AI Daily Intel — {date}

### Top 3 Things That Matter to Us
1. {headline}
   → Impact: {how this affects MCM Forge, specific company, or our stack}
2. ...
3. ...

### Other Notable
- {item}: {one-line summary}
- ...

### Action Items (if any)
- [ ] {specific thing to do or investigate}

### Sources
- {links to original articles}
```

## Gotchas
- Do NOT recommend installing unvetted tools without flagging security risk
- Do NOT recommend paid services without noting cost
- Do NOT include vaporware announcements with no release date — only things that exist NOW
- Do NOT repeat items from previous days — check data/ai-intel-log.json
- Keep the brief under 500 words — Steve reads this on his phone at 6 AM
- When a model release happens, compare to our current models (Opus 4.6, Sonnet 4.6, Gemini 2.5 Flash)
- Flag anything that could break our stack (breaking API changes, deprecations)

## Schedule
- Runs daily at 5 AM ET via night-ops cron
- Uses Gemini CLI (free tier) for summarization
- RSS fetch script runs first, pipes raw content to Gemini

## Data Persistence
- `data/ai-intel-log.json` — rolling 30-day log of all items (prevents repeats)
- Google Sheet "AI Intel" tab in master task list — running log Steve can browse
