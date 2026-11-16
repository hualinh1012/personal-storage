# Operating Family Drive on AWS

Day-to-day operations, troubleshooting and the end-to-end test checklist for a running Family Drive.
**Setting it up from scratch** is a separate, step-by-step guide: [docs/guides/setup-from-scratch.md](guides/setup-from-scratch.md).

- **Account:** `084519186805`
- **Region:** `ap-southeast-1` (Singapore)
- **Project prefix:** `family-drive`

## How it fits together

There are two Terraform stacks and three pipelines.

| Stack | Folder | Holds | Lifetime |
|---|---|---|---|
| **Foundation** | `infra/foundation/` | Terraform state bucket, files bucket (the family's files), SSM parameters | **Retained.** Every resource has `prevent_destroy`. |
| **App** | `infra/` | Cognito + Google sign-in, allowlist Lambdas, Identity Pool, CloudFront, web bucket, files bucket CORS rule | **Disposable.** Can be destroyed and recreated. |

| Pipeline | Runs | Trigger |
|---|---|---|
| Foundation | `infra/foundation/bootstrap.sh` | Push to `main` touching `infra/foundation/**` |
| App deploy | `ci/pipeline.sh` | Push to `main`, excluding `infra/foundation/**` |
| App destroy (optional) | `ci/destroy-app.sh` | Manual only, after an approval |

Both stacks keep their state in `s3://family-drive-tfstate-084519186805`:
- the foundation at `foundation/terraform.tfstate`;
- the app at `family-drive/terraform.tfstate`.

Order matters: **the foundation must exist before the app pipeline runs.**

## This deployment

Set up by following the [setup guide](guides/setup-from-scratch.md). Values specific to this account:

| | |
|---|---|
| Foundation pipeline role | `CodePipelineStarterTemplate-Terraf-CodePipelineRole-lvPDiLLs7PoE` |
| App pipeline role | `CodePipelineStarterTemplate-Terraf-CodePipelineRole-Rlc9BkIMwwfd` |
| Cognito domain | `family-drive-084519186805.auth.ap-southeast-1.amazoncognito.com` |
| Files bucket | `family-drive-files-084519186805` |

## Day-to-day

**Add or remove a family member:**
1. Edit `/family-drive/allowed_emails` in SSM.
2. Re-run the app pipeline (**Release change**).
3. While the OAuth consent screen is in **Testing** (always, once Google Drive import is set up), also add or
   remove them under **Google Auth Platform → Audience → Test users**. Google blocks sign-in for anyone not listed.

A removed person loses access within about **2 hours**: ID and access tokens are set to last 60 minutes, and the AWS credentials obtained with them up to another hour. Every token refresh re-checks the allowlist. To cut them off sooner, also delete their user in the Cognito user pool.

When adding someone, also give them an entry in `/family-drive/access` if they need more than read-only ([setup step 6](guides/setup-from-scratch.md#step-6-set-the-settings-in-ssm)); when removing them, drop their entry too, or the plan stops because the email isn't on the allowlist.

**Change someone's access level:** edit `/family-drive/access` ([setup step 6](guides/setup-from-scratch.md#step-6-set-the-settings-in-ssm)) and re-run the app pipeline. It takes effect at their next token refresh, within about 2 hours, or at once when they sign out and back in.

**Recover a deleted file:** Delete in the app moves files to the **Deleted** folder. Someone with `trash` opens Home → `Deleted/`, selects the file and uses **Restore** in the ⋮ menu. Files there stay until someone deletes them permanently or empties Deleted, or for **30 days**, after which S3 removes them with every version (ADR 0012).

**Change how long Deleted keeps files:** edit `deleted_retention_days` in `infra/foundation/main.tf` and push. Once the foundation pipeline has run, run the app pipeline so the note in `Deleted/` shows the new number. A shorter value also applies to files already there.

**Recover an overwritten file, or one deleted outside the app (within 30 days):**
```bash
aws s3api list-object-versions --bucket family-drive-files-084519186805 --prefix "Global/<path>"
```
- **Deleted file:** delete its *delete marker* (the newest version, marked `IsLatest` in the `DeleteMarkers` list).
- **Overwritten file:** copy the older version back over it.
- **Deleted permanently or emptied from Deleted:** every version under `Deleted/` is gone and can't be recovered.

**Storage cost:** files under `Global/` and `Personal/` move to S3 Intelligent-Tiering within a day or two of being uploaded, and to cheaper tiers when nobody opens them for 30 days. Only the tiers that open instantly are used (ADR 0013). Don't turn on Intelligent-Tiering's archive tiers or switch to a Glacier class: downloads, previews, Move and Delete would fail on archived files.

**Change the foundation:** edit `infra/foundation/` and push. The foundation pipeline picks it up.

**When a policy in `ci/iam/` changes:** re-run its `aws iam put-role-policy` command ([setup steps 4.2 and 7.2](guides/setup-from-scratch.md#42-give-the-pipeline-its-permissions)) **before** pushing the change that needs it. The pipelines don't update their own roles.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Terraform initialized in an empty directory` | Commands run Terraform at the repo root | Use the commands above. The scripts run Terraform in the right folder. |
| `S3 bucket "family-drive-tfstate-…" does not exist` | App pipeline ran before the foundation | Run the foundation pipeline first. |
| App plan fails: `reading SSM Parameter (/family-drive/deleted_retention_days)` … not found | The foundation hasn't been applied since auto-empty was added (ADR 0012) | Run the foundation pipeline, then the app pipeline. |
| `AccessDenied … ssm:GetParameter` / `s3:CreateBucket` / … | Policy not attached to the role the action runs as | Attach the matching file from `ci/iam/`. |
| Plan stops: `…still the CHANGE_ME placeholder` / `must be an email address` | SSM values not set | Do [setup step 6](guides/setup-from-scratch.md#step-6-set-the-settings-in-ssm). |
| Plan stops: `SSM /family-drive/access must be a JSON object…` / `Every entry in SSM /family-drive/access…` / `…same email more than once` / `…must also be in /family-drive/allowed_emails` | `access` not set, or not in the format of [setup step 6](guides/setup-from-scratch.md#step-6-set-the-settings-in-ssm) | Fix the value ([setup step 6](guides/setup-from-scratch.md#step-6-set-the-settings-in-ssm)). Check the JSON with `jq . access.json`. |
| Everyone suddenly read-only, no personal folders | `access` is `{}` or misses them, or the app was deployed before it was set | Set `access` ([setup step 6](guides/setup-from-scratch.md#step-6-set-the-settings-in-ssm)), re-run the app pipeline, then sign out and back in. |
| A person can't upload or delete in the shared drive, or has no personal folder on Home | That's their access level in `access` | Change it (Day-to-day). |
| Nobody sees `Deleted/` on Home | No one has `"trash": true` in `access`, or they haven't signed in again since | Set it ([setup step 6](guides/setup-from-scratch.md#step-6-set-the-settings-in-ssm)), re-run the app pipeline, sign out and back in. |
| Delete fails with "Couldn't move it to Deleted (AccessDenied…)" | The app stack wasn't re-applied after this change (no `Deleted/` statements or `trash` tag mapping) | Re-run the app pipeline. |
| Restore says the file "was in <email>'s personal folder, which only they can write to" | Trash managers can't write into other people's personal folders | Give that person `trash` for a moment, or move it back in the console (strip ` (deleted …)` from the name). |
| Stage fails but the action "Didn't run" | The action couldn't start: missing log or artifact permissions, or wrong input artifact | Check the stage error. The `CommandsActionLogs` and `PipelineArtifacts` statements cover the usual cases. |
| `cognito-identity:SetPrincipalTagAttributeMap` / `GetPrincipalTagAttributeMap` AccessDenied | The app pipeline role has a policy from before personal folders | Re-attach the current `ci/iam/app-pipeline-policy.json`. |
| AccessDenied opening your own personal folder | The Identity Pool's principal tag mapping is missing (stack not re-applied), or the account's email has capitals in its claim | Re-run the app pipeline; check the `email` claim in the ID token is lower case (ADR 0009). |
| `iam:PassRole on … family-drive-authenticated` | Older policy limited PassRole with `iam:PassedToService`, which Cognito Identity doesn't send | Re-attach the current `ci/iam/app-pipeline-policy.json`. |
| `Node >= 22.12 required` | The Commands image has an older Node | Install a newer Node in the commands before running the script. |
| Google shows `redirect_uri_mismatch` | [Setup step 8](guides/setup-from-scratch.md#step-8-finish-google-sign-in) not done, or the Cognito domain changed after the app was recreated | Add the current `https://<cognito_domain>/oauth2/idpresponse` ([setup step 8](guides/setup-from-scratch.md#step-8-finish-google-sign-in)). Google's error details page shows the exact URI it received. |
| Google says the account can't access the app (consent screen in Testing) | The account isn't a test user | Add it under **Test users** ([setup step 5](guides/setup-from-scratch.md#step-5-google-oauth-client-and-consent-screen); publishing isn't an option once Google Drive import is set up). |
| Import from Google Drive: `Error 400: origin_mismatch` | The site isn't an **Authorized JavaScript origin** on the OAuth client | Add `https://<id>.cloudfront.net` exactly, no trailing slash ([setup step 10](guides/setup-from-scratch.md#step-10-optional-google-drive-import)). |
| Import from Google Drive: Picker says "The API developer key is invalid" | The API key's website restriction doesn't include the site (Picker reports it as an invalid key) | Add `https://<id>.cloudfront.net/*` to the key's **Websites** restriction ([setup step 10](guides/setup-from-scratch.md#step-10-optional-google-drive-import)). |
| Import from Google Drive says "isn't set up yet" | The two Google SSM values are still `CHANGE_ME`, or the app pipeline hasn't run since they were set | Set them and re-run the app pipeline ([setup step 10](guides/setup-from-scratch.md#step-10-optional-google-drive-import)). |

## Using the drive

- The drive shows only what's under the **`Global/`** prefix of `family-drive-files-084519186805` (the shared drive, opened by default), for people who have one their own **`Personal/<email>/`** folder, and for trash managers the **`Deleted/`** folder. Click **Home** in the path to switch between them. Those are the only places signed-in users can read or write. Files uploaded elsewhere in the bucket (for example the root) won't appear: move them under `Global/`.
- **Access levels** (SSM `/family-drive/access`, ADR 0010): with read-only access to the shared drive, Upload, Import, Create folder, Delete and Move are hidden there, and S3 refuses them anyway. A personal folder is always fully writable by its owner.
- **Personal folders** are private in the app: only their owner can open them, enforced by IAM (ADR 0009). The account owner still sees them in the S3 console. The folder name is the email in lower case; to give someone files privately, upload them to `Personal/<their email>/` in the console. When someone leaves the allowlist their folder stays in S3, unreachable from the app; delete it in the console if it's no longer needed (versioning keeps deleted files for 30 days).
- The file browser (Storage Browser) lists, uploads (including large files and folders), creates folders, downloads, copies and deletes. Everyone on the allowlist shares the same files; those with write access can delete them; overwritten files can be recovered for 30 days (see Day-to-day).
- **Delete** never removes a file straight away: it moves it (or every file in a folder) to the **Deleted** folder, keeping its path and adding ` (deleted <date time> <code>)` to the name (ADR 0011). Only people with `trash` see `Deleted/` on Home; there the ⋮ menu offers **Restore** (back where it was, never over a file that's there now), **Delete permanently** (gone with every version, can't be undone) and **Empty Deleted**. Each asks to confirm. Files over 5 GB can't be deleted from the app (S3's single-copy limit, as for Move).
- Click a file name to preview it in a panel beside the list: photos, videos (streamed), text files, Markdown (`.md`, shown formatted, including tables and checklists; raw HTML in the file is ignored and images appear as links) and PDFs (page by page, with Previous/Next; the PDF viewer loads the first time a PDF is opened). Other types show a download button. Files over **50 MB** aren't previewed (any type): the panel says "File is too big to preview" and offers the download.
- **Move** (in the ⋮ menu, with files selected) moves files to another folder: pick the destination like Copy (click `Global` in the destination path to go up), then Move. A file is never overwritten: if the destination already has a file with that name, that file isn't moved. The original is deleted only after the copy succeeds. Failed files are listed with the reason. Folders can't be moved yet.
- **Edit** (in the ⋮ menu, with one `.txt` file up to 1 MB selected, where you have write access) opens the file in a plain-text editor; **Save** writes it back. The last save wins: if two people edit the same file, the later save replaces the earlier one, which stays recoverable as an older version for 30 days (see Day-to-day). Files must be UTF-8; the file's line endings are kept.
- **On a phone**, the drive can be added to the home screen and then opens full-screen like an app. Android (Chrome): ⋮ → **Add to Home screen** / **Install app**. iPhone (Safari): Share → **Add to Home Screen**. It still needs the internet; nothing is stored offline.
- Both foundation buckets refuse any request that isn't over HTTPS.

## Local development

Running the app locally against the deployed backend is [setup step 11](guides/setup-from-scratch.md#step-11-local-development-against-the-real-backend).

Tests: `npm test --prefix functions/allowlist` and `npm test --prefix web`.

**Preview playground (no AWS needed):** with `npm run dev --prefix web` running, open `http://localhost:5173/playground.html`. It renders this app's own preview viewers (Markdown, PDF) and the too-big message with sample files. It's dev-only and not in the production build. `playground.html?view=drive` shows the real drive screen with sample folders and files, for checking layout; previews there show an error because there is no real S3. Add `&access=read`, `&access=read%2Bpersonal`, `&access=write` or `&access=write%2Bpersonal%2Btrash` to preview another access level (default: everything, including the Deleted folder). Delete, Restore, Delete permanently, Empty Deleted and Edit (`linh/shopping list.txt`) work there on the sample files; a reload resets them.

## End-to-end test checklist

Run after a deploy, ideally in a private window.

- [ ] An allowlisted Google account signs in and lands in the drive, with its email in the top bar.
- [ ] A Google account not on the list sees "You don't have access to this drive." and can sign out.
- [ ] A file placed under `Global/` in S3 shows up in the list (name, last modified, size).
- [ ] Upload a small file and a large one (over 100 MB); both appear when done.
- [ ] Create folder `Tết 2026`, upload `ảnh gia đình.jpg` into it, then download it and check it opens.
- [ ] Preview a photo, a video, a `.txt` file, a `.md` file (formatted headings/lists) and a multi-page PDF (Previous/Next work); a `.docx` shows no preview but can be downloaded.
- [ ] Click a file over 50 MB (e.g. a video): the panel says "File is too big to preview" and the download button works.
- [ ] Copy a file, then delete the copy.
- [ ] Move two files into another folder; they disappear from the old folder and appear in the new one. Move one back onto a same-named file: it's refused with "already exists" and both stay.
- [ ] Select one `.txt` file and choose **Edit** in the ⋮ menu: it opens with its text (Vietnamese characters intact). Change a line and **Save**: "Saved." shows, **Back** returns to the folder with the new size, and the preview shows the change. Edit is disabled with two files or a non-`.txt` file selected, and missing in a read-only `Global/` and in `Deleted/`.
- [ ] **Deleted folder**, signed in as someone with `trash`:
  - Delete a file and a folder in `Global/`: they disappear, and appear under Home → `Deleted/Global/…` with ` (deleted …)` in each file's name. The ⋮ menu in `Global/` has no other delete.
  - In `Deleted/` the ⋮ menu offers only Download, Restore, Delete permanently and Empty Deleted.
  - Restore the file: it's back where it was and gone from `Deleted/`. Delete it again, put a file with the same name in its place, and Restore: it's refused with "already at".
  - Delete permanently a file in `Deleted/`: `aws s3api list-object-versions --bucket family-drive-files-084519186805 --prefix "Deleted/"` no longer lists any version of it.
  - Empty Deleted: `Deleted/` is empty, and so is that listing.
  - Delete a file in your personal folder: it lands in `Deleted/Personal/<your email>/`.
  - `Deleted/` shows "Files here are removed for good 30 days after they were deleted." above the list; `Global/` and your personal folder don't.
  - `aws s3api get-bucket-lifecycle-configuration --bucket family-drive-files-084519186805` lists `expire-deleted-folder` (30 days, noncurrent 1 day) and `remove-deleted-folder-delete-markers`, both with prefix `Deleted/`.
- [ ] **Intelligent-Tiering** (ADR 0013):
  - The same lifecycle listing has `intelligent-tiering-global` and `intelligent-tiering-personal` (transition to `INTELLIGENT_TIERING` at 0 days, prefixes `Global/` and `Personal/`), and nothing transitions `Deleted/`.
  - `aws s3api list-bucket-intelligent-tiering-configurations --bucket family-drive-files-084519186805` lists none: no archive tiers.
  - A day or two after the foundation apply, `aws s3api head-object --bucket family-drive-files-084519186805 --key "Global/<a file over 128 KB>"` shows `"StorageClass": "INTELLIGENT_TIERING"`. Download, preview, Move and Copy that file; all work as before.
- [ ] Signed in as someone with write access but no `trash`: Delete still works, Home doesn't list `Deleted/`, and a direct list of `Deleted/` (e.g. `list` from `aws-amplify/storage` in the console) fails with AccessDenied.
- [ ] **Home** lists `Global/` and `Personal/<your email>/` (and `Deleted/` with `trash`), nothing else. In your personal folder, upload, preview, download, move a file into a subfolder and delete it.
- [ ] Signed in as A, a direct request for B's folder is denied: in the browser console on the drive, a list of `Personal/<B's email>/` (e.g. with the `list` API from `aws-amplify/storage`) fails with AccessDenied. Or check the role with the IAM policy simulator, setting the `aws:PrincipalTag/email` context key.
- [ ] Import from Google Drive while your personal folder is open: the files land there.
- [ ] **Access levels**, with `access` set to A = `write` + personal, B = `read`, C = `read` + personal:
  - A sees Upload, Import, and Create folder/Delete/Move in the ⋮ menu in `Global/`, and has a personal folder.
  - B's Home lists only `Global/`; there the top bar has no Upload/Import and the ⋮ menu offers only Download.
  - C sees the same read-only `Global/`, but in `Personal/<C's email>/` can upload, move and delete.
  - Signed in as B or C, a direct upload or delete under `Global/` (e.g. `uploadData`/`remove` from `aws-amplify/storage` in the console) fails with AccessDenied; as B, so does listing `Personal/<B's email>/`. Or check with the IAM policy simulator, setting `aws:PrincipalTag/global_access` and `aws:PrincipalTag/personal`.
  - An allowlisted email with no entry behaves like B.
  - Change B to `write`, re-run the app pipeline, sign B out and in: B can now upload in `Global/`.
- [ ] Sign out returns to the landing page.
- [ ] On an Android phone and an iPhone, add the drive to the home screen: the icon is the blue folder, it opens without the browser bar, and Google sign-in comes back into the app (not a browser tab) and lands in the drive.
- [ ] Remove an email from SSM, re-run the app pipeline, and confirm that account is refused within about 2 hours (or at once after deleting its Cognito user).

**Import from Google Drive** (needs [setup step 10](guides/setup-from-scratch.md#step-10-optional-google-drive-import); use a test folder in Family Drive):

- [ ] From the top bar, import a few ordinary files (a photo, a PDF): Google asks for consent the first time, the Picker opens on **My Drive**, and the files appear in the open folder after **Done**.
- [ ] From the ⋮ menu, import a nested folder (a folder with a subfolder and an empty folder): the structure is recreated, the empty folder included.
- [ ] Import a Google Doc and a Google Sheet: they arrive as `.pdf` and `.xlsx` and open. A Google Form is listed as not supported.
- [ ] Run the same imports again: everything is "Already imported" and nothing new appears. Put a different file with the same name as an imported one in Google Drive and import it: it lands as `name (1).ext`.
- [ ] Start an import of something large and press **Cancel**: the rest are marked cancelled. While one runs, reloading the page asks first.
- [ ] On a phone (best-effort, not a blocker): import one photo.

## Known gaps

- No custom domain: the CloudFront link changes if the app stack is recreated. Home-screen installs point at the old link, so everyone has to re-add the app after that.
- Home-screen app on iPhone: iOS runs it separately from Safari, so you sign in once more inside it. If Google sign-in opens in Safari and doesn't come back, use the drive from Safari instead.
- Import from Google Drive runs in the browser tab: closing it stops the import (re-running picks up where it left off, skipping what's done). Files over 500 MB, and Google Docs/Sheets/Slides whose converted copy would be over about 10 MB, have to be downloaded from Google by hand. The Google token lasts about an hour, so a very long import can fail part-way; run it again.

- The IAM policies are based on the Terraform resources in this repo and haven't been exercised against every AWS provider read. If a run reports `AccessDenied` for a `Get…` or `List…` action, add that action to the matching policy file.
