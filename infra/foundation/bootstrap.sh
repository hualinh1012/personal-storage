#!/usr/bin/env bash
# Creates or updates the retained foundation stack. Run from an admin machine
# (AWS CLI signed in to the target account) before the first pipeline run, and
# again whenever infra/foundation changes. Safe to re-run.
# Asks for confirmation before applying; set AUTO_APPROVE=1 in a pipeline.
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

# Existence checks that treat only "not found" as absent; any other error
# (e.g. AccessDenied) stops the script instead of being mistaken for "absent".
param_exists() {
  local out
  if out="$(aws ssm get-parameter --region "$REGION" --name "$1" 2>&1 >/dev/null)"; then return 0; fi
  if grep -q ParameterNotFound <<<"$out"; then return 1; fi
  echo "$out" >&2
  exit 1
}
bucket_exists() {
  local out
  if out="$(aws s3api head-bucket --bucket "$1" 2>&1 >/dev/null)"; then return 0; fi
  if grep -qE '\(404\)|Not Found' <<<"$out"; then return 1; fi
  echo "$out" >&2
  exit 1
}

import_if_missing() { # <address> <import id>
  if ! tf state show "$1" >/dev/null 2>&1; then
    echo "Importing existing $2 into $1"
    tf import -input=false "$1" "$2"
  fi
}

# Adopt resources that exist but aren't in state: SSM parameters created by
# hand, or buckets left behind by a first run that failed part-way (its local
# state is lost with the build container).
import_existing() {
  local name
  for name in google_client_id google_client_secret allowed_emails; do
    if param_exists "/${PROJECT}/${name}"; then
      import_if_missing "aws_ssm_parameter.${name}" "/${PROJECT}/${name}"
    fi
  done
  if bucket_exists "${PROJECT}-files-${ACCOUNT_ID}"; then
    import_if_missing aws_s3_bucket.files "${PROJECT}-files-${ACCOUNT_ID}"
  fi
  if bucket_exists "$BUCKET"; then
    import_if_missing aws_s3_bucket.tfstate "$BUCKET"
  fi
}

echo "Account ${ACCOUNT_ID}, state bucket ${BUCKET}"

if bucket_exists "$BUCKET"; then
  tf init -input=false -reconfigure -backend-config="bucket=${BUCKET}"
  import_existing
  tf apply ${AUTO_APPROVE:+-auto-approve}
else
  echo "State bucket not found: first run, applying with local state."
  trap 'rm -f "$OVERRIDE"' EXIT
  printf 'terraform {\n  backend "local" {}\n}\n' > "$OVERRIDE"
  tf init -input=false -reconfigure
  import_existing
  tf apply ${AUTO_APPROVE:+-auto-approve}
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
