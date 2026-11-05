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
   1. Checks Terraform and Node (it needs Node ≥ 20.19).
   2. Tests and builds the allowlist Lambdas.
   3. Runs `terraform fmt -check`, then `init` against the state bucket.
   4. Runs `plan` and `apply` in `infra/`. Terraform reads the SSM parameters itself.
   5. Writes `web/public/config.json` from the Terraform outputs and builds the web app.
   6. Syncs the build to the web bucket and invalidates CloudFront.

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
- `cognito_domain`: `<prefix>.auth.ap-southeast-1.amazoncognito.com`

## 4. Finish Google sign-in

In the Google OAuth client, under **Authorized redirect URIs**, add:

```
https://<cognito_domain>/oauth2/idpresponse
```

Sign-in works once this is saved. Open `app_url` and sign in with an allowlisted Google account.

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

**Bringing the app back:** run the app deploy pipeline again. The CloudFront URL and Cognito domain will change, so
**redo step 4** and share the new link.

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

A removed person loses access within about **2 hours**: their current token can last up to an hour, and the AWS credentials they got from it last up to another hour. To cut them off sooner, also delete their user in the Cognito user pool.

**Recover a deleted or overwritten file (within 30 days):**
```bash
aws s3api list-object-versions --bucket family-drive-files-084519186805 --prefix "drive/<path>"
```
- **Deleted file:** delete its *delete marker* (the newest version, marked `IsLatest` in the `DeleteMarkers` list).
- **Overwritten file:** copy the older version back over it.

**Change the foundation:** edit `infra/foundation/` and push. The foundation pipeline picks it up.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Terraform initialized in an empty directory` | Commands run Terraform at the repo root | Use the commands above. The scripts run Terraform in the right folder. |
| `S3 bucket "family-drive-tfstate-…" does not exist` | App pipeline ran before the foundation | Run the foundation pipeline first. |
| `AccessDenied … ssm:GetParameter` / `s3:CreateBucket` / … | Policy not attached to the role the action runs as | Attach the matching file from `ci/iam/`. |
| Plan stops: `…still the CHANGE_ME placeholder` / `must be an email address` | SSM values not set | Do step 2. |
| Stage fails but the action "Didn't run" | The action couldn't start: missing log or artifact permissions, or wrong input artifact | Check the stage error. The `CommandsActionLogs` and `PipelineArtifacts` statements cover the usual cases. |
| `iam:PassRole on … family-drive-authenticated` | Older policy limited PassRole with `iam:PassedToService`, which Cognito Identity doesn't send | Re-attach the current `ci/iam/app-pipeline-policy.json`. |
| `Node >= 20.19 required` | The Commands image has an older Node | Install a newer Node in the commands before running the script. |
| Google shows `redirect_uri_mismatch` | Step 4 not done, or the Cognito domain changed after the app was recreated | Add the current `https://<cognito_domain>/oauth2/idpresponse`. |

## Known gaps

- **The file browser screen isn't built yet** (plan Task 6). The app deploys sign-in and a placeholder page. Storage Browser comes next.
- The IAM policies are based on the Terraform resources in this repo and haven't been exercised against every AWS provider read. If a run reports `AccessDenied` for a `Get…` or `List…` action, add that action to the matching policy file.
