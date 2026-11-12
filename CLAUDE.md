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
                               # /playground.html: preview viewers with sample files, no AWS (dev only)
                               # /playground.html?view=drive: the real drive screen (DriveView) with mock data,
                               #   including Import from Google Drive with fake Google/S3 (&google=off: not set up)
                               #   &access=read | read%2Bpersonal | write | write%2Bpersonal%2Btrash: preview another
                               #   access level (default: everything, including the Deleted folder)
                               #   &count=fail: the pager's folder count fails (fallback pager); Global/photos has 250 files
                               #   Global/linh/shopping list.txt (BOM + CRLF) is editable with Edit in the ⋮ menu
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
allows S3 access only to `files-bucket/Global/*` (the shared drive) and to the caller's own
personal folder `Personal/${aws:PrincipalTag/email}/*`, and listing only for those prefixes.
The Identity Pool maps the ID token's `email` claim to that session tag
(`aws_cognito_identity_pool_provider_principal_tag`). Folders are keyed by email, not
identity ID, so they survive recreating the app stack ([ADR 0009](docs/adr/0009-personal-folders-keyed-by-email.md)).
The SPA builds the prefix lower-cased (`personalPrefix()` in `web/src/config.ts`); IAM compares
it with the raw claim, which Google sends lower-case.

Per-person access levels ([ADR 0010](docs/adr/0010-per-person-access-levels-in-ssm.md)) use the
same mechanism. Everyone can list and read `Global/`; writes there need the session tag
`global_access` = `write`, and every personal-folder statement needs `personal` = `yes`. Both
tags come from ID-token claims the pre token generation trigger adds. A missing tag fails the
condition, so the fallback is read-only. The SPA reads the same claims (`web/src/access.ts`)
only to hide what IAM would refuse: a read-only `Global/` location gets Storage Browser
permissions `["get", "list"]`, Move and Google import hide without `write`, and Home lists the
personal folder only when `personal` is `yes`.

The Deleted folder ([ADR 0011](docs/adr/0011-delete-moves-to-a-deleted-folder.md)) adds a
third tag, `trash`. Writers may `PutObject` into the matching part of `Deleted/`
(`Deleted/Global/*`, `Deleted/Personal/<own email>/*`) but not list or read it; only
`trash` = `yes` lists, reads and deletes there, including every version.

### Allowlist enforcement spans three places
- `functions/allowlist/src/allowlist.ts` holds the pure logic: case-insensitive matching, ignores surrounding whitespace, requires `email_verified`, and an empty list denies everyone.
- Two Cognito triggers use it:
  - **Pre sign-up** allows only `PreSignUp_ExternalProvider`.
  - **Pre token generation** runs on every sign-in and token refresh, so removing an email takes effect.
- Both triggers deny by throwing `Error("ACCESS_DENIED")`. Cognito puts that text in the redirect's `error_description`, and `web/src/authErrors.ts` matches the same string to show the access-denied page. **Keep the string identical in both places.**
- The allowlist reaches the Lambdas as env `ALLOWED_EMAILS`. It's built in Terraform from the SSM parameter `/family-drive/allowed_emails` (StringList).
- Access levels: SSM `/family-drive/access` is a **JSON `String`** (not StringList: JSON has commas), e.g. `{"a@x.com": {"global": "write", "personal": true, "trash": true}}`. Unlisted allowlisted emails get read-only `Global/`, no personal folder and no Deleted folder.
  - `functions/allowlist/src/access.ts` parses it (lower-cased keys; rejects bad JSON, unknown keys, bad values and the same email twice in different case) and turns it into string claims `global_access` (`read`/`write`), `personal` and `trash` (`yes`/`no`).
  - Terraform (`infra/foundation_inputs.tf`) checks the same rules in preconditions, plus that every email is allowlisted, and passes a normalized `jsonencode` to pre token generation as env `ACCESS_LEVELS`.
  - Adding a flag means: the parser's `FLAGS`, Terraform's `access_flags` and normalized object, a claim, a principal tag mapping, an IAM condition, and `web/src/access.ts`.

### Two Terraform stacks
- **`infra/foundation/` is retained.** It holds the state bucket, the files bucket (with versioning and lifecycle rules) and the SSM parameters. Every resource has `prevent_destroy`.
  - Files under `Global/` and `Personal/` move to Intelligent-Tiering via lifecycle; `Deleted/` stays Standard. Never add an `aws_s3_bucket_intelligent_tiering_configuration` or a Glacier class: archived objects break download, preview, Move and Delete ([ADR 0013](docs/adr/0013-files-in-intelligent-tiering-without-archive-tiers.md)).
  - Apply it only through `infra/foundation/bootstrap.sh`. The first run uses local state and then migrates it into the bucket it just created. The script also imports pre-existing parameters and buckets.
  - The SSM parameters are created with a `CHANGE_ME` placeholder and `ignore_changes` on their value, so Terraform never overwrites real values.
