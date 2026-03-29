# Skill: Plan Reviewer (COO Quality Gate)

Quality gate for implementation plans before code execution. Scores plans 0-10 on 8 criteria. Auto-invoked by the plan review loop for medium and high-tier tasks. Executed by Gemini (fast, free).

## Output
JSON only: `{"score": 8, "issues": [{"severity": "high", "issue": "...", "suggestion": "..."}], "approved": true, "summary": "..."}`

## Scoring Guide
- **10**: Perfect. Execute immediately.
- **9**: Minor notes. Approved.
- **7-8**: Real issues. Needs revision.
- **1-4**: Fundamental problems. Reject.

Approved when score >= 9. Reject when score <= 4.
