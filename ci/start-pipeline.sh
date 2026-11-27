#!/usr/bin/env bash
# Starts a CodePipeline run at an exact commit and waits for it to finish. Used by the
# GitHub Actions deploy and destroy workflows (ADR 0017), signed in as a
# family-drive-gh-* role that may only start and watch that one pipeline.
#
#   bash ci/start-pipeline.sh <pipeline-name> <commit-sha>
#
# Exits 0 when the run succeeds and 1 when it fails, is stopped, cancelled or
# superseded, or is still running after MAX_WAIT_SECONDS. Writes a link to the run
# into the GitHub job summary when GITHUB_STEP_SUMMARY is set.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <pipeline-name> <commit-sha>" >&2
  exit 2
fi

PIPELINE="$1"
SHA="$2"
REGION="${AWS_REGION:-ap-southeast-1}"
SOURCE_ACTION="${SOURCE_ACTION:-CodeConnections}" # the pipeline's source action name
POLL_SECONDS="${POLL_SECONDS:-20}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-3000}"

codepipeline() { aws codepipeline --region "$REGION" "$@"; }

id="$(codepipeline start-pipeline-execution --name "$PIPELINE" \
  --source-revisions "actionName=${SOURCE_ACTION},revisionType=COMMIT_ID,revisionValue=${SHA}" \
  --query pipelineExecutionId --output text)"
url="https://${REGION}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${PIPELINE}/executions/${id}/timeline?region=${REGION}"

echo "Started ${PIPELINE} at ${SHA}: execution ${id}"
echo "$url"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "CodePipeline **${PIPELINE}** at \`${SHA}\`: [execution ${id}](${url})" >>"$GITHUB_STEP_SUMMARY"
fi

waited=0
last=""
while :; do
  status="$(codepipeline get-pipeline-execution --pipeline-name "$PIPELINE" --pipeline-execution-id "$id" \
    --query pipelineExecution.status --output text)"
  if [ "$status" != "$last" ]; then
    echo "$(date -u +%H:%M:%S) ${status}"
    last="$status"
  fi
  case "$status" in
    Succeeded)
      [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "Result: **Succeeded**" >>"$GITHUB_STEP_SUMMARY"
      exit 0
      ;;
    Failed | Stopped | Cancelled | Superseded)
      echo "Pipeline run ended with status ${status}. Failed actions:" >&2
      codepipeline list-action-executions --pipeline-name "$PIPELINE" --filter "pipelineExecutionId=${id}" \
        --query "actionExecutionDetails[?status=='Failed'].[stageName,actionName,output.executionResult.externalExecutionSummary]" \
        --output text >&2 || true
      [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "Result: **${status}**" >>"$GITHUB_STEP_SUMMARY"
      exit 1
      ;;
  esac
  if [ "$waited" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "Still ${status} after ${MAX_WAIT_SECONDS}s; giving up waiting (the run itself goes on): ${url}" >&2
    exit 1
  fi
  sleep "$POLL_SECONDS"
  waited=$((waited + POLL_SECONDS))
done
