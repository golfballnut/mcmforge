# Stage Derivation Demo — FORGE-252

Pure function: `deriveStage(comments, prUrl, prMerged, issueStatus)`

File: `dashboard/src/lib/issue-stage.ts`

Priority order (highest wins): `shipped > blocked > proof_review > executing > plan_review > planning > filed`

## 5 Example Issues

| Issue | Comments Summary | prUrl | issueStatus | Derived Stage | Reasoning |
|-------|-----------------|-------|-------------|---------------|-----------|
| FORGE-252 | "APPROVED — go ahead" | null | in_progress | **Executing** | APPROVED keyword present (case-sensitive), no PR yet → executing |
| TRUST-1 | (none) | null | done | **Shipped** | issueStatus === 'done' → prMerged branch fires first → shipped |
| TRUST-2 | (none) | null | done | **Shipped** | Same — status=done is terminal signal even without PR |
| FORGE-249 | (none) | null | todo | **Filed** | No comments, no PR, no terminal status → filed |
| FORGE-250 | (none) | null | todo | **Filed** | No plan comment, no approval → filed |

## Blocked Example (canonical COO header only)

```
Comment body: "# ❌ REJECTED\nThis approach has issues with the layout..."
```
→ Matches `/^# ❌ REJECTED/m` → Stage: **Blocked**

```
Comment body: "This task is blocked by the infra work on FORGE-248"
```
→ Does NOT match `/^# ❌ REJECTED/m` → NOT blocked (false-positive prevention)

## Color Reference

| Stage | Pill color |
|-------|-----------|
| `filed` | Grey — `bg-[#21262d] text-[#8b949e]` |
| `planning` | Blue — `bg-[#1f3358] text-[#58a6ff]` |
| `plan_review` | Yellow — `bg-[#3a2f00] text-[#d29922]` |
| `executing` | Green — `bg-[#0f2d1f] text-[#3fb950]` |
| `proof_review` | Purple — `bg-[#2b1f5c] text-[#a371f7]` |
| `shipped` | Green bold — `bg-[#0f2d1f] text-[#3fb950] font-semibold` |
| `blocked` | Red — `bg-[#3d1f1f] text-[#f85149]` |
