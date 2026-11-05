# Sourced (not executed) by ci/pipeline.sh and ci/destroy-app.sh.
# Checks the toolchain and builds the Lambda bundles (Terraform zips them even
# for plan and destroy). The Google client and allowed emails are read by
# Terraform itself from SSM (infra/foundation_inputs.tf).
# Expects ROOT to be set by the caller.

export TF_IN_AUTOMATION=true TF_INPUT=0

terraform version
node -e 'const [a,b]=process.versions.node.split(".").map(Number);
  if (a < 20 || (a === 20 && b < 19)) { console.error("Node >= 20.19 required, found " + process.version); process.exit(1); }
  console.log("node " + process.version);'

npm ci --prefix "$ROOT/functions/allowlist"
npm test --prefix "$ROOT/functions/allowlist"
npm run build --prefix "$ROOT/functions/allowlist"
