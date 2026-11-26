# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
It holds what every change needs. Area rules are in `web/CLAUDE.md` and `infra/CLAUDE.md`; detail
is in `docs/`. Use **Before you change…** below to find what to read first.

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
npm run lint                   # oxlint (.oxlintrc.json)

# Web app (web)
npm run dev                    # Vite on http://localhost:5173 (needs web/public/config.json)
                               # /playground.html: preview viewers with sample files, no AWS (dev only)
                               # /playground.html?view=landing | ?view=denied: the sign-in and access-denied pages
                               # /playground.html?view=drive: the real drive screen (DriveView + every feature) with mock data,
                               #   including Import from Google Drive with fake Google (&google=off: not set up); one
                               #   in-memory drive holds all state, so imports, moves, deletes and edits show everywhere;
                               #   mock-bucket requests via fetch, XMLHttpRequest and <img src> are all answered from it
                               #   (installS3FetchStub in src/playground/mockDrive.ts)
                               #   &access=read | read%2Bpersonal | write | write%2Bpersonal%2Btrash: preview another
                               #   access level (default: everything, including the Deleted folder)
                               #   &count=fail: folder listings through the storage seam fail (fallback pager); Global/photos has 250 files
                               #   Global/linh/shopping list.txt (BOM + CRLF) is editable with Edit in the ⋮ menu
npm test                       # vitest
npm run build                  # tsc --noEmit + vite build
npm run lint                   # oxlint (.oxlintrc.json), --deny-warnings: any warning fails it

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

The linter is oxlint, not ESLint: TypeScript 7 has no compiler API for typescript-eslint
([ADR 0016](docs/adr/0016-pull-request-checks-on-github-actions-with-oxlint.md)). The Lambdas run
on `nodejs22.x`; the web build and tests need Node ≥ 22.12.

## Architecture in brief

Full design: [`docs/architecture/system-design.md`](docs/architecture/system-design.md).

1. The browser loads the React SPA from CloudFront (private web bucket, Origin Access Control).
2. The SPA signs in with Cognito managed login; Google is the only identity provider.
3. An Identity Pool exchanges the Cognito token for temporary AWS credentials.
4. The SPA talks **directly to S3** with them, through AWS's Storage Browser component and our
   own `DriveStorage` (`web/src/storage/`).

