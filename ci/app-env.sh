# shellcheck shell=bash
# Sourced (not executed) by ci/apply-app.sh and ci/destroy-app.sh.
# Checks the toolchain and builds the Lambda bundles (Terraform zips them even
# for plan and destroy). The Google client and allowed emails are read by
# Terraform itself from SSM (infra/foundation_inputs.tf).
# Expects ROOT to be set by the caller.

export TF_IN_AUTOMATION=true TF_INPUT=0

terraform version
node -e 'const a=Number(process.versions.node.split(".")[0]);
  if (a < 26) { console.error("Node >= 26 required (vite 8 / vitest 5 / jsdom 31), found " + process.version); process.exit(1); }
  console.log("node " + process.version);'

npm ci --prefix "$ROOT/functions/allowlist"
npm test --prefix "$ROOT/functions/allowlist"
npm run build --prefix "$ROOT/functions/allowlist"
