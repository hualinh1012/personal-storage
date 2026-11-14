# Security risk assessment, November 2026

A one-off review of Family Drive across code, infrastructure, pipelines and supply chain
(issue #12), with a CVE baseline. Ongoing CVE scanning is #22.

- **Reviewed:** `main` at `580be38` (14 November 2026), plus the deployment as described in
  [deployment.md](../deployment.md). Settings that live only in the AWS and Google consoles (for
  example the Google API key's restrictions, or whether the account has a CloudTrail trail) were
  not visible and are marked **not verified**.
- **Method:** threat model, then a manual review of every area in the ticket against the code,
  Terraform and IAM policies, `npm audit`, a lockfile check and a secrets scan of the full git
  history. The IaC scanner run is still to do (see the CVE baseline).
- **Severity** is the impact if it happens. **Likelihood** is how plausible it is for this
  deployment: a private family app on a public GitHub repo with one maintainer.

## Summary

| ID | Finding | Severity | Likelihood | Follow-up |
|---|---|---|---|---|
| S1 | `main` has no branch protection, and every push to it deploys to AWS | High | Low | #52 |
| S2 | The app pipeline's IAM policy allows escalation to account admin | High | Low | #53 |
| S3 | The family's files have no backup outside the bucket, and the foundation pipeline can expose or wipe them | High | Low | #54, **accepted** (won't fix: cost) |
| S4 | No Content Security Policy, while tokens and AWS credentials sit in `localStorage` | Medium | Low | #55 |
| S5 | No detection or response: no trail, alarms or budget alert in code, and no runbook for a compromised account | Medium | Medium | #56, **accepted** (won't fix: cost) |
| S6 | Production trusts `http://localhost:5173` (Cognito callbacks, S3 CORS, Google origins) | Low | Low | #57 |
| S7 | Small hardening gaps: app client `write_attributes`, bucket object ownership, Cognito/CloudFront `Resource: "*"` | Low | Low | #58 |

Nothing was found that an outsider (a Google user who isn't on the allowlist) can exploit. The
high findings all start with someone who can push to `main` or holds admin rights in the AWS
account, which today means the owner's GitHub or AWS account being compromised.

## Threat model

### Assets

| Asset | Where | Why it matters |
|---|---|---|
| Family files | S3 `family-drive-files-<account>` (`Global/`, `Personal/<email>/`, `Deleted/`) | The point of the app; personal folders are private |
| AWS credentials in the browser | Identity Pool session (1 h), Amplify storage in `localStorage` | Whatever the person's tags allow on S3 |
| Cognito tokens | `localStorage`: ID and access tokens (60 min), refresh token (30 days) | Turn into fresh AWS credentials until revoked |
| Google Drive token | Memory of the import view (`google.ts`), about 1 h | `drive.readonly`: read everything in that person's Google Drive |
| The allowlist and access levels | SSM `/family-drive/allowed_emails`, `/family-drive/access`; Lambda env | Decide who gets in and what they can do |
| Google OAuth client secret | SSM SecureString; Terraform state; Cognito | Lets someone impersonate the app to Google |
| The AWS account and pipelines | CodePipeline roles, Terraform state | Control everything above |

### Actors

| Actor | Can | Stopped by |
|---|---|---|
| A Google user not on the allowlist | Reach the site, start Google sign-in | Pre sign-up and pre token generation triggers (`ACCESS_DENIED`); no unauthenticated Identity Pool role |
| An allowlisted family member going beyond their access | Use their AWS credentials directly, outside the UI | IAM conditions on session tags (`global_access`, `personal`, `trash`, `email`) |
| A malicious file uploaded by a family member | Get opened in everyone's preview panel | Viewers that never run file content (Markdown `skipHtml`, PDF.js without scripts, `<img>` for SVG); downloads come from the S3 origin, never the app's |
| A compromised npm dependency | Run in every browser (runtime deps) or in the pipeline (install scripts, build) | Lockfiles with integrity hashes and `npm ci`; nothing else (S4, #22) |
| A compromised pipeline (push to `main`, or the GitHub connection) | Run any code with the pipeline roles | Nothing beyond the roles' scope, which is too wide (S1, S2, S3) |
| The AWS account owner | Everything, including reading personal folders | Accepted (ADR 0009) |

### Trust boundaries

1. **Browser ↔ Cognito:** OAuth code flow with PKCE through the managed login, Google as the only
   identity provider. The triggers decide who gets a token and add the access claims.
2. **Browser ↔ Identity Pool ↔ STS:** the ID token is exchanged for role credentials, with the
   claims passed on as session tags (`aws_cognito_identity_pool_provider_principal_tag.email`).
   `server_side_token_check` makes the Identity Pool check the token with the user pool.
3. **Browser ↔ S3:** every request is signed with those credentials; the role policy
   (`infra/identity.tf`) is the boundary. The browser is untrusted: the UI's hiding is cosmetic.
4. **Browser ↔ Google:** a separate OAuth token, sent only to Google.
5. **GitHub ↔ CodePipeline ↔ AWS:** a push to `main` runs repo code with the pipeline roles. This
   is the widest boundary.

## Findings

### S1. `main` has no branch protection, and every push to it deploys to AWS (High / Low)

**Evidence:** the GitHub API reports `main` as `protected=false` and the repository is public.
The app pipeline runs `ci/pipeline.sh` on every push to `main`, and the foundation pipeline
runs `infra/foundation/bootstrap.sh` with `AUTO_APPROVE=1` on pushes touching `infra/foundation/**`
([setup guide](../guides/setup-from-scratch.md) steps 4 and 7). Neither has an approval stage (the foundation one is
"optional but recommended").

**Risk:** whoever can push to `main` (the owner, any collaborator, a leaked token, or automation
with push rights) runs arbitrary code with the pipeline roles, which with S2 and S3 means the
whole AWS account and the family's files. A public repo doesn't let strangers push, but it does
let anyone read the pipeline and IAM design.

**Fix:**
- Protect `main`: changes only through pull requests, no force pushes or deletions, required
  status checks when CI exists (#22). Ideally require a review even for the owner's own PRs
  made by automation.
- Add a manual approval stage to the foundation pipeline (it can change the files bucket).
- Restrict the AWS Connector GitHub App installation to this one repository.
- Keep Destroy out of the deploy pipeline (setup guide step 12).

### S2. The app pipeline's IAM policy allows escalation to account admin (High / Low)

**Evidence:** `ci/iam/app-pipeline-policy.json`, statement `AppRoles`: `iam:CreateRole`,
`iam:UpdateAssumeRolePolicy`, `iam:PutRolePolicy` (and more) on `arn:aws:iam::<account>:role/family-drive-*`,
with no condition.

**Risk:** code running as the app pipeline (S1) can create `family-drive-anything` with an inline
`"Action": "*"` policy and a trust policy naming the pipeline role or an outside account, then
assume it. It can equally rewrite `family-drive-authenticated`'s policy to give every family member
`s3:*`, or the Lambda roles' policies. [deployment.md](../deployment.md) says the policy doesn't allow
"reading or writing family files"; through this path it does.

The statements `CloudFront` and `Cognito` also use `Resource: "*"`, so the pipeline can change any
distribution or user pool in the account (see S7).

**Fix:** require a permissions boundary. Create a managed policy `family-drive-boundary` that
allows only what the app's roles need (S3 on the files bucket prefixes, CloudWatch Logs for
`/aws/lambda/family-drive-*`), and add `"Condition": {"StringEquals": {"iam:PermissionsBoundary": "<boundary arn>"}}`
to `iam:CreateRole`, `iam:PutRolePolicy`, `iam:AttachRolePolicy` and `iam:UpdateAssumeRolePolicy`.
Deny `iam:DeleteRolePermissionsBoundary` and `iam:PutRolePermissionsBoundary` outright. Set
`permissions_boundary` on the three roles in `infra/auth.tf` and `infra/identity.tf`.

### S3. The family's files have no backup outside the bucket, and the foundation pipeline can expose or wipe them (High / Low)

**Evidence:**
- `ci/iam/foundation-pipeline-policy.json`, `FoundationBuckets`: `s3:PutBucket*` (which includes
  `PutBucketPolicy`, `PutBucketPublicAccessBlock` and `PutBucketVersioning`) and
  `s3:PutLifecycleConfiguration` on the files bucket. `FoundationParameters` also has
  `ssm:PutParameter` on `/family-drive/*`, so it can rewrite the allowlist and access levels.
- `infra/foundation/files.tf`: versioning with 30-day noncurrent expiry is the only recovery. There
  is no replication, AWS Backup plan or Object Lock.
- `prevent_destroy` only stops `terraform destroy` of the bucket resource; it doesn't stop a
  lifecycle rule that expires everything, versioning being suspended, or objects being deleted.

**Risk:** a compromised pipeline (S1), a compromised admin, or a plain mistake in a lifecycle
rule can make the files public (remove the public access block, add a public bucket policy) or
delete every object and every version. Family photos have no second copy.

**Fix:**
- Keep an independent copy: AWS Backup for S3 with a vault in a separate account (or at least a
  vault lock), or S3 replication to a bucket in another account. Either way the backup must not
  be deletable with the same credentials.
- Add a manual approval to the foundation pipeline (S1). IAM can't tell a harmless bucket policy
  change from a public one, so the foundation policy can't be narrowed much without breaking
  `bootstrap.sh`; detection covers the rest.
- Alarm on changes to the files bucket's policy, public access block, versioning and lifecycle (S5).

### S4. No Content Security Policy, while tokens and AWS credentials sit in `localStorage` (Medium / Low)

**Evidence:**
- `infra/web.tf` uses `Managed-SecurityHeadersPolicy`: HSTS, `X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. There is no
  `Content-Security-Policy` and no `Permissions-Policy`.
- Amplify keeps the Cognito tokens (including the 30-day refresh token) and the Identity Pool
  identity in `localStorage` (`web/src/session.ts` lists the key prefixes).

**Risk:** any script that runs in the app's origin (a future XSS bug, a compromised runtime
dependency, an injected third-party script) can read the refresh token and keep getting AWS
credentials for 30 days, from anywhere. Today's viewers are careful (see "Web app"), so the
likelihood is low; a CSP would make one mistake much less costly.

**Fix:** replace the managed headers policy with a custom `aws_cloudfront_response_headers_policy`
that keeps the same headers and adds:
- `Content-Security-Policy`: `default-src 'self'`; `script-src 'self' https://accounts.google.com https://apis.google.com`;
  `connect-src 'self' https://*.amazonaws.com https://*.amazoncognito.com https://www.googleapis.com https://accounts.google.com`;
  `frame-src https://docs.google.com https://accounts.google.com`; `img-src 'self' data: blob: https://*.amazonaws.com`;
  `media-src https://*.amazonaws.com`; `worker-src 'self' blob:`; `object-src 'none'`;
  `base-uri 'self'`; `frame-ancestors 'none'`. Narrow `*.amazonaws.com` to the files bucket's and
  Cognito's exact hosts where possible.
- `Permissions-Policy` turning off camera, microphone, geolocation and similar.
- Test it in report-only mode first: Storage Browser, PDF.js (worker), Google Picker and the
  download service worker all need checking. CLAUDE.md already lists the Google hosts.

Moving tokens out of `localStorage` isn't practical without a backend (ADR 0001); a CSP is the
mitigation.

### S5. No detection or response (Medium / Medium)

**Evidence:** neither stack defines a CloudTrail trail, S3 server access logging or data events,
CloudWatch alarms, or an AWS Budgets alert. Whether the account has a trail outside Terraform is
**not verified**. There is no runbook for a compromised family account or pipeline.

**Risk:** a stolen session, a mass delete, a bucket made public or an unexpected bill would go
unnoticed until someone stumbles on it, and versions only last 30 days. Revoking a stolen
session also needs a specific step: Identity Pool credentials can't be invalidated, only denied.

**Fix:**
- A multi-region CloudTrail trail for management events (free for the first trail), to an S3
  bucket with a lifecycle rule.
- EventBridge rules (or CloudTrail metric filters) that email the owner on: `PutBucketPolicy`,
  `DeletePublicAccessBlock`/`PutPublicAccessBlock`, `PutBucketVersioning`, `PutBucketLifecycle`
  on the files bucket; IAM changes to `family-drive-*` roles; `UpdateFunctionConfiguration` on the
  trigger Lambdas; `PutParameter` on `/family-drive/*`.
- An AWS Budgets alert on monthly cost.
- Optional: S3 data events for `DeleteObject` on the files bucket (cheap at family volume).
- A short runbook in `docs/deployment.md`, for a compromised family account:
  1. remove the email from `allowed_emails` and re-run the app pipeline;
  2. `aws cognito-idp admin-user-global-sign-out` and `admin-delete-user`;
  3. **Revoke active sessions** on the `family-drive-authenticated` role (IAM console; it adds a
     deny on `aws:TokenIssueTime`), which cuts off credentials already issued;
  4. check `list-object-versions` for deletions and restore.
  And for a compromised pipeline or GitHub account: disable the pipelines, rotate the GitHub
  connection, review CloudTrail.

### S6. Production trusts `http://localhost:5173` (Low / Low)

**Evidence:** `infra/variables.tf` `dev_origin` is used in `infra/auth.tf` (`callback_urls`,
`logout_urls`) and `infra/storage.tf` (CORS origins). The [setup guide](../guides/setup-from-scratch.md) step 10 adds
`http://localhost:5173` as a Google Authorized JavaScript origin and to the API key's website
restriction.

**Risk:** a malicious program listening on port 5173 on a family member's computer is treated as
the app: it can start a Cognito sign-in and receive the code, make CORS requests to the files
bucket with credentials it obtains, and request a Google `drive.readonly` token (the person still
sees Google's consent). It needs local code execution first, so the likelihood is low.

**Fix:** make `dev_origin` optional (empty in the pipeline) and use it only when developing, or
use a separate Cognito app client and Google OAuth client for development. Remove the localhost
entries from the Google OAuth client and API key in production.

### S7. Small hardening gaps (Low / Low)

- **App client `write_attributes`:** `aws_cognito_user_pool_client.web` in `infra/auth.tf` doesn't
  set `write_attributes`, which defaults to every writable attribute. Today nothing can use it: the
  client doesn't grant the `aws.cognito.signin.user.admin` scope (`web/src/session.ts` explains
  why), and a changed email would lose `email_verified`. But the `email` attribute keys personal
  folders, so set `write_attributes` to only what the Google mapping needs and `read_attributes`
  explicitly.
- **Object ownership:** the files and web buckets don't declare `aws_s3_bucket_ownership_controls`.
  New buckets default to `BucketOwnerEnforced` (ACLs off), so this is about making it explicit and
  catching an imported bucket created differently.
- **`Resource: "*"`** for the app pipeline's `Cognito` and `CloudFront` statements (S2): scope
  them by ARN or by an `aws:ResourceTag/Project = family-drive` condition where the actions support it.
- **The app pipeline can list the files bucket** (`FilesBucketCorsOnly` has `s3:ListBucket`, which
  `data.aws_s3_bucket` needs): file names, including personal folder names, are visible to it.
  Accept, but correct [deployment.md](../deployment.md)'s "doesn't allow reading … family files".

## Areas reviewed

### Identity and access

- **Allowlist in both triggers:** `preSignUp.ts` allows only `PreSignUp_ExternalProvider` and
  checks the allowlist; `preTokenGeneration.ts` checks it on every sign-in and refresh. Matching is
  case-insensitive, trims, requires `email_verified` = `true`, and an empty list denies everyone
  (`allowlist.ts`, tests in `allowlist.test.ts`, `handlers.test.ts`). **Nothing found.**
- **`email_verified`:** mapped from Google; `String(x).toLowerCase() === "true"` accepts the boolean
  or string form only. **Nothing found.**
- **Native sign-up:** `allow_admin_create_user_only = true` and the client only supports Google.
  **Nothing found.**
- **Claims:** the access claims are added by the trigger and signed by Cognito; user attributes
  can't collide with them (custom attributes are prefixed `custom:`). **Nothing found** (but S7).
- **Identity Pool and trust policy:** no unauthenticated identities; classic flow off (default);
  `server_side_token_check = true`; trust limited to this pool's `aud` and `amr = authenticated`;
  `sts:TagSession` allowed; `max_session_duration = 3600`. **Nothing found.**
- **S3 role policy:** statements in `infra/identity.tf` match ADRs 0009–0011. Tag values can't
  contain `*` or `?`, so the `${aws:PrincipalTag/email}` variable can't widen a `StringLike` match.
  A missing tag fails closed. **Nothing found.**
- **Lifetimes:** ID/access tokens 60 min, refresh 30 days, credentials 1 h; removal takes effect
  within about 2 hours (ADR 0003, accepted). Token revocation is on by default, and deleting the
  Cognito user stops refresh at once; issued credentials need S5's "revoke active sessions".
- **With raw credentials, outside the UI, an allowlisted person can:**
  - read and list all of `Global/` (by design);
  - with `write`, delete or overwrite anything in `Global/` directly, skipping `Deleted/`
    (accepted, ADR 0011: versioning is the backstop for 30 days);
  - upload any amount of data (accepted: family trust; S5's budget alert covers cost);
  - write files into `Deleted/Global/` or their own `Deleted/Personal/<email>/` without deleting
    anything (harmless);
  - with `trash`, read and purge every version under `Deleted/`, including other people's deleted
    personal files (accepted, ADR 0011).
  They cannot: list or read another person's folder, read `Deleted/` without `trash`, delete a
  version outside `Deleted/`, or touch anything outside the three prefixes.

### S3

- **Public access block and policies:** all four flags on both foundation buckets and the web
  bucket; the foundation buckets deny non-TLS requests (`infra/foundation/tls.tf`); the web bucket
  policy allows only the CloudFront distribution (`AWS:SourceArn`). **Nothing found** (but S3 for
  who can change them).
- **Encryption:** SSE-S3 (`AES256`) on all buckets. KMS would add key-level access control and
  logging but isn't needed for this threat model. **Accepted.**
- **CORS:** origins are exactly the CloudFront URL and `http://localhost:5173` (S6); methods and
  `allowed_headers = ["*"]` follow Storage Browser's requirements; no credentials mode needed
  (SigV4 headers). **Nothing else found.**
- **Versioning as recovery:** on, 30-day noncurrent expiry, recovery only through the console.
  Adequate against mistakes, not against S3 (no independent copy).
- **Object ownership:** S7.
- **Presigned URLs:** downloads 15 min, previews at most 1 h (Amplify caps them at the credentials'
  expiry), `Content-Disposition: attachment`. A leaked URL works until it expires. **Accepted.**

### CloudFront and the web bucket

- **OAC:** `signing_behavior = "always"`, SigV4; the bucket is private. **Nothing found.**
- **Headers:** S4 (no CSP). HSTS is present without `includeSubDomains`/`preload`, which doesn't
  apply to a `cloudfront.net` subdomain anyway. `X-Frame-Options: SAMEORIGIN` stops framing by
  other sites.
- **TLS:** the default `*.cloudfront.net` certificate, for which CloudFront doesn't let you raise
  the minimum protocol. **Accepted** until a custom domain is added (a known gap in deployment.md);
  then use `TLSv1.2_2021`.
- **Caching:** only the SPA is cached; `index.html`, `config.json`, the download service worker,
  the manifest and icons are `no-cache`; hashed assets are immutable. No user data passes through
  CloudFront. 403/404 map to `index.html`, which leaks nothing. **Nothing found.**

### Web app (XSS and content handling)

- **Markdown:** `skipHtml`, the default `urlTransform`, images as links, `rel="noopener noreferrer"`;
  tests in `markdownView.test.tsx`. **Nothing found.**
- **PDF:** `pdfjs-dist` 6.3.289 (after the CVE-2024-4367 font fix in 4.2.67); `enableXfa: false`,
  no text or annotation layer; drawn on a canvas. **Nothing found.**
- **Text:** rendered as React text. **Nothing found.**
- **SVG and HTML files:** previewed only as `<img>` (SVG, scripts don't run) or not at all (HTML);
  opened or downloaded from the S3 origin with `Content-Disposition: attachment`, never from the
  app's origin. **Nothing found.**
- **File names:** rendered through React (escaped) in Storage Browser, our views and messages. No
  `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` in `web/src`. **Nothing found.**
- **`config.json`:** same origin, from the web bucket that only the pipeline writes; anyone able to
  change it could change the JavaScript too. **Nothing found.**
- **Token storage:** S4.
- **Download service worker:** copied from `@aws-amplify/ui-react-storage` at build time, scoped
  to `/amplify-storage-download/`, served `no-cache`. Only as trustworthy as the package
  (supply chain). **Nothing else found.**

### Google integration

- **Scope:** `drive.readonly`, a restricted scope, accepted in ADR 0008. The token stays in
  memory and goes only to Google (`driveClient.ts` is the only caller). **Accepted.**
- **API key:** public by design; protection depends on website and API restrictions set in the
  console (**not verified**; setup guide step 10 describes them). Localhost entries: S6.
- **Redirect URIs:** only Cognito's `/oauth2/idpresponse` (setup guide step 8); fixed domain
  (ADR 0005). **Nothing found.**
- **Consent screen:** Testing mode with test users (ADR 0008). **Accepted.**

### Lambdas

- **Input handling:** only Cognito's event (`userAttributes`, `triggerSource`); env parsed
  strictly, malformed `ACCESS_LEVELS` throws (fails closed). **Nothing found.**
- **Error messages:** `ACCESS_DENIED` only; parser errors name an email from the config, visible
  only in CloudWatch. **Nothing found.**
- **Logging of personal data:** the handlers log nothing; the runtime logs thrown errors. Log
  groups keep 14 days. **Nothing found.**
- **Runtime:** `nodejs22.x`, supported by Lambda until about April 2027; track the upgrade with
  #22. Roles have only `AWSLambdaBasicExecutionRole`; invoke permission is limited to this user
  pool's ARN. **Nothing found.**

### Terraform and state

- **State bucket:** private, versioned, SSE-S3, TLS-only, `prevent_destroy`. Each pipeline role
  can read only its own state prefix. App state contains the Google client secret in plain text
  (from `data.aws_ssm_parameter.google_client_secret`) and the allowlist. **Accepted**, given the
  bucket's access; KMS on the state bucket would be the next step.
- **`prevent_destroy`:** on every foundation resource; doesn't protect contents (S3).
- **SSM types:** client secret `SecureString`; allowlist `StringList`; access `String` (JSON);
  Google API key and project number `String` (public values). **Nothing found.**
- **Provider lock files** are committed for both stacks; Terraform is pinned (`1.16.6`) and
  installed from HashiCorp's signed repository. **Nothing found.**

### CI/CD

- **Pipeline IAM:** S2 (app), S3 (foundation), S7 (`Resource: "*"`).
- **CodeConnections scope:** not verified; S1 recommends limiting the GitHub App to this repo.
- **Scripts:** all use `set -euo pipefail`; `ci/app-env.sh` is sourced by scripts that set it;
  no `export X="$(cmd)"`; no `eval` or unquoted user input; variables (`PROJECT`, `REGION`,
  `AUTO_APPROVE`) come from the pipeline definition, not from the repo's content.
  **Nothing found.**
- **Who can trigger:** any push to `main` deploys (S1). Destroy must be its own pipeline, manual
  with an approval stage (setup guide step 12). The app pipeline seen in the console on 13 November
  still had a Destroy stage behind a disabled transition, one click from running; moving it out is
  part of S1.
- **Install scripts:** `npm ci` runs dependencies' install scripts with the pipeline role's
  credentials in the environment. Covered by lockfile integrity and #22; S2's boundary limits the damage.

### Secrets

- Searched every commit on every branch (77 commits) for AWS access keys (`AKIA`/`ASIA`), Google
  API keys (`AIza…`), Google OAuth client IDs and secrets (`GOCSPX-…`), GitHub tokens, Slack tokens,
  private keys and JWTs. **Nothing found.**
- No `.env`, `config.json`, `*.tfvars` or state files were ever committed; `.gitignore` covers them.
- The AWS account ID appears in docs and IAM policies. Account IDs aren't secret; noted because the
  repo is public. Example emails in tests and docs are placeholders.

### Supply chain: CVE baseline (14 November 2026)

| Check | `web/` | `functions/allowlist/` |
|---|---|---|
| `npm audit` (all severities, including dev dependencies) | 0 vulnerabilities | 0 vulnerabilities |
| Lockfile | v3, 370 packages, every one with an `integrity` hash, all from `registry.npmjs.org` | v3, 111 packages, same |
| Install in CI | `npm ci` (lockfile only) | `npm ci` |

**IaC scan: not run yet.** Installing Checkov or Trivy wasn't possible in the environment this
review ran in, so `infra/` and `infra/foundation/` were reviewed by hand (sections above). To close
the baseline, run one of these and triage every high and critical result here:

```bash
pipx run checkov -d infra --framework terraform
```

```bash
trivy config infra
```

Expect scanner noise that this review already decided on: no KMS (accepted), no S3 access logging
(S5), no WAF (static site, not needed), CloudFront without a custom certificate (accepted), no
cross-region replication (S3).

### Detection and recovery

S5. Recovery today: versioning (30 days) for files; `Deleted/` for in-app deletes (30 days);
Terraform state versioning; the app stack can be rebuilt from the repo. No independent backup (S3).

## Accepted risks

| Risk | Why accepted |
|---|---|
| Writers can delete or overwrite shared files with raw credentials, skipping `Deleted/` | Family trust; versioning keeps every version 30 days (ADR 0006, 0010, 0011) |
| Everyone signed in can read the whole shared drive | It's a shared family drive (ADR 0001) |
| Trash managers see files deleted from others' personal folders | Owner's choice (ADR 0011) |
| The AWS account owner can read personal folders | Privacy is an app boundary, not encryption (ADR 0009) |
| A removed person keeps access up to about 2 hours | Token and credential lifetimes (ADR 0003); S5's runbook shortens it when needed |
| Google import uses `drive.readonly` | `drive.file` can't read inside folders (ADR 0008) |
| A leaked presigned URL works until it expires (15 min to 1 h) | Short lifetime |
| SSE-S3 rather than KMS; client secret in Terraform state | Bucket access is already limited to admins and the pipeline roles |
| TLS policy of the default CloudFront certificate | Needs a custom domain (known gap) |
| Family members can run up storage costs | Family trust |
| No backup outside the files bucket (S3) | Owner's decision, 14 November 2026 (#54): a family app on a small budget; a second copy would roughly double storage cost. Versioning (30 days) is the only recovery, so #52 and #53 matter more. |
| No trail, alarms or budget alert (S5) | Owner's decision, 14 November 2026 (#56): small budget. The incident steps in S5 still apply by hand. |
