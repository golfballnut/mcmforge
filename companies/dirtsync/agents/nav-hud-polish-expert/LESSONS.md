# Lessons Learned — Nav HUD Polish Expert

Append new entries at the top. See `vault/agents/skills/lessons-learned-loop.md` for format.

---

2026-04-09 — Nav HUD polish batch N2-N7 ship

Bug: Six field-test bugs: wrong red threshold (53ft), "0 ft Drive southeast" at turn, cramped "Then" label, 39.5mph GPS spike, verbose trail header, "McMForge" factory name in instructions.
Fix: TurnCardView.swift — thresholds now red≤9.144m(30ft)/orange≤45.72m(150ft)/navy>150ft; TURN NOW LocalizedStringKey at distance==0; "Then" block already had .padding(.top,8) (N5 was pre-fixed). WazeNavTopBar.swift — auto-extracts #-prefixed short name from trailName components, optional trailShortName param for explicit override. FerrostarNavigationService.swift — factoryNameDenyList static array strips McMForge/McMforge/mcmforge from instruction + spoken text + road name. GPSSpikeFilter.swift (NEW) — rolling 3-sample window, >15mph/sec delta returns prior speed; wired at MapLocationManager source so all consumers (nav, ride recording, speed badge) see filtered values. Speed updated BEFORE pause guard check to prevent deadlock.
Why: (N2/N3) Thresholds were in meters (30m=100ft, 152m=500ft) but spec is in feet; N3 had no distance==0 special case. (N4) GPS spike filter was missing entirely — was creating a per-consumer spike each time. (N6) WazeNavTopBar received full long trail name string with no extraction logic. (N7) FerrostarNavigationService passed instruction.text verbatim without filtering; test fixture uses "McMForge" as a GPX track name and it leaked through route conversion. (Module import bug) @testable import DirtSyncApp fails — correct module name is @testable import DirtSync.
Tag: nav, hud, turncard, ferrostar, gps-filter, threshold, factory-name, ios, swift
