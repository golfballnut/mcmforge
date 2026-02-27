# Visual TDD Tool Research — Feb 25, 2026

## Screenshot Capture: Ranked Recommendations

### #1: Playwright on Mac Mini (FREE — Test First)
- M-series GPU handles WebGL natively
- Flags: `--use-gl=egl --enable-webgl --ignore-gpu-blocklist --enable-gpu`
- Use `channel: 'chrome'` (installed Chrome, not bundled Chromium)
- Wait strategy: `waitUntil: 'load'` + `page.waitForFunction('map.loaded() && map.isStyleLoaded()')`
- **CRITICAL**: App must set `preserveDrawingBuffer: true` on Mapbox map constructor
- Our earlier failure was using `networkidle2` (never resolves for Mapbox) — `load` + waitForFunction is the fix

### #2: ScreenshotOne API ($79/mo)
- Simple GET API: `curl "https://api.screenshotone.com/take?url=...&request_gpu_rendering=true&delay=10"`
- Explicit GPU rendering support for WebGL
- Free tier: 100/mo to test
- GPU rendering may require higher-tier plans

### #3: Browserless.io ($25/mo)
- Hosted Chrome with `waitForFunction` support (unique — can check `map.loaded()`)
- POST JSON body, get PNG back
- 20K units/mo on $25 plan
- GPU support uncertain — ask their support

### Dead Ends (DO NOT USE)
- AWS Lambda + Chrome: Mapbox WebGL crashes (documented: github.com/alixaxel/chrome-aws-lambda/issues/184)
- ApiFlash/Microlink: Lambda-based, no GPU, WebGL fails
- Screenshotapi.net: No confirmed WebGL support

## Visual Comparison: Ranked Recommendations

### Tier 1: Pixel Diff (fast, cheap)
| Tool | Speed | Cost | Best For |
|------|-------|------|----------|
| pixelmatch | 80ms/2.5MP | Free (OSS) | Industry standard, Mapbox team maintains |
| Honeydiff (Vizzly) | 20ms/2.5MP | Free (OSS) | SSIM scoring, spatial clustering |
| jest-image-snapshot | N/A | Free (OSS) | TDD assertions: `expect(img).toMatchImageSnapshot()` |

### Tier 2: AI Vision (semantic understanding)
- **Claude Vision**: Send mockup + screenshot, get actionable feedback + 0-100 score
- Cost: ~$0.01-0.05 per comparison
- Best for: "the sidebar is 20px too wide" not just "5000 pixels differ"
- Use BOTH pixel diff + Claude Vision: pixel diff catches exact diffs, Claude interprets if they matter

### Tier 3: Visual Testing Platforms (SaaS)
| Tool | Free Tier | Paid | Best For |
|------|-----------|------|----------|
| Percy | 5K shots/mo | $199/mo | CI/CD visual regression on PRs |
| Chromatic | 5K shots/mo | $179/mo | Storybook component testing |
| Vizzly | Free tier | $12/user/mo | **AI agent workflows** (Claude Code integration, TDD mode) |
| Applitools | None | $969/mo | Enterprise, Figma-vs-production (overkill for us) |
| Argos CI | 5K shots/mo | $100/mo | Open source, self-hostable |

**Winner: Vizzly** — $12/mo, purpose-built for Claude Code visual TDD, uses Honeydiff, no per-screenshot fees

## Agent Orchestration: Key Findings

### Ralph Wiggum Technique (CRITICAL — USE THIS)
- Official Anthropic plugin for Claude Code autonomous TDD loops
- Stop hook intercepts agent completion → re-feeds prompt if tests still failing
- `--max-iterations` flag prevents runaway (50 iterations = $50-100)
- GitHub: github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum
- **This is exactly our visual TDD loop**

### Claude Agent Teams (Experimental)
- Enable: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- Team lead + specialized teammates with shared task list
- Agents can message each other directly
- Quality gate hooks: `TeammateIdle`, `TaskCompleted`
- Best for 3-5 teammates, 5-6 tasks each

### Claude Agent SDK
- Python + TypeScript — programmatic agent orchestration
- Built-in tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch
- Subagents via Task tool, hooks for pre/post tool use
- MCP integration for databases, browsers, APIs
- Could replace our custom dispatcher.ts

### Framework Comparison
| Framework | Token Efficiency | Production Ready | Best For |
|-----------|-----------------|-----------------|----------|
| LangGraph | ~2K tokens/task | v1.0 (most mature) | Cross-model orchestration |
| CrewAI | ~3.5K tokens/task | Growing | Role-based teams |
| AutoGen | ~8K tokens/task | Research-oriented | Iterative refinement |

## Reliability Data (SWE-bench, Feb 2026)
- Claude Opus 4.5/4.6: 80.9% on SWE-bench Verified (curated issues)
- SWE-bench Pro (realistic): only 23-45% (the real number)
- Raw LLM code errors: ~10% (Vercel v0 data)
- Quality needs: test gates + AI review + human approval + 3-iteration cap

## Production Companies Running 24/7 Agents
- Factory.ai: autonomous "Droids" for full SDLC
- Zapier: 97% AI adoption (Jan 2026)
- TELUS: 13K+ AI solutions, 500K hours saved
- Gartner: 40% enterprise apps will have AI agents by end 2026
- Only 11% of orgs actively using in production (Deloitte)

## Vercel Preview Screenshot Fix
Vercel Deployment Protection blocks headless browsers. Fix:
1. Enable "Protection Bypass for Automation" in Vercel project settings
2. Get `VERCEL_AUTOMATION_BYPASS_SECRET`
3. Pass header: `x-vercel-protection-bypass: SECRET`
4. This bypasses all auth for automated screenshots
