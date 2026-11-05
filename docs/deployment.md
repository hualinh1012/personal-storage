# Deploying Family Drive on AWS

How to stand up Family Drive in an AWS account with AWS CodePipeline. Everything is
deployed from this GitHub repo. Nothing has to run on a laptop, apart from attaching
IAM policies and setting SSM values, which you can also do in the console.

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

## 0. Prerequisites

1. **The repo on GitHub:** `hualinh1012/personal-storage`, deploying from branch `main`.
2. **A GitHub connection** in the AWS console:
   - Go to Developer Tools → Settings → Connections → **Create connection** → GitHub.
   - Install the AWS Connector GitHub App for the repo.
   - The connection must show **Available** before the pipelines can use it.
3. **Branch protection on `main`** (recommended). Anyone who can push to `main` can change the infrastructure through the pipelines.
4. **A Google OAuth client:**
   - In Google Cloud Console, go to APIs & Services → Credentials → **Create credentials** → OAuth client ID → **Web application**.
   - Keep the client ID and secret for step 2.
   - Leave **Authorized redirect URIs** empty for now. You fill it in at step 4.

## 1. Foundation pipeline

### Create the pipeline
1. Go to CodePipeline → **Create pipeline**. Choose a V2 pipeline built from scratch (or the Terraform starter template).
2. **Source stage:** GitHub (via GitHub App).
   - Pick the connection, repo `hualinh1012/personal-storage` and branch `main`.
   - Output artifact format: default.
3. **Trigger:** push, branch `main`, with a file path filter that **includes** `infra/foundation/**`.
4. Optional but recommended: add an **Approval** stage with a manual approval action.
5. **Deploy stage:** add an action of type **Commands**, with the Source artifact as its input and these commands:

   ```bash
   dnf install -y dnf-plugins-core
   dnf config-manager --add-repo https://rpm.releases.hashicorp.com/AmazonLinux/hashicorp.repo
   dnf install -y terraform-1.16.6
   terraform fmt -check -recursive infra/foundation
   AUTO_APPROVE=1 bash infra/foundation/bootstrap.sh
   ```

### Attach the IAM policy
The Commands action runs as the pipeline's service role. Attach
[`ci/iam/foundation-pipeline-policy.json`](../ci/iam/foundation-pipeline-policy.json) to it as an inline policy:

```bash
aws iam put-role-policy --role-name <foundation-pipeline-role> --policy-name family-drive-foundation --policy-document file://ci/iam/foundation-pipeline-policy.json
```

(Current role: `CodePipelineStarterTemplate-Terraf-CodePipelineRole-lvPDiLLs7PoE`.)

**If your artifact bucket isn't named `codepipeline-ap-southeast-1-*`**, edit the
`PipelineArtifacts` statement. You can find the bucket name under Pipeline → Settings → Artifact store.

**What the policy allows:**
- create and configure the two foundation buckets;
- read and write `foundation/*` in the state bucket;
- create, read and tag `/family-drive/*` parameters.

**What it doesn't allow:** deleting buckets or parameters, or reading the family's files.

### Run it
Click **Release change** (and approve, if you added an approval stage).

**What `bootstrap.sh` does:**
- **First run:** the state bucket doesn't exist yet. The script applies with local state inside the build container, then migrates the state into `s3://family-drive-tfstate-<account>/foundation/terraform.tfstate`.
- **Parameters that already exist** (for example, created by hand) are imported, and their values are kept.
- **Re-runs after a failed first run** are safe. Buckets the failed run left behind are imported, not recreated.
- **Re-runs in general** only apply changes. Terraform never overwrites SSM values.

**Check the result:** the log ends with `Apply complete!` and outputs
`files_bucket = "family-drive-files-084519186805"` and `tfstate_bucket = "family-drive-tfstate-084519186805"`.

## 2. Set the SSM values

The foundation creates the parameters with a `CHANGE_ME` placeholder. Set the real values in
Systems Manager → Parameter Store, or from a terminal. Don't paste secrets into chats or tickets.

```bash
aws ssm put-parameter --region ap-southeast-1 --overwrite --name /family-drive/google_client_id --value '<client id>'
```
```bash
aws ssm put-parameter --region ap-southeast-1 --overwrite --name /family-drive/google_client_secret --value '<client secret>'
```
```bash
aws ssm put-parameter --region ap-southeast-1 --overwrite --name /family-drive/allowed_emails --value 'you@gmail.com,mom@gmail.com'
```

