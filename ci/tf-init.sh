#!/usr/bin/env bash
# Runs `terraform init` in infra/ against the S3 state bucket created by infra/foundation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${PROJECT:-family-drive}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

terraform -chdir="$ROOT/infra" init -input=false \
  -backend-config="bucket=${PROJECT}-tfstate-${ACCOUNT_ID}"
