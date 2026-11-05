#!/usr/bin/env bash
# Creates or updates the retained foundation stack. Run from an admin machine
# (AWS CLI signed in to the target account) before the first pipeline run, and
# again whenever infra/foundation changes. Safe to re-run.
#
# First run: the state bucket doesn't exist yet, so the stack is applied with
# local state and the state is then migrated into the new bucket.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="${PROJECT:-family-drive}"
REGION="${REGION:-ap-southeast-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="${PROJECT}-tfstate-${ACCOUNT_ID}"
OVERRIDE="$DIR/backend_override.tf"

tf() { terraform -chdir="$DIR" "$@"; }

# Adopt parameters created by hand before this stack existed.
import_existing_params() {
  local name addr
  for name in google_client_id google_client_secret allowed_emails; do
    addr="aws_ssm_parameter.${name}"
    if tf state show "$addr" >/dev/null 2>&1; then
      continue
    fi
    if aws ssm get-parameter --region "$REGION" --name "/${PROJECT}/${name}" >/dev/null 2>&1; then
      echo "Importing existing SSM parameter /${PROJECT}/${name}"
      tf import -input=false "$addr" "/${PROJECT}/${name}"
    fi
  done
}

echo "Account ${ACCOUNT_ID}, state bucket ${BUCKET}"

if aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  tf init -input=false -reconfigure -backend-config="bucket=${BUCKET}"
  import_existing_params
  tf apply -input=false
else
  echo "State bucket not found: first run, applying with local state."
  trap 'rm -f "$OVERRIDE"' EXIT
  printf 'terraform {\n  backend "local" {}\n}\n' > "$OVERRIDE"
  tf init -input=false -reconfigure
  import_existing_params
  tf apply -input=false
  rm -f "$OVERRIDE"
  echo "Migrating state into s3://${BUCKET}/foundation/terraform.tfstate"
  tf init -input=false -migrate-state -force-copy -backend-config="bucket=${BUCKET}"
  echo "State migrated. The local terraform.tfstate in ${DIR} is now a stale backup (git-ignored)."
fi

echo
echo "Next: set real values (Terraform never overwrites them):"
echo "  aws ssm put-parameter --region ${REGION} --overwrite --name /${PROJECT}/google_client_id --value '<client id>'"
echo "  aws ssm put-parameter --region ${REGION} --overwrite --name /${PROJECT}/google_client_secret --value '<client secret>'"
echo "  aws ssm put-parameter --region ${REGION} --overwrite --name /${PROJECT}/allowed_emails --value 'you@gmail.com,mom@gmail.com'"
