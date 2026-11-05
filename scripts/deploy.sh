#!/usr/bin/env bash
# Builds the web app from the current Terraform outputs, uploads it to the web
# bucket and invalidates CloudFront. Requires infra to be applied first.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

tf_output() { terraform -chdir="$ROOT/infra" output -raw "$1"; }

bash "$ROOT/scripts/write-config.sh"

npm ci --prefix "$ROOT/web"
npm run build --prefix "$ROOT/web"

WEB_BUCKET="$(tf_output web_bucket)"
DISTRIBUTION_ID="$(tf_output cloudfront_distribution_id)"

aws s3 sync "$ROOT/web/dist" "s3://${WEB_BUCKET}" --delete
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" \
  --query 'Invalidation.Id' --output text
