# Family Drive: design

*Date: 2026-11-04 · Status: approved direction, pending owner read-through*

## Intent

A private, Google Drive–style file store on AWS for the owner (Linh) and the
family members the owner chooses to let in. The workflow is simple: sign in
with Google, see the files, upload files. S3 is the single source of truth.
The app adds no database and no extra metadata of its own.

## Goals

- Sign in with a Google account. No registration, invite flow or
  account-creation screen.
- Only Google accounts the owner has approved by hand can get in.
- One shared drive. Every approved person sees and works with the same files.
- A list view of folders and files showing name, last modified and size.
- Upload files, including large ones such as videos, and open or download a
  file by clicking it.
- All infrastructure defined as code (Terraform) and deployable from the
  owner's machine.

## Non-goals (v1)

- Per-person private spaces, sharing links or per-file permissions.
- An in-app admin screen for approving people. Approval is done in config.
- "Uploaded by", Recent, Trash, Starred, storage-used or thumbnails.
- A hand-built file browser UI. The owner chose AWS's ready-made
  **Storage Browser for S3** component instead.
- Rename/move as dedicated features. Only what Storage Browser offers is
  included (see "File actions").
- A mobile app. The web UI should still be usable in a phone browser.
- CI/CD pipelines.

## Anti-goals (failure even if it "works")

- Anyone not on the approved list gets past login, or obtains AWS
  credentials that can touch the files bucket.
- Any file can be reached without a valid signed-in session. That means no
  public bucket and no long-lived or guessable URLs.
- A database or metadata store creeps in to support a feature.
- Credentials handed to the browser can do anything beyond the files bucket's
  drive prefix.

## Decided by the owner

