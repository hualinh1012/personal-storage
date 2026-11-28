# Deploys run only by hand

Amends [0017](0017-github-actions-starts-codepipeline-with-oidc.md): `.github/workflows/deploy.yml` no longer
runs on a push to `main`. The owner wants a merge to change nothing in AWS until they choose to deploy.

## Decision

- `deploy.yml` has only the `workflow_dispatch` trigger. **Actions → Deploy app → Run workflow**, with a
  target (`application`, `foundation-then-application`, `foundation`) and optionally an older commit of
  `main`, is the only way GitHub deploys. The GitHub Environment approvals stay.
- Everything else in ADR 0017 holds: OIDC trigger roles, no push trigger or approval stage on any
  CodePipeline, `destroy.yml` manual with its typed confirmation.

## Consequences

- A merge to `main` runs no workflow at all; `ci.yml` checks the commit when someone runs Deploy app.
- The foundation no longer runs because `infra/foundation/**` changed: whoever deploys picks a target
  that includes it.
- `main` can be ahead of what is deployed for as long as nobody runs Deploy app.