| Parameter | Type | Value |
|---|---|---|
| `/family-drive/google_client_id` | String | Google OAuth client ID |
| `/family-drive/google_client_secret` | SecureString | Google OAuth client secret |
| `/family-drive/allowed_emails` | StringList | Comma-separated Google emails allowed in |

The app plan **stops on purpose** while any of these still holds `CHANGE_ME`, or if
`allowed_emails` has no valid email addresses.

## 3. App deploy pipeline

### Create the pipeline
1. **Create pipeline** (V2), with the same GitHub source, repo and branch as the foundation pipeline.
2. **Trigger:** push, branch `main`, with a file path filter that **excludes** `infra/foundation/**`.
3. **Deploy stage:** a **Commands** action with the Source artifact as its input:

   ```bash
   dnf install -y dnf-plugins-core
   dnf config-manager --add-repo https://rpm.releases.hashicorp.com/AmazonLinux/hashicorp.repo
   dnf install -y terraform-1.16.6
   bash ci/pipeline.sh
   ```

   `ci/pipeline.sh` does the following, in order:
   1. Checks Terraform and Node (it needs Node ≥ 22.12).
   2. Tests and builds the allowlist Lambdas, and runs the web tests.
   3. Runs `terraform fmt -check`, then `init` against the state bucket.
   4. Runs `plan` and `apply` in `infra/`. Terraform reads the SSM parameters itself.
   5. Writes `web/public/config.json` from the Terraform outputs and builds the web app.
   6. Uploads the build to the web bucket (hashed assets cached long-term; `index.html` and `config.json` with `no-cache`) and invalidates CloudFront.

**Don't put a Destroy stage in this pipeline.** Use the separate destroy pipeline in step 5.

### Attach the IAM policy
Attach [`ci/iam/app-pipeline-policy.json`](../ci/iam/app-pipeline-policy.json) to the app pipeline's service role:

```bash
aws iam put-role-policy --role-name <app-pipeline-role> --policy-name family-drive-app --policy-document file://ci/iam/app-pipeline-policy.json
```

(Current role: `CodePipelineStarterTemplate-Terraf-CodePipelineRole-Rlc9BkIMwwfd`.)

As with the foundation policy, adjust the `PipelineArtifacts` statement if your artifact bucket has a different name.

**What the policy allows:**
- manage the app's Cognito, Lambda, log group, CloudFront and web-bucket resources;
- create IAM roles named `family-drive-*`, attaching only the Lambda basic execution policy;
- pass the two Lambda roles only to Lambda, and the `family-drive-authenticated` role to the Identity Pool;
- read the SSM parameters;
- set CORS on the files bucket.

**What it doesn't allow:** reading or writing family files, or changing the foundation.

### Run it
Push to `main` or click **Release change**. A successful log ends with the Terraform outputs.
Note these two:
- `app_url`: the site, `https://<id>.cloudfront.net`
- `cognito_domain`: always `family-drive-084519186805.auth.ap-southeast-1.amazoncognito.com` (fixed: project name + account ID)

## 4. Finish Google sign-in

Google sends people back to **Cognito**, not to the CloudFront site. Until Google knows
Cognito's return address, sign-in fails with `Error 400: redirect_uri_mismatch`.

### Find the Cognito domain
It is fixed: `family-drive-084519186805.auth.ap-southeast-1.amazoncognito.com`, so the redirect URI below is
`https://family-drive-084519186805.auth.ap-southeast-1.amazoncognito.com/oauth2/idpresponse`.
To double-check, use the `cognito_domain` output at the end of the app pipeline log, or run this, which prints the
prefix (append `.auth.ap-southeast-1.amazoncognito.com`):

```bash
aws cognito-idp describe-user-pool --region ap-southeast-1 --user-pool-id $(aws cognito-idp list-user-pools --region ap-southeast-1 --max-results 10 --query "UserPools[?Name=='family-drive'].Id | [0]" --output text) --query UserPool.Domain --output text
```

### Configure the OAuth client
In Google Cloud Console, go to **APIs & Services → Credentials** and open the OAuth 2.0 Client ID
(Web application). It must be the same client as the one in SSM `/family-drive/google_client_id`.