| Area | Decision |
|---|---|
| Cloud | AWS |
| Infrastructure as code | Terraform or CloudFormation. Terraform was chosen (see "Designer's calls"). |
| File storage | S3 |
| UI hosting | Static site on S3 behind CloudFront |
| File browser UI | **Storage Browser for S3** (Amplify UI React component) |
| Auth | Amazon Cognito, with Google as the only sign-in method |
| Backend | Lambda only where needed, for sign-in allowlist checks. API Gateway is **dropped** from the file flow. The browser talks to S3 directly with temporary credentials. |
| Users | The owner, plus family members the owner approves by hand |
| Data model | One shared drive, with no per-user separation |
| Layout | List view (Storage Browser's table) |
| Metadata | Only what S3 returns. No DB. |

## How it works

### Architecture

```
Browser (React SPA + StorageBrowser) ──► CloudFront ──► S3 web bucket (private, OAC)
   │
   ├─► Cognito managed login ──► Google (OAuth)
   │        └─ Lambda triggers enforce the allowlist
   │
   ├─► Cognito Identity Pool ──► temporary AWS credentials (authenticated role)
   │
   └─► S3 files bucket, directly, using those credentials (scoped to drive/*)
```

The system has two buckets.

- **Web bucket:** holds the built SPA. It is private, and only CloudFront can
  read it, through Origin Access Control.
- **Files bucket:** holds the family's files under a single prefix, `drive/`.
  It is private, with Block Public Access on and SSE-S3 encryption.
  - CORS allows the CloudFront origin and `http://localhost:5173` for
    development, with methods GET, PUT, POST, DELETE and HEAD.
  - It exposes the headers Storage Browser needs, for example `ETag` and
    `x-amz-*`. The builder takes the exact list from the Storage Browser
    setup docs.

### Sign-in and access control

- **User Pool** with Google as a federated identity provider and Cognito
  managed login (hosted UI). Username/password sign-in and native self
  sign-up are off. The app client uses the authorization-code flow with
  PKCE.
- **Identity Pool** that trusts that User Pool only, with no unauthenticated
  (guest) access. Its authenticated IAM role allows only:
  - `s3:ListBucket` on the files bucket, with an `s3:prefix` condition
    limiting it to `drive/*`.
  - `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject`, plus the
    multipart actions (`AbortMultipartUpload`, `ListMultipartUploadParts`),
    on `arn:…:files-bucket/drive/*`.
  - Anything else Storage Browser's docs list as required for these actions,
    and nothing beyond that.
- **Allowlist:** a list of approved email addresses kept as a Terraform
  variable (`terraform.tfvars`, which is not committed) and passed to the
  trigger Lambdas as configuration. The checks are layered:
  1. A **Pre sign-up** trigger rejects any Google account whose email isn't
     on the list. An unapproved person never becomes a Cognito user.
  2. A **Pre token generation** trigger re-checks the list on every sign-in
     and token refresh. Someone removed from the list gets no new tokens.
     That means they get no new AWS credentials from the Identity Pool.
  3. The builder must verify in the spike which triggers actually fire for
     federated (Google) sign-in and refresh, and adjust to match. The
     requirement is fixed: someone off the list gets no tokens and no
     credentials.
- Email comparison is case-insensitive, and only verified Google emails are
  accepted.
- **Removing someone:** the owner removes the email, runs `terraform apply`
  and deletes that person's Cognito user. Credentials the person already
  holds expire within the role's session duration, set to 1 hour. The README
  documents this.
- An unapproved person who tries to sign in lands on a plain "You don't have
  access to this drive" page with a sign-out link. Cognito sends the error
  back to the SPA, which shows that page. There's no request-access option.
- The Google OAuth client is created by hand in Google Cloud Console. Its ID
  and secret are passed to Terraform as sensitive variables and never
  committed.

### The UI

A small React SPA:

- **Signed out:** a simple landing page with a "Sign in with Google" button
  that goes to Cognito managed login.
- **Signed in:** a top bar with "Family Drive", the signed-in email and Sign
  out. Below it, the **StorageBrowser** component fills the page. It opens
  directly at the shared drive (`drive/`), so people never see a bucket
  picker or a choice of locations.
- **Access denied:** the page described above.
- Storage Browser provides the list view (name, last modified, size),
  folder navigation, upload with progress, create folder, download, copy and
  delete. Light styling should make it look clean and Drive-like. Deep
  customization isn't required.
- Opening or downloading a file uses Storage Browser's built-in behavior. If
  it can preview images/PDFs/video in the browser, that's a bonus, not a
  requirement.

### File actions

- **Included (built into Storage Browser):** browse, upload, including
  folder uploads if the component supports them, create folder, download,
  copy and delete.
- **Who can delete:** every approved person can. There's no owner/admin
  role in v1. *(Designer's call. See below.)*
- **Safety net:** versioning is on for the files bucket, and noncurrent
  versions expire after 30 days. An accidentally deleted or overwritten file
  can be recovered from the AWS console within that window. The README shows
  how. This isn't surfaced in the UI.
- **Same-name upload:** follows Storage Browser's default behavior, including
  its overwrite option if it offers one. Versioning keeps the old copy for
  30 days. *(Designer's call.)*
- A lifecycle rule aborts incomplete multipart uploads after 7 days.

### Infrastructure

- One AWS account and one environment, in region `ap-southeast-1`.
- **Two Terraform stacks** (owner decision, 2026-11-05):
  - `infra/foundation/` is **retained** (`prevent_destroy`) and applied by hand with `bootstrap.sh`: the state bucket, the files bucket (with versioning and lifecycle rules) and the SSM parameters (`/family-drive/google_client_id`, `google_client_secret`, `allowed_emails` as a comma-separated StringList). Terraform creates the parameters with a placeholder and never overwrites their values.
  - `infra/` is the **app** stack, deployed by CodePipeline and safe to destroy: Cognito, Lambdas, Identity Pool, CloudFront, the web bucket and the files bucket CORS rule. It reads the files bucket as a data source.
- Terraform, with state in an S3 backend that uses native S3 locking. A
  small bootstrap creates the state bucket.
- Terraform outputs feed the SPA's runtime config: User Pool ID, client ID,
  Cognito domain, Identity Pool ID, files bucket name, region and the
  CloudFront URL for redirects. That config is written at deploy time
  (for example `public/config.json` or a generated Amplify config) and is
  never hard-coded.
- A deploy script builds the SPA, syncs it to the web bucket and invalidates
  CloudFront.
- The README documents creating the Google OAuth client, the first deploy,
  adding and removing people, recovering a deleted file and tearing down.

## Designer's calls

These weren't decided by the owner. Each one can be changed.

- **Terraform** over CloudFormation, since the owner allowed either.
- **Region `ap-southeast-1`**, the region closest to the owner (UTC+7).
- **No custom domain in v1.** The default CloudFront and Cognito prefix
  domains are used.
- **React + TypeScript + Vite** for the SPA, with Amplify JS for auth and
  `@aws-amplify/ui-react-storage` for Storage Browser.
- **Storage Browser runs on Terraform-created Cognito resources**, without the
  Amplify Gen 2 backend tooling. The builder must prove this in a spike
  first, using whichever Storage Browser auth adapter fits (the Amplify Auth
  adapter configured by hand, or a custom credentials provider backed by the
  Identity Pool). **If neither works cleanly, stop and bring it back to the
  owner** rather than adopting Amplify Gen 2 or reintroducing an API.
- **Trigger Lambdas in Node.js (current LTS) + TypeScript.**
- **Everyone can delete**, protected by versioning, rather than adding an
  owner role.
- **Same-name upload follows Storage Browser's default**, protected by
  versioning.
- **All files under a `drive/` prefix** rather than the bucket root, so IAM
  scoping is simple.
- Session duration, CORS header list and styling details are left to the
  builder.

## Testing expectations

- Unit tests for the allowlist logic in the Cognito trigger Lambdas.
- `terraform validate` and `terraform plan` run cleanly. An IAM review
  confirms the authenticated role can't reach anything outside
  `files-bucket/drive/*`.
- A manual smoke checklist in the README covering these checks:
  - An approved account signs in.
  - An unapproved account is rejected.
  - A removed account is locked out after its credentials expire.
  - Small and large (more than 100 MB) uploads work.
  - Create folder, download and delete work.
  - A deleted file is recovered from a previous version.