**IAM is the security boundary** (`infra/identity.tf`). The authenticated role allows only
`Global/*` (everyone reads; writing needs the session tag `global_access` = `write`), the
caller's own `Personal/${aws:PrincipalTag/email}/*` (needs `personal` = `yes`) and `Deleted/`
(writers may only `PutObject` into their part; `trash` = `yes` lists, reads and purges). Tags come
from ID-token claims the pre token generation trigger adds; a missing tag fails the condition,
so the fallback is read-only. Folders are keyed by email
([ADR 0009](docs/adr/0009-personal-folders-keyed-by-email.md)). Every app role has the
permissions boundary `family-drive-boundary` (#53).

The SPA only hides what IAM would refuse, and **one module answers "who can do what where"**:
`web/src/locationPolicy.ts`. Never re-derive access elsewhere. Its table test is checked by hand
against `infra/identity.tf`: change both together.

**Allowlist** (`functions/allowlist/`): pure rules in `allowlist.ts` (case-insensitive, trims,
requires `email_verified`, empty list denies everyone), used by two Cognito triggers. Pre
token generation runs on every sign-in and refresh, so removing an email takes effect. Both deny
by throwing `Error("ACCESS_DENIED")`, and `web/src/authErrors.ts` matches the same string to show
the access-denied page: **keep the string identical in both places.** Access levels are the SSM
JSON `String` `/family-drive/access`; adding a flag touches every layer
([checklist](docs/features/auth-and-access.md#id-token-claims-and-principal-tags)).

**Two Terraform stacks:** `infra/foundation/` is retained (`prevent_destroy`, data and SSM) and
applied only through `bootstrap.sh`; `infra/` is the disposable app stack and finds foundation
resources by name. Rules in [`infra/CLAUDE.md`](infra/CLAUDE.md).

**Config flow:** Terraform outputs → `scripts/write-config.sh` → `web/public/config.json`
(git-ignored, never hard-coded) → `loadConfig()` → `toAmplifyOutputs()`, built by hand: Amplify JS
is only a client library, with no Amplify backend tooling.

**Pull-request checks** (GitHub Actions, `.github/workflows/ci.yml`, no AWS access): lint,
type-check, test and build both packages, Terraform `fmt -check` and offline `validate`. Dependabot
(`.github/dependabot.yml`) opens weekly update PRs for the pinned actions and both packages; the
same checks run on each.

**CI/CD** (AWS CodePipeline): `ci/pipeline.sh` tests, builds, applies `infra/` and runs
`scripts/deploy.sh`; `ci/destroy-app.sh` (manual pipeline) destroys the app stack only; the
foundation pipeline runs `bootstrap.sh`. **A new AWS resource type adds its actions to the
matching `ci/iam/*-policy.json`**, or the pipeline fails with AccessDenied.

## Before you change…

Read these first. Every change also follows the
[Architecture Contract](docs/architecture/architecture-contract.md), whose checklist goes in the
PR description.

| Area | Code | Read |
|---|---|---|
| Sign-in, allowlist, access flags, IAM | `functions/allowlist/`, `infra/auth.tf`, `infra/identity.tf`, `web/src/access.ts`, `web/src/locationPolicy.ts` | [auth-and-access.md](docs/features/auth-and-access.md), ADR 0003, 0009, 0010 |
| Personal folders | `web/src/locationPolicy.ts`, `infra/identity.tf` | [personal-folders.md](docs/features/personal-folders.md), ADR 0009 |
| Drive screen, look, sidebar, **+ New**, file list, drive host, drive storage | `web/src/driveHost/`, `web/src/fileList/`, `web/src/theme/`, `web/src/storage/`, `web/src/styles.css` | [drive-ui.md](docs/features/drive-ui.md), [`web/CLAUDE.md`](web/CLAUDE.md), ADR 0002, 0015 |
| Upload, download, Copy, Move, Edit, pager | `web/src/move/`, `web/src/edit/`, `web/src/pagination/` | [global-drive.md](docs/features/global-drive.md) |
| Delete, Restore, Deleted folder, auto-empty | `web/src/trash/`, `infra/foundation/files.tf` | [deleted-folder.md](docs/features/deleted-folder.md), ADR 0011, 0012 |
| File preview | `web/src/preview/` | [file-preview.md](docs/features/file-preview.md) |
| Import from Google Drive | `web/src/googleImport/` | [google-import.md](docs/features/google-import.md), ADR 0008 |
| Buckets, versioning, lifecycle, storage classes | `infra/foundation/` | [storage-and-retention.md](docs/features/storage-and-retention.md), ADR 0004, 0013 |
| CloudFront, CSP, custom domain, CORS | `infra/web.tf`, `infra/storage.tf` | [system-design.md](docs/architecture/system-design.md), ADR 0014, [security assessment](docs/security/assessment-2026-11.md) |
| Pipelines, deploy, pipeline IAM, pull-request checks, lint rules | `ci/`, `scripts/`, `.github/workflows/`, `*/.oxlintrc.json` | [system-design.md §5](docs/architecture/system-design.md#5-deployment-design), [deployment.md](docs/deployment.md), [`infra/CLAUDE.md`](infra/CLAUDE.md) |
| PWA, manifest, icons | `web/public/`, `web/index.html` | ADR 0007 (no app service worker or offline cache) |

## Conventions

- In bash scripts, never write `export X="$(cmd)"`. `export` hides a failing command even under
  `set -e`. Assign first, then export.
- `.gitattributes` forces LF for `*.sh`, so scripts keep working after a Windows checkout.
- Secrets never go in the repository: values go to SSM or the environment's secrets.

## Docs

The project uses Matt Pocock's skills (`mattpocock-skills`), not superpowers (turned off in
`.claude/settings.json`). Docs follow their layout:
- **`docs/architecture/`**: the TOGAF-style architecture (`architecture-definition.md`,
  `architecture-requirements.md`), the **Architecture Contract** (`architecture-contract.md`) and
  `system-design.md` (components and which file implements each, request path, trust boundaries,
  config flow, deployment). Update `system-design.md` when a component, the config flow or the
  pipelines change.
- **`docs/features/`**: one technical doc per feature, with the same sections each. Update a
  feature's doc in the same PR as any change to that feature.
- **`docs/adr/`**: architecture decisions (`NNNN-slug.md`). Read the ones touching an area
  before changing it, and say so explicitly if a change contradicts one.
- **`docs/guides/setup-from-scratch.md`**: setup step by step; update it when a setup step
  changes. **`docs/deployment.md`**: operating it (day-to-day, troubleshooting, the end-to-end
  checklist).
- **`GLOSSARY.md`** at the root: the project's terms (locations and their kinds, access flags,
  capabilities).
- **`CLAUDE.md` files** hold rules, not explanations: put the explanation in the matching doc
  and keep a one-line rule or pointer here. A rule for one area goes in that area's `CLAUDE.md`.
- **Specs and plans are tickets in the issue tracker**, not files in `docs/`.
- **`docs/agents/`**: where issues live and how they're labelled, written by
  `/setup-matt-pocock-skills`.

## Agent skills

### Issue tracker

Issues and specs are GitHub issues on `hualinh1012/personal-storage`, managed with `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
