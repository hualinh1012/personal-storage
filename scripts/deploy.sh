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
SW=amplify-storage-download/download-sw.js
MANIFEST=manifest.webmanifest
ENTRY=(--exclude index.html --exclude config.json --exclude "$SW" --exclude "$MANIFEST" --exclude "icons/*")

# 1. Content-hashed assets: cache forever (their names change on every build).
aws s3 sync "$DIST" "s3://${WEB_BUCKET}" "${ENTRY[@]}" \
  --cache-control "public,max-age=31536000,immutable"
# Module scripts (e.g. the PDF.js worker) must be served as JavaScript or the
# browser refuses them; don't rely on the CLI's guess for .mjs.
aws s3 cp "$DIST" "s3://${WEB_BUCKET}" --recursive --exclude "*" --include "*.mjs" \
  --content-type "text/javascript" --cache-control "public,max-age=31536000,immutable"
# 2. Entry points: always revalidate, so browsers pick up new asset names and
#    config (e.g. a changed Cognito domain) on the next load.
# The download service worker (Storage Browser) also must not be cached long-term.
for f in index.html config.json "$SW"; do
  aws s3 cp "$DIST/$f" "s3://${WEB_BUCKET}/$f" --cache-control "no-cache"
done
# The PWA manifest and app icons keep fixed names, so they revalidate too. The CLI
# doesn't know .webmanifest; set its type explicitly.
aws s3 cp "$DIST/$MANIFEST" "s3://${WEB_BUCKET}/$MANIFEST" \
  --content-type "application/manifest+json" --cache-control "no-cache"
aws s3 cp "$DIST/icons" "s3://${WEB_BUCKET}/icons" --recursive \
  --content-type "image/png" --cache-control "no-cache"
# 3. Only now remove assets from previous builds.
aws s3 sync "$DIST" "s3://${WEB_BUCKET}" "${ENTRY[@]}" --delete \
  --cache-control "public,max-age=31536000,immutable"

aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" \
  --query 'Invalidation.Id' --output text
