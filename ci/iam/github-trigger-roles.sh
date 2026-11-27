#!/usr/bin/env bash
# Creates or updates what lets GitHub Actions start the three CodePipelines, and nothing
# more: the IAM OIDC provider for GitHub, and one role per GitHub Environment. Each role
# trusts only its environment in this repository and may only start and watch its own
# pipeline (ADR 0017). No AWS access key is stored in GitHub.
#
# Run it with admin credentials once, and again whenever a file it reads changes or a
# pipeline is renamed:
#
#   bash ci/iam/github-trigger-roles.sh
#
# Pipeline names default to family-drive-foundation, family-drive-deploy and
# family-drive-destroy. Override them to match existing pipelines (and set the same
# names as GitHub repository variables, see docs/guides/setup-from-scratch.md):
#
#   FOUNDATION_PIPELINE=<name> DEPLOY_PIPELINE=<name> DESTROY_PIPELINE=<name> bash ci/iam/github-trigger-roles.sh
#
# It asks gh for the OIDC subject prefix the roles must trust. Without gh, pass it as
# SUB_PREFIX (gh api repos/<owner>/<name>/actions/oidc/customization/sub --jq .sub_claim_prefix).
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT="${PROJECT:-family-drive}"
REGION="${REGION:-ap-southeast-1}"
REPO="${REPO:-hualinh1012/personal-storage}"
FOUNDATION_PIPELINE="${FOUNDATION_PIPELINE:-${PROJECT}-foundation}"
DEPLOY_PIPELINE="${DEPLOY_PIPELINE:-${PROJECT}-deploy}"
DESTROY_PIPELINE="${DESTROY_PIPELINE:-${PROJECT}-destroy}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
INLINE_POLICY="${PROJECT}-gh-trigger"

# role → GitHub Environment → pipeline
ROLES=(
  "${PROJECT}-gh-foundation:foundation:${FOUNDATION_PIPELINE}"
  "${PROJECT}-gh-deploy:app:${DEPLOY_PIPELINE}"
  "${PROJECT}-gh-destroy:destroy:${DESTROY_PIPELINE}"
)

render() { # <file> <environment> <pipeline>
  sed -e "s|__ACCOUNT_ID__|${ACCOUNT_ID}|g" -e "s|__REGION__|${REGION}|g" -e "s|__SUB_PREFIX__|${SUB_PREFIX}|g" \
    -e "s|__ENVIRONMENT__|$2|g" -e "s|__PIPELINE__|$3|g" "$1"
}

# Only "not found" means absent; any other error (e.g. AccessDenied) stops the script.
role_exists() {
  local out
  if out="$(aws iam get-role --role-name "$1" 2>&1 >/dev/null)"; then return 0; fi
  if grep -q NoSuchEntity <<<"$out"; then return 1; fi
  echo "$out" >&2
  exit 1
}
provider_exists() {
  local out
  if out="$(aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" 2>&1 >/dev/null)"; then return 0; fi
  if grep -q NoSuchEntity <<<"$out"; then return 1; fi
  echo "$out" >&2
  exit 1
}

# The start of the OIDC subject GitHub sends, before ":environment:<name>". With GitHub's
# immutable subjects (this repository) it names the owner and repo by ID too, e.g.
# repo:owner@123/name@456, so a renamed or re-created repository can't match. Asked from
# GitHub, since guessing it from the name breaks when immutable subjects are on.
if [ -z "${SUB_PREFIX:-}" ]; then
  if command -v gh >/dev/null 2>&1 \
    && SUB_PREFIX="$(gh api "repos/${REPO}/actions/oidc/customization/sub" --jq .sub_claim_prefix 2>/dev/null | tr -d '\r')" \
    && [ -n "$SUB_PREFIX" ] && [ "$SUB_PREFIX" != null ]; then
    :
  else
    echo "Can't ask GitHub for the OIDC subject prefix (gh missing or not signed in)." >&2
    echo "Get it with: gh api repos/${REPO}/actions/oidc/customization/sub --jq .sub_claim_prefix" >&2
    echo "then re-run with SUB_PREFIX='<that value>'." >&2
    exit 1
  fi
fi
case "$SUB_PREFIX" in
  repo:*) ;;
  *) echo "Unexpected OIDC subject prefix '${SUB_PREFIX}' (a custom subject template?): expected repo:…" >&2; exit 1 ;;
esac

echo "Account ${ACCOUNT_ID}, repository ${REPO}"
echo "OIDC subject: ${SUB_PREFIX}:environment:<foundation|app|destroy>"

if provider_exists; then
  echo "OIDC provider exists: ${PROVIDER_ARN}"
else
  # No thumbprint: IAM verifies GitHub's certificate against its own trusted CAs.
  aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com --tags Key=Project,Value="${PROJECT}" >/dev/null
  echo "Created OIDC provider ${PROVIDER_ARN}"
fi

for entry in "${ROLES[@]}"; do
  IFS=: read -r role environment pipeline <<<"$entry"
  # Passed inline, not as file:// paths, so it also works with the Windows AWS CLI from Git Bash.
  trust="$(render "$DIR/github-trigger-trust.json" "$environment" "$pipeline")"
  policy="$(render "$DIR/github-trigger-policy.json" "$environment" "$pipeline")"

  if role_exists "$role"; then
    aws iam update-assume-role-policy --role-name "$role" --policy-document "$trust"
  else
    aws iam create-role --role-name "$role" --max-session-duration 3600 \
      --description "GitHub Environment ${environment} starts CodePipeline ${pipeline}" \
      --assume-role-policy-document "$trust" \
      --tags Key=Project,Value="${PROJECT}" >/dev/null
  fi
  aws iam put-role-policy --role-name "$role" --policy-name "$INLINE_POLICY" \
    --policy-document "$policy"
  echo "${role}: environment '${environment}' may start pipeline '${pipeline}'"
done

echo
echo "GitHub repository variables to set (Settings → Secrets and variables → Actions → Variables):"
echo "  AWS_ACCOUNT_ID=${ACCOUNT_ID}"
echo "  FOUNDATION_PIPELINE=${FOUNDATION_PIPELINE}"
echo "  DEPLOY_PIPELINE=${DEPLOY_PIPELINE}"
echo "  DESTROY_PIPELINE=${DESTROY_PIPELINE}"