- **`infra/` is the app stack and is disposable:** Cognito, the Lambdas, the Identity Pool, CloudFront, the web bucket, and the files bucket's CORS rule.
  - It finds foundation resources **by naming convention through data sources** (`infra/foundation_inputs.tf`), not through remote state.
  - A `terraform_data` precondition stops the plan while the SSM values are placeholders or not email addresses, or `access` is invalid.
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

- Drive layout (`web/src/styles.css`): the page never scrolls; the file list and preview panel each scroll vertically, nothing scrolls sideways; phones hide Type/Last modified and show the preview full-width. These rules target Storage Browser's `amplify-storage-browser__*` classes, so re-check `?view=drive` in the playground after upgrading `@aws-amplify/ui-react-storage`.
- Upload is both in Storage Browser's ⋮ menu and a top-bar button (owner's choice). Keep `StorageBrowser` **uncontrolled**: with `value`/`onValueChange` it only reports changes to its internal state, so a view opened from outside never reports its Exit. The button remounts the browser (`key`) with `defaultValue` `{ location, actionType: "upload" }` instead.
- **Move** is a custom Storage Browser action (`web/src/move/`): `moveFile.ts` holds the rules (no overwrite, delete the original only after a successful copy, reasons for failures) with injected S3 ops; `moveAction.ts` wires them to Storage Browser's own copy/delete handlers and `@aws-amplify/storage/internals` `getProperties`; `MoveView.tsx` reuses `CopyView`'s parts (Storage Browser's Copy view is hard-wired to the copy action). Copy's destination label is overridden to the neutral "Destination" for that reason.
- A view that runs a custom action over another view's selection (Move over Copy's, Restore and Delete permanently over Delete's) must pass `useStableItems(tasks)` (`web/src/stableItems.ts`) to `useAction`, never `tasks.map(...)`: the tasks array is new every render and `useAction` resets on new items, so it loops ("Maximum update depth exceeded").
- **Delete never deletes outside `Deleted/`** (`web/src/trash/`, ADR 0011). `makeTrashActions` replaces the built-in Delete's handler with "move to Deleted" (shown where the location has `write` + `delete`) and adds Restore, Delete permanently and Empty Deleted (shown where it has `delete` without `write`, i.e. only `Deleted/`).
  - `paths.ts` maps keys to `Deleted/<path>/<name> (deleted <local time> <4 random>)<ext>` and back; `trash.ts` holds the rules (copy before delete, never restore over a file, purge every version) with injected `TrashOps`; `s3Ops.ts` implements them with `@aws-sdk/client-s3`, loaded lazily, because Amplify Storage has no version APIs.
  - Auto-empty ([ADR 0012](docs/adr/0012-deleted-folder-auto-empties-after-30-days.md)): lifecycle rules on `Deleted/` in `infra/foundation/files.tf` expire files `deleted_retention_days` (30, foundation `main.tf`) after deletion, plus noncurrent versions after 1 day and leftover delete markers. The foundation writes the number to SSM `/family-drive/deleted_retention_days` (Terraform-owned, no `ignore_changes`); the app stack reads it, `write-config.sh` puts it in `config.json` as `deletedRetentionDays`, and `trash/retention.ts` turns it into the note shown in `Deleted/`.
  - `TrashViews.tsx`: Restore and Delete permanently reuse `DeleteView`'s parts (like Move), always confirm, and list reasons for failures; Empty Deleted is its own screen, getting its ops and exit through `TrashContext`. Storage Browser's Delete table hard-codes "Deleted" in its Progress column, so the Restore view hides that column in CSS.
- **Import from Google Drive** (`web/src/googleImport/`) runs entirely in the browser (no backend, ADR 0001). It's a custom Storage Browser action plus a top-bar button (same remount trick as Upload); `GoogleImportView` gets the open folder and its exit through `GoogleImportContext` from `DriveView`, and exiting remounts the browser, which re-lists the folder.
  - Google sign-in (GIS token client) and Picker load lazily when the view opens. The token asks for `drive.readonly` ([ADR 0008](docs/adr/0008-google-drive-import-scope.md): `drive.file` can't see inside picked folders), lives only in `google.ts` memory and is sent only to Google; `driveClient.ts` is the only code calling the Drive API.
  - Pure, tested modules hold the rules: `plan.ts` (keys, `(n)` names, re-run skips, conversion targets, 500 MB cut-off; never overwrites), `listing.ts`/`prepare.ts` (recursive folder walk), `queue.ts` (3 at a time, cancel), `retry.ts`, `importFile.ts`. Google and S3 are injected through `deps.ts`, which is how the playground fakes them.
  - Gated by config: `googleImportConfig()` in `web/src/config.ts` returns null while the SSM values (`/family-drive/google_api_key`, `/family-drive/google_project_number`) are `CHANGE_ME`, and the view says it isn't set up. They're deliberately not in the deploy precondition. A CSP, if ever added, must allow `accounts.google.com`, `apis.google.com`, `docs.google.com` and `www.googleapis.com`.
- **Edit text files** (`web/src/edit/`, issue #45): a custom ⋮ action for exactly one `.txt` file up to 1 MB, hidden without `write`. `EditTextView` finds the selection through `useView("Delete")` (like Restore) and gets its ops and exit through `EditTextContext`; exiting remounts the browser, which re-lists the folder.
  - `text.ts` holds the rules (UTF-8 only, refuses invalid bytes; keeps a BOM and CRLF/LF on save); `textFile.ts` opens/saves over injected `TextFileOps`; `s3Ops.ts` uses the lazily loaded SDK (`GetObject`/`PutObject`). Saving is last-write-wins on purpose (owner's choice: family app); versioning is the undo.
  - More types (Markdown, CSV) are extensions in `EDITABLE_EXTENSIONS` plus whatever the view needs.
- **Pager** (`web/src/pagination/`) replaces Storage Browser's (`components.Pagination`) to show `Page X of N · M items`, since S3 never reports a prefix's size.
  - `folderTracker.ts` wraps the `listLocationItems` handler. A first-page listing (open folder, Refresh, back from any action) triggers a recount (`countFolder.ts`: one `listAll` LIST); stale counts are dropped. It tells search (page size ≠ 100) and Copy's destination listings (`exclude`) apart from the file list by their options.
  - `rows.ts` holds the pure rules: `countRows` mirrors Storage Browser's `parseResult` (subfolders + files, minus the folder's own placeholder and dot keys). Jumping forward re-paginates until enough rows are loaded (Storage Browser fetches one page per call). Repeated tokens get an empty page, and "done fetching" is reported on a later task so the pager never paginates with a stale token.
  - Falls back to visited pages + Next while counting, when the count fails and during search. Re-check after upgrading `@aws-amplify/ui-react-storage`.
- Storage Browser's download service worker (`public/amplify-storage-download/download-sw.js`) is copied from the package by `npm run copy-sw` (runs before dev/build, git-ignored) and deployed with `no-cache`. Without it, downloads fall back to in-memory blobs.

- Installable as a PWA: `public/manifest.webmanifest` + head tags in `index.html`, icons in `public/icons/` generated by `web/scripts/make-icons.mjs` (committed PNGs). There is deliberately **no app service worker / offline cache** — it would fight the `no-cache` entry points. `scripts/deploy.sh` uploads the manifest (as `application/manifest+json`) and icons with `no-cache`, since their names aren't hashed.

- In bash scripts, never write `export X="$(cmd)"`. `export` hides a failing command even under `set -e`. Assign first, then export.
- `.gitattributes` forces LF for `*.sh`, so scripts keep working after a Windows checkout.
- Terraform: `>= 1.10`, AWS provider `~> 6.0`. The S3 backend uses `use_lockfile`, and the bucket name is passed as `-backend-config`.
- The Lambdas run on `nodejs22.x` (esbuild targets node22). The web build and tests need Node ≥ 22.12.
- `web/src/pages/Drive.tsx` renders Storage Browser (`@aws-amplify/ui-react-storage/browser`) with the Amplify auth adapter, opened at the `Global/` prefix via `driveLocation()` in `web/src/config.ts`. Home lists only `Global/` and the signed-in person's folder: `listDriveLocations()` replaces the adapter's `listLocations` (Amplify's own paths can only use the identity ID). Create the browser after `Amplify.configure` (the adapter reads the storage config when built), never at module level.
- File preview (the panel beside the list) uses Storage Browser's `filePreview` option. Image, video and text use its built-in viewers; extra types are entries in `web/src/preview/registry.ts` (extensions/content types → viewer component). One limit, `MAX_PREVIEW_BYTES` (50 MB, in **bytes** despite the library docs saying KB), applies to every type; the "too big" wording is `previewDisplayText`, passed to `StorageBrowser` as `displayText`. PDF uses `react-pdf` (PDF.js), loaded lazily through `PdfPreviewLazy.tsx` so it stays out of the main bundle; it fetches the bytes because the pre-signed URL is `Content-Disposition: attachment` (an iframe would download), and `scripts/deploy.sh` uploads `.mjs` (the PDF.js worker) as `text/javascript`. Markdown: `MarkdownPreview.tsx` renders with `react-markdown` + `remark-gfm` (tables, checklists) using `skipHtml`, the default URL sanitising and images shown as links — keep those when touching it, since rendered files run in every family member's browser.

## Docs

`docs/` holds project documentation. Start with `docs/deployment.md`, the AWS setup runbook
(pipelines, IAM policies, SSM values, Google OAuth redirect, troubleshooting). Update it when
the deployment steps change.

The project uses Matt Pocock's skills (`mattpocock-skills`), not superpowers (turned off in
`.claude/settings.json`). Docs follow their layout:
- **`docs/adr/`**: architecture decisions (`NNNN-slug.md`). Read the ones touching an area
  before changing it, and say so explicitly if a change contradicts one.
- **`GLOSSARY.md`** at the root: the project's terms. Created when the first term is settled.
- **Specs and plans are tickets in the issue tracker**, not files in `docs/`.
- **`docs/agents/`**: where issues live and how they're labelled, written by `/setup-matt-pocock-skills`.

## Agent skills

### Issue tracker

Issues and specs are GitHub issues on `hualinh1012/personal-storage`, managed with `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
