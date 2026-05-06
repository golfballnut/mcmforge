# MCM Forge LaunchD Agents

## com.mcmforge.standup-cron

Fires `run-standup-cron.sh` daily at 07:00 ET (Mini must be set to America/New_York timezone).

### Install

```bash
cp forge-orchestrator/launchd/com.mcmforge.standup-cron.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.mcmforge.standup-cron.plist
```

### Verify

```bash
launchctl list | grep mcmforge
```

### Test fire

```bash
launchctl start com.mcmforge.standup-cron
tail -f ~/Library/Logs/mcmforge-standup.out.log
```

### Uninstall

```bash
launchctl unload ~/Library/LaunchAgents/com.mcmforge.standup-cron.plist
rm ~/Library/LaunchAgents/com.mcmforge.standup-cron.plist
```

### Notes

- Logs: `~/Library/Logs/mcmforge-standup.out.log` and `mcmforge-standup.err.log`
- The script POSTs to `http://127.0.0.1:3200/api/standup/run` (forge-orchestrator must be running via PM2)
- Same pattern as the disabled paperclip plists in `disabled-2026-05-05-paperclip/`
