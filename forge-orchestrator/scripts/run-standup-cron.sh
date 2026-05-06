#!/usr/bin/env bash
set -euo pipefail

COMPANY_ID="170ebe36-d689-4f15-91f1-7474df6c98cd"

curl -fsS -X POST http://127.0.0.1:3200/api/standup/run \
  -H "Content-Type: application/json" \
  -d "{\"companyId\":\"$COMPANY_ID\"}" \
  --max-time 90