1. Under **Authorized redirect URIs**, add exactly:
   ```
   https://<cognito_domain>/oauth2/idpresponse
   ```
   - It must start with `https://`.
   - Don't add a trailing slash.
   - It's the Cognito domain, not the CloudFront URL.
2. You can leave **Authorized JavaScript origins** empty.
3. Click **Save**. Google says the change can take a few minutes to a few hours. It's usually about 5 minutes.

### Check the OAuth consent screen
Go to **APIs & Services → OAuth consent screen** (or **Google Auth Platform → Audience**).

- **User type:** External.
- **Publishing status:**
  - **Testing:** only accounts listed under **Test users** can sign in. Add yourself and each family member.
  - **Published:** skips the test-user list. With only the basic scopes, Google doesn't require verification, though users may see an "unverified app" notice.
- **Scopes:** `openid`, `email`, `profile`. Nothing else.

### Test
Open `app_url` in a private window and sign in.

- **An allowlisted Google account** reaches the drive.
- **Any other account** sees "You don't have access to this drive."
- **If `redirect_uri_mismatch` persists,** click the **error details** link on Google's error page. It shows the exact `redirect_uri` that was sent; add that value to the list.

Because the Cognito domain is fixed, this redirect URI keeps working when the app stack is destroyed and
redeployed. (Deployments made before the domain was fixed used a random suffix; remove that old URI from Google.)

## 5. App destroy pipeline (optional, manual only)

Use this to take the app down without touching the files, the settings or the state.

1. **Create pipeline** (V2), with the same source.
2. In the source action, **untick "Start the pipeline on source code change"**. Remove any triggers.
3. Add an **Approval** stage with a manual approval action.
4. Add a **Destroy** stage with a **Commands** action:

   ```bash
   dnf install -y dnf-plugins-core
   dnf config-manager --add-repo https://rpm.releases.hashicorp.com/AmazonLinux/hashicorp.repo
   dnf install -y terraform-1.16.6
   bash ci/destroy-app.sh
   ```

5. Attach the same `ci/iam/app-pipeline-policy.json` to this pipeline's role.

**Running it:**
- Click **Release change**, then approve.
- It takes about 5–15 minutes, mostly waiting for CloudFront to be disabled.

**Bringing the app back:** run the app deploy pipeline again. The Cognito domain stays the same, so Google sign-in
keeps working, but the CloudFront URL changes: share the new `app_url`. A custom domain would make the link
permanent (not set up).

**There is deliberately no foundation destroy pipeline.** Removing the foundation deletes the
family's files and all Terraform state. It needs manual steps:
1. Back up the files.
2. Destroy the app.
3. Remove `prevent_destroy`.
4. Run `terraform destroy` in `infra/foundation`.

## Day-to-day

**Add or remove a family member:**
1. Edit `/family-drive/allowed_emails` in SSM.
2. Re-run the app pipeline (**Release change**).

A removed person loses access within about **2 hours**: ID and access tokens are set to last 60 minutes, and the AWS credentials obtained with them up to another hour. Every token refresh re-checks the allowlist. To cut them off sooner, also delete their user in the Cognito user pool.

**Recover a deleted or overwritten file (within 30 days):**
```bash
aws s3api list-object-versions --bucket family-drive-files-084519186805 --prefix "drive/<path>"
```
- **Deleted file:** delete its *delete marker* (the newest version, marked `IsLatest` in the `DeleteMarkers` list).
- **Overwritten file:** copy the older version back over it.

**Change the foundation:** edit `infra/foundation/` and push. The foundation pipeline picks it up.

