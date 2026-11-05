# Sourced (not executed) by ci/pipeline.sh and ci/destroy-app.sh.
# Checks the toolchain, exports the app stack's TF_VAR_* from SSM, and builds
# the Lambda bundles (Terraform zips them even for plan and destroy).
# Expects ROOT to be set by the caller.

REGION="${AWS_REGION:-ap-southeast-1}"
export TF_IN_AUTOMATION=true TF_INPUT=0

terraform version
node -e 'const [a,b]=process.versions.node.split(".").map(Number);
  if (a < 20 || (a === 20 && b < 19)) { console.error("Node >= 20.19 required, found " + process.version); process.exit(1); }
  console.log("node " + process.version);'

# Plain assignments (not `export X="$(...)"`) so a failed SSM read stops the script.
ssm() {
  local value
  value="$(aws ssm get-parameter --region "$REGION" --name "$1" "${@:2}" --query Parameter.Value --output text)" || return 1
  if [[ -z "$value" || "$value" == "None" ]]; then
    echo "SSM parameter $1 is empty in $REGION" >&2
    return 1
  fi
  printf '%s' "$value"
}
TF_VAR_google_client_id="$(ssm /family-drive/google_client_id)"
TF_VAR_google_client_secret="$(ssm /family-drive/google_client_secret --with-decryption)"
TF_VAR_allowed_emails="$(ssm /family-drive/allowed_emails)"
export TF_VAR_google_client_id TF_VAR_google_client_secret TF_VAR_allowed_emails

npm ci --prefix "$ROOT/functions/allowlist"
npm test --prefix "$ROOT/functions/allowlist"
npm run build --prefix "$ROOT/functions/allowlist"
