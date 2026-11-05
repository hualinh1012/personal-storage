#!/usr/bin/env bash
# One-shot deploy for a CodePipeline "Commands" action:
# test + build Lambdas, Terraform plan + apply in infra/, then publish the web app.
# Expects terraform and node (>= 20.19) on PATH and an IAM role allowed to
# read the SSM parameters below and manage the project's resources.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${AWS_REGION:-ap-southeast-1}"
export TF_IN_AUTOMATION=true TF_INPUT=0

terraform version
node -e 'const [a,b]=process.versions.node.split(".").map(Number);
  if (a < 20 || (a === 20 && b < 19)) { console.error("Node >= 20.19 required, found " + process.version); process.exit(1); }
  console.log("node " + process.version);'

ssm() { aws ssm get-parameter --region "$REGION" --name "$1" "${@:2}" --query Parameter.Value --output text; }
export TF_VAR_google_client_id="$(ssm /family-drive/google_client_id)"
export TF_VAR_google_client_secret="$(ssm /family-drive/google_client_secret --with-decryption)"
export TF_VAR_allowed_emails="$(ssm /family-drive/allowed_emails)"

npm ci --prefix "$ROOT/functions/allowlist"
npm test --prefix "$ROOT/functions/allowlist"
npm run build --prefix "$ROOT/functions/allowlist"

terraform fmt -check -recursive "$ROOT/infra"
bash "$ROOT/ci/tf-init.sh"
terraform -chdir="$ROOT/infra" plan -out=tfplan
terraform -chdir="$ROOT/infra" apply tfplan
rm -f "$ROOT/infra/tfplan"

bash "$ROOT/scripts/deploy.sh"
