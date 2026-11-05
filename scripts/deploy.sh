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

DIST="$ROOT/web/dist"
ENTRY=(--exclude index.html --exclude config.json)

# 1. Content-hashed assets: cache forever (their names change on every build).
aws s3 sync "$DIST" "s3://${WEB_BUCKET}" "${ENTRY[@]}" \
  --cache-control "public,max-age=31536000,immutable"
# 2. Entry points: always revalidate, so browsers pick up new asset names and
#    config (e.g. a changed Cognito domain) on the next load.
for f in index.html config.json; do
  aws s3 cp "$DIST/$f" "s3://${WEB_BUCKET}/$f" --cache-control "no-cache"
done
# 3. Only now remove assets from previous builds.
aws s3 sync "$DIST" "s3://${WEB_BUCKET}" "${ENTRY[@]}" --delete \
  --cache-control "public,max-age=31536000,immutable"

aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" \
  --query 'Invalidation.Id' --output text
