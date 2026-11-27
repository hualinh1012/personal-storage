# GitHub Actions starts the CodePipelines, signed in with OIDC

Until now CodePipeline decided when to deploy. A push to `main` started the pipelines directly, whether or not
the GitHub checks ([ADR 0016](0016-pull-request-checks-on-github-actions-with-oxlint.md)) had passed.
Approvals were clicked in the CodePipeline console. The foundation and app pipelines could run side by side.
The app pipeline in the console had also grown a destroy stage behind a disabled transition, which #52 forbids.

Now **GitHub Actions decides when, and CodePipeline still does the deploying** (#92):

- **Three CodePipelines**, none started by a push and none with an approval stage, execution mode `QUEUED`:
  foundation (`infra/foundation/bootstrap.sh`), deploy (`ci/pipeline.sh`) and destroy (`ci/destroy-app.sh`).
  Destroy is its own pipeline, never a stage of deploy.
- **`.github/workflows/deploy.yml`**, on every push to `main` (docs-only pushes skipped) and by hand:
  1. it runs `ci.yml`, now also a reusable workflow, on the pushed commit;
  2. if `infra/foundation/**` changed, it waits for approval in the GitHub Environment `foundation`, then starts
     the foundation pipeline and waits for it to finish;
  3. it waits for approval in `app`, then starts the deploy pipeline the same way.
  `ci/start-pipeline.sh` starts each run **at the exact commit CI checked** (a source revision override)
  and fails the job if the run fails. A manual run can deploy an older commit of `main` (rollback), never a
  commit that isn't on `main`.
- **`.github/workflows/destroy.yml`**, manual only: a typed confirmation, then approval in `destroy`.
- **Approvals are GitHub Environments**: the owner is the only required reviewer, self-review is allowed
  (single maintainer), and each environment accepts only `main`.
- **No AWS key in GitHub.** Jobs sign in with GitHub's OIDC token. `ci/iam/github-trigger-roles.sh`
  creates three roles: `family-drive-gh-foundation`, `-deploy` and `-destroy`. Each trusts only
  `repo:hualinh1012@25895272/personal-storage@1445087687:environment:<its environment>` and may only start
  and watch its own pipeline. A job that uses an environment presents `…:environment:<name>` as its OIDC
  subject, not the branch, so the trust names the environment. The repository uses GitHub's **immutable
  subjects**: the owner and repository are named by ID as well, so a renamed, deleted or re-created
  repository with the same name can't match. The script asks GitHub for that prefix
  (`actions/oidc/customization/sub`) rather than building it from the name.
- `deploy.yml` and `destroy.yml` share the concurrency group `aws-app`: one AWS change at a time, and a
  running one is never cancelled.

## Considered and rejected

- **Static access key and secret in GitHub secrets.** They're long-lived and have to be rotated, and they
  work from anywhere once leaked. OIDC costs nothing and can't be used outside this repository's environments.
- **Running Terraform directly in GitHub Actions.** It would drop CodePipeline, but the deploy permissions
  (S2/S3 in the [security assessment](../security/assessment-2026-11.md)) would move to roles that GitHub
  assumes. Today a compromised GitHub can only start a pipeline at a commit that is on `main`, after the
  owner approves.
- **Keeping the manual approvals in CodePipeline.** The GitHub job would wait while someone approves in the
  console. With approvals in GitHub, there's one place to approve and the pipelines just run.

## Consequences

- Partly supersedes ADR 0016: GitHub Actions now has AWS access, but only through the three trigger roles.
  `ci.yml` itself still has none.
- `ci.yml` no longer runs on push to `main` by itself; `deploy.yml` calls it. A docs-only push to `main`
  runs no checks and deploys nothing.
- Every app deploy now needs an approval click, which the old app pipeline didn't. A foundation change asks
  twice, foundation first, then app.
- The pipelines are still defined in the console, not in code. Their names are GitHub repository variables
  (`FOUNDATION_PIPELINE`, `DEPLOY_PIPELINE`, `DESTROY_PIPELINE`, defaulting to `family-drive-*`), with
  `AWS_ACCOUNT_ID`. They aren't secrets.
- Starting a pipeline by hand in the console (**Release change**) still works and skips GitHub: whoever can
  do that is already an AWS administrator.
