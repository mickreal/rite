#!/usr/bin/env bash
# Launch checklist D11: clear every test row from the live D1 before real orders. Backs up first; asks before deleting.
#   bash scripts/wipe-test-data.sh
# Keeps admin_state (your sign-in and two-factor). Everything else listed below is emptied.
set -euo pipefail
cd "$(dirname "$0")/.."
TABLES=(asks stories followups reminders stage_reminders campaign_sends support_replies support_messages support_threads
        creator_payouts creator_ledger creator_sales creators season_invoices year_aheads subscriptions gifts events purchases previews)
mkdir -p backups
OUT="backups/rite-before-wipe-$(date +%Y%m%d-%H%M%S).sql"
echo "1/3 Backing up the live database to $OUT ..."
npx wrangler d1 export rite --remote --output="$OUT"
[ -s "$OUT" ] || { echo "Backup is empty: stopping, nothing deleted."; exit 1; }
echo "    backup: $(wc -c < "$OUT") bytes"
echo "2/3 Rows now:"
# one statement per table: D1 refuses a 20-term UNION ("too many terms in compound SELECT")
SQL=""; for t in "${TABLES[@]}"; do SQL+="SELECT '$t' t, COUNT(*) n FROM $t; "; done
counts() { npx wrangler d1 execute rite --remote --json --command "$SQL" | python3 -c 'import json,sys
for r in json.load(sys.stdin): x=r["results"][0]; print("    " + x["t"].ljust(18), x["n"])'; }
counts
read -r -p "Delete all of these rows (admin_state is kept)? Type WIPE to continue: " ok
[ "$ok" = "WIPE" ] || { echo "Not wiped."; exit 0; }
DEL=""; for t in "${TABLES[@]}"; do DEL+="DELETE FROM $t; "; done
npx wrangler d1 execute rite --remote --command "$DEL"
echo "3/3 After:"
counts
echo "Done. The backup is in $OUT (git-ignored; it holds emails and birth details, so keep it private)."
