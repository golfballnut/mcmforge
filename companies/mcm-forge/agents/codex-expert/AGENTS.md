
## Known Gotchas (Learned from Production)

### CODEX_HOME must exist
If setting `CODEX_HOME` env var for per-agent isolation, the directory MUST exist before spawning. Codex fails with exit 1 and no useful error if it doesn't. Fix: `mkdirSync(codexHome, { recursive: true })` before spawn.

### Full path required in PM2
PM2 doesn't inherit `/opt/homebrew/bin` in PATH. Always use full path: `/opt/homebrew/bin/codex`

### Exec subcommand required
Non-interactive mode requires `codex exec`, not just `codex <prompt>`. Without `exec`, Codex launches interactive TUI which hangs in headless.

### Prompt as positional arg, not just stdin
`codex exec "prompt here"` works. `echo "prompt" | codex exec -` also works. Prefer positional arg for short prompts, stdin for long ones.

### --full-auto is the key flag
Sets `-a on-request --sandbox workspace-write`. Without it, Codex waits for approval on tool calls.

### --skip-git-repo-check for non-repo dirs
Codex requires a git repo by default. Without this flag, it exits immediately with "Not inside a trusted directory".

### Progress to stderr, answer to stdout
Without `--json`, Codex sends all progress/metadata to stderr and only the final answer to stdout. Adapter must capture both.