**When a policy in `ci/iam/` changes:** re-run its `aws iam put-role-policy` command (steps 1 and 3) **before** pushing the change that needs it. The pipelines don't update their own roles.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Terraform initialized in an empty directory` | Commands run Terraform at the repo root | Use the commands above. The scripts run Terraform in the right folder. |
| `S3 bucket "family-drive-tfstate-…" does not exist` | App pipeline ran before the foundation | Run the foundation pipeline first. |
| `AccessDenied … ssm:GetParameter` / `s3:CreateBucket` / … | Policy not attached to the role the action runs as | Attach the matching file from `ci/iam/`. |
| Plan stops: `…still the CHANGE_ME placeholder` / `must be an email address` | SSM values not set | Do step 2. |
| Stage fails but the action "Didn't run" | The action couldn't start: missing log or artifact permissions, or wrong input artifact | Check the stage error. The `CommandsActionLogs` and `PipelineArtifacts` statements cover the usual cases. |
| `iam:PassRole on … family-drive-authenticated` | Older policy limited PassRole with `iam:PassedToService`, which Cognito Identity doesn't send | Re-attach the current `ci/iam/app-pipeline-policy.json`. |
| `Node >= 22.12 required` | The Commands image has an older Node | Install a newer Node in the commands before running the script. |
| Google shows `redirect_uri_mismatch` | Step 4 not done, or the Cognito domain changed after the app was recreated | Add the current `https://<cognito_domain>/oauth2/idpresponse` (step 4). Google's error details page shows the exact URI it received. |
| Google says the account can't access the app (consent screen in Testing) | The account isn't a test user | Add it under **Test users**, or publish the app (step 4). |

## Using the drive

- The drive shows only what's under the **`drive/`** prefix of `family-drive-files-084519186805`. That is the only place signed-in users can read or write. Files uploaded elsewhere in the bucket (for example the root) won't appear: move them under `drive/`.
- The file browser (Storage Browser) lists, uploads (including large files and folders), creates folders, downloads, copies and deletes. Everyone on the allowlist shares the same files and can delete them; deleted or overwritten files can be recovered for 30 days (see Day-to-day).
- Click a file name to preview it in a panel beside the list: photos, videos (streamed), text files, Markdown (`.md`, shown formatted; raw HTML in the file is ignored and images appear as links) and PDFs (page by page, with Previous/Next; the PDF viewer loads the first time a PDF is opened). Other types show a download button. Files over **50 MB** aren't previewed (any type): the panel says "File is too big to preview" and offers the download.
- Both foundation buckets refuse any request that isn't over HTTPS.

## Local development

Run the web app on your machine against the deployed AWS backend. `http://localhost:5173` is already allowed by the Cognito callback URLs and the files bucket CORS rule.

1. Sign the AWS CLI in to the account (read access to the app state is enough).
2. Build the config from the deployed outputs:
   ```bash
   bash ci/tf-init.sh && bash scripts/write-config.sh
   ```
3. Start the dev server:
   ```bash
   npm ci --prefix web && npm run dev --prefix web
   ```
4. Open `http://localhost:5173` and sign in with an allowlisted Google account.

Tests: `npm test --prefix functions/allowlist` and `npm test --prefix web`.

**Preview playground (no AWS needed):** with `npm run dev --prefix web` running, open `http://localhost:5173/playground.html`. It renders this app's own preview viewers (Markdown, PDF) and the too-big message with sample files. It's dev-only and not in the production build.

## End-to-end test checklist

Run after a deploy, ideally in a private window.

- [ ] An allowlisted Google account signs in and lands in the drive, with its email in the top bar.
- [ ] A Google account not on the list sees "You don't have access to this drive." and can sign out.
- [ ] A file placed under `drive/` in S3 shows up in the list (name, last modified, size).
- [ ] Upload a small file and a large one (over 100 MB); both appear when done.
- [ ] Create folder `Tết 2026`, upload `ảnh gia đình.jpg` into it, then download it and check it opens.
- [ ] Preview a photo, a video, a `.txt` file, a `.md` file (formatted headings/lists) and a multi-page PDF (Previous/Next work); a `.docx` shows no preview but can be downloaded.
- [ ] Click a file over 50 MB (e.g. a video): the panel says "File is too big to preview" and the download button works.
- [ ] Copy a file, then delete the copy.
- [ ] Delete a file, then confirm a previous version still exists: `aws s3api list-object-versions --bucket family-drive-files-084519186805 --prefix drive/`.
- [ ] Sign out returns to the landing page.
- [ ] Remove an email from SSM, re-run the app pipeline, and confirm that account is refused within about 2 hours (or at once after deleting its Cognito user).

## Known gaps

- No custom domain: the CloudFront link changes if the app stack is recreated.

- The IAM policies are based on the Terraform resources in this repo and haven't been exercised against every AWS provider read. If a run reports `AccessDenied` for a `Get…` or `List…` action, add that action to the matching policy file.
