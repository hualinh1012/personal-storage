#!/usr/bin/env bash
# Destroys the app stack (infra/) only: Cognito, Lambdas, Identity Pool,
# CloudFront, the web bucket and the files bucket's CORS rule. The foundation
# stack (state bucket, files bucket with the family's files, SSM parameters)
# is not touched. Re-run the app pipeline to bring the app back.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=ci/app-env.sh
source "$ROOT/ci/app-env.sh"

bash "$ROOT/ci/tf-init.sh"
terraform -chdir="$ROOT/infra" destroy -auto-approve
