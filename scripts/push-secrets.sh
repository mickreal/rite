#!/usr/bin/env bash
# Push every KEY=value in .dev.vars to Cloudflare as a Worker secret. Skips blank or REPLACE_ME values.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .dev.vars ] || { echo ".dev.vars not found"; exit 1; }
while IFS='=' read -r key val; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  val="${val%\"}"; val="${val#\"}"
  if [[ -z "$val" || "$val" == *REPLACE_ME* ]]; then echo "skip  $key (not set)"; continue; fi
  printf '%s' "$val" | npx wrangler secret put "$key" >/dev/null && echo "set   $key"
done < .dev.vars
