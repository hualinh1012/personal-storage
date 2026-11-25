#!/usr/bin/env bash
# Creates or updates the app pipeline's two customer-managed policies from
# ci/iam/ and attaches them to the given roles (the app pipeline's, and the
# destroy pipeline's if it has its own role). Run it with admin credentials
# whenever either file changes, before pushing the change that needs it:
# pipelines never update their own roles.
#
#   bash ci/iam/attach-app-policies.sh <app-pipeline-role> [<destroy-pipeline-role> ...]
#
# Managed, not inline: IAM caps all of a role's inline policies together at
# 10,240 characters, and the CodePipeline starter template already puts one on
# the role. A managed policy has its own 6,144-character limit, so the
# permissions are split in two (see docs/guides/setup-from-scratch.md, 7.2).
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <role-name> [<role-name> ...]" >&2
  exit 2
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
OLD_INLINE="family-drive-app"

# name → file
POLICIES=(
  "family-drive-app-pipeline:${DIR}/app-pipeline-policy.json"
  "family-drive-app-pipeline-identity:${DIR}/app-pipeline-identity-policy.json"
)

upsert_policy() {
  local name="$1" file="$2" arn versions oldest
  arn="arn:aws:iam::${ACCOUNT_ID}:policy/${name}"
  if aws iam get-policy --policy-arn "$arn" >/dev/null 2>&1; then
    # A managed policy keeps at most 5 versions: drop the oldest non-default one first.
    versions="$(aws iam list-policy-versions --policy-arn "$arn" \
      --query 'Versions[?IsDefaultVersion==`false`].VersionId' --output text)"
    if [ "$(wc -w <<<"$versions")" -ge 4 ]; then
      oldest="$(tr '\t ' '\n\n' <<<"$versions" | sed 's/^v//' | sort -n | head -n1)"
      aws iam delete-policy-version --policy-arn "$arn" --version-id "v${oldest}"
    fi
    aws iam create-policy-version --policy-arn "$arn" --set-as-default \
      --policy-document "file://${file}" >/dev/null
    echo "Updated ${name}"
  else
    aws iam create-policy --policy-name "$name" --policy-document "file://${file}" \
      --tags Key=Project,Value=family-drive >/dev/null
    echo "Created ${name}"
  fi
}

for entry in "${POLICIES[@]}"; do
  upsert_policy "${entry%%:*}" "${entry#*:}"
done

for role in "$@"; do
  for entry in "${POLICIES[@]}"; do
    aws iam attach-role-policy --role-name "$role" \
      --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${entry%%:*}"
  done
  # The old single inline policy (before the split) would keep counting
  # against the inline limit and hold stale permissions.
  if aws iam get-role-policy --role-name "$role" --policy-name "$OLD_INLINE" >/dev/null 2>&1; then
    aws iam delete-role-policy --role-name "$role" --policy-name "$OLD_INLINE"
    echo "Removed inline policy ${OLD_INLINE} from ${role}"
  fi
  echo "Attached both policies to ${role}"
done
