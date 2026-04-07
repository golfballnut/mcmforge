# MCM Forge Known Bugs & Workarounds

> Add new bugs at the bottom. Mark resolved with [FIXED] prefix.

- **Company switcher race condition:** Cookie write must be `await`ed before `router.refresh()`. Without this, stale company context leaks into the next page load. (PR #36)

- **Adapter config mismatch:** The `model` name in agent config must exactly match the `adapter_type` field. Mismatches cause the orchestrator to pick the wrong CLI. Burned 3 runs debugging this on 2026-04-05.

- **Idempotency keys block retries:** Wakeup requests use idempotency keys. If a wakeup fails and you need to re-trigger the same issue, you must delete the existing row from `wakeup_requests` first.

- **Agents paused + $0 budget = auto-cancelled:** If an agent is paused AND has $0 budget, the orchestrator auto-cancels any queued runs. Unpause the agent AND set budget > 0 to fix.
