#!/usr/bin/env bash
# App deploy for a CodePipeline "Commands" action:
# test + build Lambdas, Terraform plan + apply in infra/, then publish the web app.
# Expects terraform and node (>= 22.12) on PATH, the foundation stack applied,
# and an IAM role allowed to read the SSM parameters and manage the app's resources.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=ci/app-env.sh
source "$ROOT/ci/app-env.sh"

npm ci --prefix "$ROOT/web"
npm test --prefix "$ROOT/web"

terraform fmt -check -recursive "$ROOT/infra"
bash "$ROOT/ci/tf-init.sh"
terraform -chdir="$ROOT/infra" plan -out=tfplan
terraform -chdir="$ROOT/infra" apply tfplan
rm -f "$ROOT/infra/tfplan"

# The web dependencies are installed above; deploy.sh skips its own npm ci.
WEB_DEPS_INSTALLED=1 bash "$ROOT/scripts/deploy.sh"
