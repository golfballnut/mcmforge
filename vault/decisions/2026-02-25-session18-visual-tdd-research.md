# Session 18 — Visual TDD Research & Architecture Plan

**Date**: 2026-02-25
**Goal**: Build reliable visual verification loop so agents can see and verify their work

## The Problem

Agents build code blind. They can write code and push PRs but never verify:
- Does the UI actually look right?
- Does it match the proposed mockup?
- Did the Vercel deploy succeed visually?

Without visual feedback, agents are unreliable. Trust can't be built.

## The Loop We're Building

```
Night-Ops scans app → finds gap
    → Generates mockup (HTML → PNG)
    → Emails Steve: "Here's the gap + proposed fix"
    → Steve: APPROVE / DENY
    → Task created with mockup as acceptance criteria
    → Agent builds → pushes branch → Vercel deploys
    → Screenshot API captures the preview
    → Visual diff: screenshot vs mockup
    → Pass? → Open PR for review
    → Fail? → Feed diff back to agent → retry (max 3)
    → Steve reviews PR → merge → production
```

## What We Tried (Session 18)

### Playwright MCP
- **Status**: SLOW, UNRELIABLE
- DOM snapshot every call adds seconds of overhead
- Chrome session conflicts (SingletonLock fights with existing Chrome)
- Mapbox/WebGL maps timeout frequently
- Verdict: Not suitable for production screenshot pipeline

### Puppeteer (local, headless Chrome)
- **Status**: PARTIALLY WORKS
- Can render local HTML mockups to PNG (fast, <1 second)
- Fails on Mapbox map pages — `networkidle2` never resolves (map tiles load continuously)
- Fix needed: use `waitUntil: 'load'` + `page.waitForFunction('map.loaded()')` instead
- Or use `--use-gl=angle --use-angle=swiftshader` flags for headless WebGL

### What We Haven't Tried Yet
- Screenshot APIs (ScreenshotOne, URLBox, Browserless)
- Percy/Chromatic visual regression testing
- Claude Vision for mockup-to-screenshot comparison
- Browserbase (AI-native hosted browser)
- Stagehand (AI browser automation)

## Research Findings: Best Tools Available

### Screenshot Capture (need to evaluate)

| Tool | Type | WebGL Support | Pricing | Notes |
|------|------|--------------|---------|-------|
| ScreenshotOne | API | Unknown | Free tier exists | Simple API call |
| URLBox | API | Unknown | Free tier exists | Popular |
| Browserless.io | Hosted Chrome | Yes | Free tier | Full browser control |
| Browserbase | AI-native browser | Yes | Free tier | Built for AI agents |
| Cloudflare Browser Rendering | Workers-based | Unknown | Pay-per-use | Serverless |

### Visual Comparison

| Tool | Type | AI-Powered | Pricing | Best For |
|------|------|-----------|---------|----------|
| Percy (BrowserStack) | SaaS | Yes (bounding boxes) | Free 5K shots/mo | Visual regression on PRs |
| Chromatic (Storybook) | SaaS | No | Free 5K shots/mo | Component-level visual testing |
| Applitools Eyes | SaaS | Yes (Visual AI) | $969/mo | Figma-vs-production comparison |
| pixelmatch | Library | No | Free (OSS) | Raw pixel diff |
| Claude Vision | API | Yes | Per-token | Mockup-to-screenshot judgment |
| jest-image-snapshot | Library | No | Free (OSS) | TDD visual assertions |

### Agent Orchestration

| Tool | Production Ready | Token Efficiency | Best For |
|------|-----------------|-----------------|----------|
| Claude Agent SDK | Yes | N/A (native) | Programmatic subagents with hooks |
| Claude Agent Teams | Experimental | N/A | Parallel task execution with messaging |
| Ralph Wiggum Plugin | Yes (Anthropic official) | Varies | Autonomous TDD loops |
| LangGraph | v1.0 (most mature) | ~2K tokens/task | Cross-model orchestration |
| CrewAI | Growing | ~3.5K tokens/task | Role-based teams |

### Key Discovery: Ralph Wiggum Technique
- Official Anthropic plugin for Claude Code
- Creates autonomous TDD loops: agent writes code → runs tests → if tests fail, loop continues
- Uses a Stop hook that re-feeds the prompt if completion marker is absent
- `--max-iterations` flag prevents runaway loops
- **This is exactly what we need for the visual TDD gate**

### Key Discovery: Claude Agent Teams (Experimental)
- Enable with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- Team lead spawns teammates, each with their own context window
- Shared task list with dependency tracking
- Agents can message each other directly (not just report to lead)
- Quality gate hooks: `TeammateIdle` and `TaskCompleted`

## Production Examples (Real Companies)

- **Factory.ai**: Autonomous "Droids" handle end-to-end SDLC
- **Zapier**: 97% AI adoption across entire org (Jan 2026)
- **TELUS**: 13,000+ custom AI solutions, 500K hours saved
- **Anthropic internal**: Claude completed task on 12.5M line codebase, 99.9% accuracy
- **Gartner**: 40% of enterprise apps will include AI agents by end of 2026

## Reliability Data

- SWE-bench Verified: top agents solve ~80% of curated issues
- SWE-bench Pro (realistic): only 23-45% success rate
- Raw LLM code has errors ~10% of the time (Vercel v0 data)
- Quality control requires: test gates + AI review + human approval + iteration caps

## Recommended Architecture (Priority Order)

### Phase 1: Visual Eyes (This Week)
1. Pick a screenshot API service (evaluate ScreenshotOne, Browserbase, Browserless)
2. Add to dispatcher: after PR created → screenshot preview URL → attach to email
3. Use Claude Vision to compare screenshot vs mockup → pass/fail score
4. If fail, feed diff description back to agent for retry

### Phase 2: TDD Gate (Next)
1. Install Ralph Wiggum plugin for autonomous TDD loops
2. Dispatcher requires passing tests before marking task complete (hard block, not just warning)
3. Add jest-image-snapshot or pixelmatch for visual assertions in test suite

### Phase 3: Full Loop (After)
1. Night-ops generates HTML mockup for proposed fix
2. Mockup rendered to PNG, attached to approval email
3. On approval → task created with mockup as acceptance criteria
4. Agent builds in TDD loop (Ralph Wiggum)
5. Screenshot API captures Vercel preview
6. Visual comparison (pixel diff + Claude Vision)
7. Pass → PR for review. Fail → retry (max 3)

### Phase 4: Multi-Agent Teams
1. Enable Claude Agent Teams
2. Specialize: design agent, code agent, test agent, review agent
3. Shared task list with dependency tracking
4. Scale to all companies (DirtSync, Hot Golf Brands, Golf Ball Nut)
