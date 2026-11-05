# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Family Drive: a private, Google Drive–style file store on AWS for a family. People sign
in with Google, and only emails on an allowlist get in. Everyone shares one drive. S3 is
the only source of truth: there is **no API layer and no database**, and none should be
added to support a feature.

Region `ap-southeast-1`; resource names are prefixed `family-drive`.

## Commands

Each package has its own `package.json`. Run commands inside the package directory, or
pass `--prefix <dir>` to `npm`. Run `npm ci` in a package first; `node_modules` isn't committed.

```bash
# Cognito trigger Lambdas (functions/allowlist)
npm test                       # vitest
npm run build                  # esbuild → dist/preSignUp.js, dist/preTokenGeneration.js
npm run typecheck              # tsc -p .

# Web app (web)
npm run dev                    # Vite on http://localhost:5173 (needs web/public/config.json)
npm test                       # vitest
npm run build                  # tsc --noEmit + vite build

# Single test file / single test
npm test -- test/allowlist.test.ts
npm test -- -t "denies unverified or missing verification"
```

Terraform:

```bash
npm --prefix functions/allowlist run build        # required before ANY plan/apply/destroy of infra/
terraform fmt -check -recursive infra
terraform -chdir=infra init -backend=false && terraform -chdir=infra validate   # offline check
terraform -chdir=infra/foundation init -backend=false && terraform -chdir=infra/foundation validate
bash ci/tf-init.sh                                 # real init of infra/ against the S3 state bucket (needs AWS creds)
```

There is no linter configured.

## Architecture

### Request path (no backend)
1. The browser loads the React SPA from CloudFront. The web bucket is private and only CloudFront can read it, through Origin Access Control.
2. The SPA signs in with Cognito managed login, using Google as the only identity provider.
3. An Identity Pool exchanges the Cognito token for temporary AWS credentials.
4. The SPA uses those credentials to talk **directly to S3**, through AWS's Storage Browser component.

The Identity Pool's authenticated role (`infra/identity.tf`) is the security boundary. It
allows S3 access only to `files-bucket/drive/*`, and listing only for prefixes under
`drive/`. All family files live under `drive/`.

### Allowlist enforcement spans three places
- `functions/allowlist/src/allowlist.ts` holds the pure logic: case-insensitive matching, ignores surrounding whitespace, requires `email_verified`, and an empty list denies everyone.
- Two Cognito triggers use it:
  - **Pre sign-up** allows only `PreSignUp_ExternalProvider`.
  - **Pre token generation** runs on every sign-in and token refresh, so removing an email takes effect.
- Both triggers deny by throwing `Error("ACCESS_DENIED")`. Cognito puts that text in the redirect's `error_description`, and `web/src/authErrors.ts` matches the same string to show the access-denied page. **Keep the string identical in both places.**
- The allowlist reaches the Lambdas as env `ALLOWED_EMAILS`. It's built in Terraform from the SSM parameter `/family-drive/allowed_emails` (StringList).

### Two Terraform stacks
- **`infra/foundation/` is retained.** It holds the state bucket, the files bucket (with versioning and lifecycle rules) and the three SSM parameters. Every resource has `prevent_destroy`.
  - Apply it only through `infra/foundation/bootstrap.sh`. The first run uses local state and then migrates it into the bucket it just created. The script also imports pre-existing parameters and buckets.
  - The SSM parameters are created with a `CHANGE_ME` placeholder and `ignore_changes` on their value, so Terraform never overwrites real values.
- **`infra/` is the app stack and is disposable:** Cognito, the Lambdas, the Identity Pool, CloudFront, the web bucket, and the files bucket's CORS rule.
  - It finds foundation resources **by naming convention through data sources** (`infra/foundation_inputs.tf`), not through remote state.
  - A `terraform_data` precondition stops the plan while the SSM values are placeholders or not email addresses.
- Both stacks keep state in `family-drive-tfstate-<account>`: the app under `family-drive/`, the foundation under `foundation/`.
- `archive_file` in `infra/auth.tf` zips `functions/allowlist/dist/*.js`, so the Lambdas must be built first.

### Config flow into the SPA
1. Terraform outputs.
2. `scripts/write-config.sh` turns them into `web/public/config.json`, which is git-ignored and never hard-coded.
3. `web/src/config.ts` `loadConfig()` reads that file at runtime.
4. `toAmplifyOutputs()` builds an Amplify Gen 2–shaped outputs object by hand. The project uses Amplify JS only as a client library, with no Amplify backend tooling.

The OAuth redirect URIs (`origin + "/"`) must match the user pool client's callback and logout URLs in `infra/auth.tf` (`${app_url}/` and `http://localhost:5173/`).

### CI/CD (AWS CodePipeline, Commands actions)
- **`ci/pipeline.sh`** deploys the app. It tests and builds the Lambdas, runs the web tests, runs plan and apply on `infra/`, then runs `scripts/deploy.sh`, which builds the SPA, uploads it (hashed assets cached forever, `index.html`/`config.json` with `no-cache`) and invalidates CloudFront.
- **`ci/destroy-app.sh`** destroys the app stack only. It runs from a separate pipeline that's manual-only.
- **`infra/foundation/bootstrap.sh`** runs from the foundation pipeline with `AUTO_APPROVE=1`.
- **`ci/app-env.sh`** is shared setup that both app scripts source.
- **`ci/iam/*-pipeline-policy.json`** are the least-privilege inline policies for the pipeline roles. **When adding a new AWS resource type to either stack, add its actions to the matching policy**, or the pipeline fails with AccessDenied.

## Conventions and gotchas

- In bash scripts, never write `export X="$(cmd)"`. `export` hides a failing command even under `set -e`. Assign first, then export.
- `.gitattributes` forces LF for `*.sh`, so scripts keep working after a Windows checkout.
- Terraform: `>= 1.10`, AWS provider `~> 6.0`. The S3 backend uses `use_lockfile`, and the bucket name is passed as `-backend-config`.
- The Lambdas run on `nodejs22.x` (esbuild targets node22). The web build and tests need Node ≥ 22.12.
- `web/src/pages/Drive.tsx` renders Storage Browser (`@aws-amplify/ui-react-storage/browser`) with the Amplify auth adapter, opened at the `drive/` prefix via `driveLocation()` in `web/src/config.ts`. Create the browser after `Amplify.configure` (the adapter reads the storage config when built), never at module level.
- File preview (the panel beside the list) uses Storage Browser's `filePreview` option. Image, video and text use its built-in viewers; extra types are entries in `web/src/preview/registry.ts` (extensions/content types → viewer component, size limit in **bytes**, despite the library docs saying KB). Markdown is the first: `MarkdownPreview.tsx` renders with `react-markdown` using `skipHtml`, the default URL sanitising and images shown as links — keep those when touching it, since rendered files run in every family member's browser.

## Docs

`docs/` holds project documentation. Start with `docs/deployment.md`, the AWS setup runbook
(pipelines, IAM policies, SSM values, Google OAuth redirect, troubleshooting). Update it when
the deployment steps change.
