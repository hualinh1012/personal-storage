#!/usr/bin/env bash
# Writes web/public/config.json from Terraform outputs.
# Usage: scripts/write-config.sh
# Testing: TF_OUTPUT_JSON_FILE=<file> reads `terraform output -json` from a file instead of running terraform.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/web/public/config.json"

if [[ -n "${TF_OUTPUT_JSON_FILE:-}" ]]; then
  TF_JSON="$(cat "$TF_OUTPUT_JSON_FILE")"
else
  TF_JSON="$(terraform -chdir="$ROOT/infra" output -json)"
fi

trap 'rm -f "$OUT.tmp"' EXIT
mkdir -p "$(dirname "$OUT")"
printf '%s' "$TF_JSON" | node -e '
const out = JSON.parse(require("fs").readFileSync(0, "utf8"));
const map = {
  region: "region",
  userPoolId: "user_pool_id",
  userPoolClientId: "user_pool_client_id",
  cognitoDomain: "cognito_domain",
  identityPoolId: "identity_pool_id",
  filesBucket: "files_bucket",
  appUrl: "app_url",
  // Google Drive import; CHANGE_ME until set up (the SPA then says so).
  googleClientId: "google_client_id",
  googleApiKey: "google_api_key",
  googleProjectNumber: "google_project_number",
};
const cfg = {};
for (const [key, tfName] of Object.entries(map)) {
  const v = out[tfName] && out[tfName].value;
  if (typeof v !== "string" || v === "") {
    console.error("Missing or empty Terraform output: " + tfName);
    process.exit(1);
  }
  cfg[key] = v;
}
process.stdout.write(JSON.stringify(cfg, null, 2) + "\n");
' > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
echo "Wrote $OUT"
