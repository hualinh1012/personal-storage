# Family Drive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private, Google-sign-in, Drive-like family file store on AWS. It uses Storage Browser for S3 over a Cognito-protected S3 bucket, all in Terraform.

**Architecture:**
- A React SPA, served by CloudFront from a private S3 bucket, signs people in through Cognito managed login with Google.
- Cognito Lambda triggers enforce an email allowlist.
- A Cognito Identity Pool hands approved users short-lived AWS credentials, scoped to `drive/*` in the files bucket.
- Storage Browser talks to S3 directly with those credentials. There's no API Gateway and no database.

**Tech Stack:** Terraform ≥ 1.10 (AWS provider `~> 6.0`), Node.js 22 + TypeScript (Lambda triggers, bundled with esbuild, tested with Vitest), React + TypeScript + Vite, `aws-amplify` v6 and `@aws-amplify/ui-react-storage` (StorageBrowser).

**Spec:** `docs/superpowers/specs/2026-11-04-family-drive-design.md`

## Global Constraints

- **Region:** `ap-southeast-1`. One AWS account, one environment.
- **Files layout:** all files live under the `drive/` prefix of the files bucket. Browser credentials must not reach anything outside `arn:aws:s3:::<files-bucket>/drive/*`, plus `ListBucket` limited by an `s3:prefix` condition on `drive/*`.
- **Buckets:**
  - Both buckets are private, with Block Public Access on and SSE-S3 encryption.
  - The web bucket is readable only by CloudFront, through Origin Access Control.
  - The files bucket has versioning on, noncurrent versions expire after 30 days, and incomplete multipart uploads are aborted after 7 days.
- **Cognito:**
  - Google is the only identity provider. Username/password sign-in and native self sign-up are off.
  - The app client uses the authorization-code flow with PKCE.
  - The Identity Pool has no unauthenticated access, and the authenticated role session lasts at most 1 hour.
- **Allowlist:**
  - Stored in the Terraform variable `allowed_emails` (list of strings, set in `terraform.tfvars`, never committed) and passed to the trigger Lambdas as env `ALLOWED_EMAILS` (comma-separated).
  - Email matching is case-insensitive and ignores surrounding whitespace.
  - Only `email_verified = true` is accepted.
  - An empty or missing list denies everyone.
- **Secrets:** the Google client ID and secret are sensitive Terraform variables and are never committed. `terraform.tfvars` and generated `web/public/config.json` are git-ignored.
- **No API Gateway and no database.** If a task seems to need one, stop and raise it.
- **Access-denied copy:** "You don't have access to this drive." with a "Sign out" link. There's no request-access option.
- **App title:** "Family Drive".

## Review Focus

1. Allowlist entries with different case or stray spaces (`" Mom@Gmail.com"`) must still match `mom@gmail.com`. Tested in Task 1.
2. A missing or empty `ALLOWED_EMAILS` must deny everyone, never allow everyone. Tested in Task 1.
3. A person removed from the list must be denied on token **refresh**, not just on first sign-in. Tested in Task 2 (`TokenGeneration_RefreshTokens`).
4. A Google account whose email isn't verified, or a non-Google sign-up path, must be denied. Tested in Tasks 1–2.
5. File and folder names with spaces and Vietnamese diacritics (`Tết 2026/ảnh gia đình.jpg`) must upload, list, download and delete correctly. Covered by the Task 6 smoke step and the README checklist in Task 7.

## File Structure

```
.gitignore
README.md
functions/allowlist/            # Cognito trigger Lambdas (one package, two handlers)
  package.json, tsconfig.json, vitest.config.ts
  src/allowlist.ts              # pure allowlist logic
  src/preSignUp.ts              # Pre sign-up handler
  src/preTokenGeneration.ts     # Pre token generation handler
  test/allowlist.test.ts
  test/handlers.test.ts
infra/bootstrap/main.tf         # one-time: Terraform state bucket
infra/
  versions.tf                   # terraform/provider versions, S3 backend
  variables.tf
  storage.tf                    # files bucket (+ versioning, lifecycle, CORS)
  web.tf                        # web bucket + CloudFront + OAC
  auth.tf                       # user pool, Google IdP, client, domain, triggers
  identity.tf                   # identity pool + authenticated role
  outputs.tf
  terraform.tfvars.example
web/                            # React SPA
  package.json, vite.config.ts, tsconfig.json, index.html
  src/config.ts                 # load /config.json → AppConfig, build Amplify config
  src/authErrors.ts             # detect access-denied redirect
  src/App.tsx                   # routing between Landing / AccessDenied / Drive
  src/pages/Landing.tsx, AccessDenied.tsx, Drive.tsx
  src/styles.css
  test/config.test.ts, test/authErrors.test.ts
scripts/write-config.sh         # terraform outputs → web/public/config.json
scripts/deploy.sh               # build SPA, sync to web bucket, invalidate CloudFront
```

---

### Task 1: Repo scaffolding + allowlist logic

**Files:**
- Create: `.gitignore`, `functions/allowlist/{package.json,tsconfig.json,vitest.config.ts}`, `functions/allowlist/src/allowlist.ts`
- Test: `functions/allowlist/test/allowlist.test.ts`

**Interfaces:**
- Produces:
  - `parseAllowlist(raw: string | undefined): string[]`. It returns trimmed, lower-cased, non-empty entries.
  - `isAllowed(email: string | undefined, emailVerified: string | boolean | undefined, allowlist: string[]): boolean`

- [ ] **Step 1:** Create `.gitignore` with `node_modules/`, `dist/`, `.superpowers/`, `*.tfstate*`, `.terraform/`, `infra/terraform.tfvars`, `web/public/config.json`, `*.zip`. Scaffold the `functions/allowlist` package (TypeScript, Vitest, esbuild as a dev dependency). Scripts: `test` = `vitest run`, `build` = esbuild bundling `src/preSignUp.ts` and `src/preTokenGeneration.ts` to `dist/` (platform node, target node22, format cjs).

- [ ] **Step 2: Write the failing tests** in `test/allowlist.test.ts`

```ts
expect(parseAllowlist(" Mom@Gmail.com, linh@gmail.com ,,")).toEqual(["mom@gmail.com", "linh@gmail.com"]);
expect(parseAllowlist(undefined)).toEqual([]);
expect(parseAllowlist("")).toEqual([]);
const list = ["mom@gmail.com"];
expect(isAllowed("MOM@gmail.com", "true", list)).toBe(true);
expect(isAllowed("mom@gmail.com", true, list)).toBe(true);
expect(isAllowed("mom@gmail.com", "false", list)).toBe(false);   // unverified
expect(isAllowed("mom@gmail.com", undefined, list)).toBe(false);
expect(isAllowed("stranger@gmail.com", "true", list)).toBe(false);
expect(isAllowed(undefined, "true", list)).toBe(false);
expect(isAllowed("mom@gmail.com", "true", [])).toBe(false);      // empty list denies all
```

- [ ] **Step 3:** Run `npm test` in `functions/allowlist`. Expected: FAIL (module not found).
- [ ] **Step 4:** Implement both functions in `src/allowlist.ts`.
- [ ] **Step 5:** Run `npm test`. Expected: all PASS.
- [ ] **Step 6: Commit** `feat: allowlist logic for Cognito triggers`

### Task 2: Cognito trigger handlers

**Files:**
- Create: `functions/allowlist/src/preSignUp.ts`, `functions/allowlist/src/preTokenGeneration.ts`
- Test: `functions/allowlist/test/handlers.test.ts`

**Interfaces:**
- Consumes: `parseAllowlist`, `isAllowed` (Task 1).
- Produces:
  - `preSignUp.handler(event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent>`
  - `preTokenGeneration.handler(event: PreTokenGenerationTriggerEvent): Promise<PreTokenGenerationTriggerEvent>`
  - Both use types from `aws-lambda` and read `process.env.ALLOWED_EMAILS`.
  - Both deny by throwing `new Error("ACCESS_DENIED")`. Cognito surfaces this string in the redirect's `error_description`, and Task 5 detects it.

- [ ] **Step 1: Write the failing tests.** Build events with a helper. Use `ALLOWED_EMAILS="mom@gmail.com"` unless noted.
  - preSignUp, `triggerSource: "PreSignUp_ExternalProvider"`, email `Mom@gmail.com`, `email_verified: "true"` → resolves and returns the event.
  - preSignUp, same trigger source, email `stranger@gmail.com` → rejects with `"ACCESS_DENIED"`.
  - preSignUp, `triggerSource: "PreSignUp_SignUp"` (native sign-up), allowed email → rejects with `"ACCESS_DENIED"`.
  - preTokenGeneration, `triggerSource: "TokenGeneration_HostedAuth"`, allowed email → resolves.
  - preTokenGeneration, `triggerSource: "TokenGeneration_RefreshTokens"`, `ALLOWED_EMAILS=""` → rejects with `"ACCESS_DENIED"`. This covers a removed person.
  - preTokenGeneration, `email_verified: "false"` → rejects.
- [ ] **Step 2:** Run `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement both handlers. preSignUp allows only `PreSignUp_ExternalProvider`. preTokenGeneration checks every trigger source. Neither changes the event when allowing.
- [ ] **Step 4:** Run `npm test` and `npm run build`. Expected: all PASS, and `dist/preSignUp.js` and `dist/preTokenGeneration.js` exist.
- [ ] **Step 5: Commit** `feat: Cognito pre-sign-up and pre-token-generation allowlist triggers`

### Task 3: Terraform foundation, storage and web hosting

**Files:**
- Create: `infra/bootstrap/main.tf`, `infra/versions.tf`, `infra/variables.tf`, `infra/storage.tf`, `infra/web.tf`, `infra/outputs.tf`, `infra/terraform.tfvars.example`

**Interfaces:**
- Produces:
  - Variables: `project` (default `"family-drive"`), `region` (default `"ap-southeast-1"`), `allowed_emails` (list(string)), `google_client_id` (sensitive), `google_client_secret` (sensitive), `dev_origin` (default `"http://localhost:5173"`).
  - Resources: `aws_s3_bucket.files`, `aws_s3_bucket.web`, `aws_cloudfront_distribution.web`.
  - Outputs: `files_bucket`, `web_bucket`, `cloudfront_distribution_id`, `app_url` (`https://<cloudfront domain>`), `region`.

- [ ] **Step 1:** Write `infra/bootstrap/main.tf`, which creates a versioned, private state bucket named `${project}-tfstate-${account_id}` with local state. In `infra/versions.tf`, configure `backend "s3"` with `use_lockfile = true` (bucket name supplied by `-backend-config`, documented in Task 7).
- [ ] **Step 2:** Write `storage.tf` for the files bucket:
  - Block Public Access (all four flags true) and SSE-S3.
  - Versioning enabled.
  - Lifecycle rules: noncurrent versions expire after 30 days, and incomplete multipart uploads are aborted after 7 days.
  - CORS: allowed origins `[app_url, dev_origin]`; methods GET, PUT, POST, DELETE, HEAD; allowed headers `*`; expose headers `ETag`, `x-amz-server-side-encryption`, `x-amz-request-id`, `x-amz-id-2`, `x-amz-version-id`; max age 3000. Cross-check this list against the Storage Browser S3 CORS docs and add anything they require.
- [ ] **Step 3:** Write `web.tf`:
  - Web bucket: private with Block Public Access.
  - `aws_cloudfront_origin_access_control` (signing `always`, `sigv4`).
  - Distribution:
    - default root `index.html`, redirect to HTTPS, managed `CachingOptimized` policy;
    - custom error responses 403/404 → `/index.html` with status 200 (SPA routing);
    - default certificate, `PriceClass_200`.
  - Bucket policy allowing `s3:GetObject` only to `cloudfront.amazonaws.com`, with `AWS:SourceArn` = the distribution ARN.
- [ ] **Step 4:** Run `terraform fmt -check -recursive infra` and `terraform -chdir=infra init -backend=false && terraform -chdir=infra validate`. Expected: no format diff, "Success! The configuration is valid."
- [ ] **Step 5: Commit** `feat(infra): state bootstrap, files bucket, CloudFront-hosted web bucket`

### Task 4: Terraform auth (User Pool, Google, triggers, Identity Pool)

**Files:**
- Create: `infra/auth.tf`, `infra/identity.tf`
- Modify: `infra/outputs.tf`

**Interfaces:**
- Consumes:
  - `functions/allowlist/dist/*.js` (Task 2), zipped with `archive_file`.
  - `app_url`, `dev_origin`, `allowed_emails`, `google_client_*`, and `aws_s3_bucket.files` (Task 3).
- Produces outputs: `user_pool_id`, `user_pool_client_id`, `cognito_domain` (full host, e.g. `<prefix>.auth.ap-southeast-1.amazoncognito.com`), `identity_pool_id`.

- [ ] **Step 1:** Write `auth.tf`:
  - Two `aws_lambda_function`s (`nodejs22.x`, handler `preSignUp.handler` / `preTokenGeneration.handler`, env `ALLOWED_EMAILS = join(",", var.allowed_emails)`), each with a basic execution role and an `aws_lambda_permission` for `cognito-idp.amazonaws.com` scoped to the pool ARN.
  - `aws_cognito_user_pool` with `admin_create_user_config { allow_admin_create_user_only = true }`, `username_attributes = ["email"]`, and `lambda_config { pre_sign_up, pre_token_generation }`.
  - `aws_cognito_identity_provider` `Google`, with `authorize_scopes = "openid email profile"` and attribute mapping `email → email`, `email_verified → email_verified`, `username → sub`.
  - `aws_cognito_user_pool_domain`, prefix `${project}-${random suffix}`.
  - `aws_cognito_user_pool_client`:
    - no secret;
    - `supported_identity_providers = ["Google"]` (not `COGNITO`), `allowed_oauth_flows = ["code"]`, scopes `openid email profile`;
    - callback and logout URLs both `["${app_url}/", "${dev_origin}/"]`. These must match `toAmplifyOutputs`, which uses `origin + "/"`.
    - `explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH"]`;
    - `depends_on` the Google IdP.
- [ ] **Step 2:** Write `identity.tf`:
  - `aws_cognito_identity_pool` with `allow_unauthenticated_identities = false` and one `cognito_identity_providers` block (this client and pool, `server_side_token_check = true`).
  - Authenticated role:
    - trust policy for `cognito-identity.amazonaws.com`, `sts:AssumeRoleWithWebIdentity` and `sts:TagSession`;
    - conditions `cognito-identity.amazonaws.com:aud` = pool ID and `amr` ForAnyValue `authenticated`;
    - `max_session_duration = 3600`.
  - The role's inline policy has exactly these statements:
    - `s3:ListBucket` on the bucket ARN, with condition `StringLike s3:prefix ["drive/", "drive/*"]`;
    - `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:AbortMultipartUpload`, `s3:ListMultipartUploadParts` on `${bucket_arn}/drive/*`.
  - `aws_cognito_identity_pool_roles_attachment`.
- [ ] **Step 3:** Run `npm --prefix functions/allowlist run build`, then `terraform fmt -check -recursive infra` and `terraform -chdir=infra validate`. Expected: valid.
- [ ] **Step 4: IAM review.** Read `identity.tf` and confirm that no statement uses `*` actions, `s3:*`, or any resource outside the files bucket and `drive/*`. Record the result in the task's commit message body.
- [ ] **Step 5: Commit** `feat(infra): Cognito with Google, allowlist triggers, identity pool scoped to drive/*`

### Task 5: SPA scaffold, config and sign-in flow

**Files:**
- Create: `web/` Vite React-TS app, `web/src/config.ts`, `web/src/authErrors.ts`, `web/src/App.tsx`, `web/src/pages/Landing.tsx`, `web/src/pages/AccessDenied.tsx`, `web/src/styles.css`, `scripts/write-config.sh`
- Test: `web/test/config.test.ts`, `web/test/authErrors.test.ts`

**Interfaces:**
- Consumes: Terraform outputs from Tasks 3–4 (via `write-config.sh`).
- Produces:
  - `interface AppConfig { region: string; userPoolId: string; userPoolClientId: string; cognitoDomain: string; identityPoolId: string; filesBucket: string; appUrl: string }`
  - `loadConfig(): Promise<AppConfig>`, which fetches `/config.json`.
  - `toAmplifyOutputs(c: AppConfig, origin: string): AmplifyOutputs`, a Gen 2–shaped outputs object passed to `Amplify.configure`.
  - `isAccessDeniedRedirect(search: string): boolean`

- [ ] **Step 1: Write the failing tests.**

```ts
// authErrors.test.ts
expect(isAccessDeniedRedirect("?error_description=PreSignUp+failed+with+error+ACCESS_DENIED.&error=invalid_request")).toBe(true);
expect(isAccessDeniedRedirect("?error_description=PreTokenGeneration%20failed%20with%20error%20ACCESS_DENIED.")).toBe(true);
expect(isAccessDeniedRedirect("?code=abc&state=xyz")).toBe(false);
expect(isAccessDeniedRedirect("")).toBe(false);
// config.test.ts — given a sample AppConfig c and origin "http://localhost:5173":
const o = toAmplifyOutputs(c, "http://localhost:5173");
expect(o.auth.user_pool_id).toBe(c.userPoolId);
expect(o.auth.identity_pool_id).toBe(c.identityPoolId);
expect(o.auth.oauth.domain).toBe(c.cognitoDomain);
expect(o.auth.oauth.identity_providers).toEqual(["GOOGLE"]);
expect(o.auth.oauth.response_type).toBe("code");
expect(o.auth.oauth.redirect_sign_in_uri).toEqual(["http://localhost:5173/"]);
expect(o.storage.bucket_name).toBe(c.filesBucket);
expect(o.storage.buckets[0].paths).toEqual({ "drive/*": { authenticated: ["get", "list", "write", "delete"] } });
```

- [ ] **Step 2:** Run `npm test` in `web`. Expected: FAIL.
- [ ] **Step 3:** Implement `config.ts` and `authErrors.ts`.
  - `toAmplifyOutputs` emits `version: "1.4"` (or the current outputs version the installed Amplify accepts) with `auth` and `storage` blocks. `storage.buckets[0].name` is `"drive"`.
  - Write `scripts/write-config.sh`, which reads `terraform -chdir=infra output -json` and writes `web/public/config.json` with the `AppConfig` keys.
- [ ] **Step 4:** Implement `App.tsx` and the pages:
  - On load, call `loadConfig`, then `Amplify.configure(toAmplifyOutputs(cfg, location.origin))`.
  - If `isAccessDeniedRedirect(location.search)`, render `AccessDenied` (exact copy from Global Constraints; Sign out calls `signOut()`).
  - Otherwise, if not signed in (`getCurrentUser` throws), render `Landing` with "Family Drive" and a "Sign in with Google" button calling `signInWithRedirect({ provider: "Google" })`.
  - Otherwise render a placeholder `Drive` (top bar with "Family Drive", the email from `fetchUserAttributes`, and Sign out). Task 6 replaces the body.
- [ ] **Step 5:** Run `npm test` and `npm run build`. Expected: tests PASS and the build succeeds.
- [ ] **Step 6: Commit** `feat(web): SPA shell with Google sign-in and access-denied page`

### Task 6: Storage Browser (spike gate) + first deploy

**Files:**
- Modify: `web/src/pages/Drive.tsx`, `web/src/styles.css`
- Create: `scripts/deploy.sh`

**Interfaces:**
- Consumes: `AppConfig`, the Amplify configuration (Task 5), and the deployed infra (Tasks 3–4).
- Produces: a working deployed app at `app_url`.

- [ ] **Step 1: Deploy infra.** Use a real `infra/terraform.tfvars` from the owner (Google client created per the README draft) and run `terraform -chdir=infra apply`. Expected: apply completes and outputs are populated. Then add `https://<cognito_domain>/oauth2/idpresponse` as an authorized redirect URI on the Google OAuth client.
- [ ] **Step 2: Gate.**
  - In `Drive.tsx`, render `createStorageBrowser({ config: createAmplifyAuthAdapter() })`'s `StorageBrowser` under the top bar.
  - Run `scripts/write-config.sh` and `npm run dev`, sign in with an allowlisted account, and confirm it lists `drive/`.
  - If the Amplify adapter can't work with this hand-built config, try `createStorageBrowser` with a custom config: `listLocations` returns a single `drive/` prefix location, and `getLocationCredentials` uses `fetchAuthSession().credentials`.
  - **If neither works, stop and report to the owner.** Don't adopt Amplify Gen 2 and don't add an API.
- [ ] **Step 3:** Make it open directly in the drive. Use the component's initial-location or default-value option so that, when only one location exists, people land inside `drive/` without a location picker. Apply light styling (Drive-like font and spacing, full-height layout, sidebar-free).
- [ ] **Step 4:** Write `scripts/deploy.sh`. It runs `write-config.sh`, `npm --prefix web run build`, and `aws s3 sync web/dist s3://<web_bucket> --delete`, then `aws cloudfront create-invalidation --paths "/*"`. Run it.
- [ ] **Step 5: Smoke on `app_url`.** Expected results:
  - An allowlisted account signs in and sees the drive.
  - A non-allowlisted Google account sees the access-denied copy.
  - Uploading a 5 MB file and a >100 MB file works.
  - Create folder `Tết 2026`, upload `ảnh gia đình.jpg` into it, download it and delete it.
  - Delete a file, then confirm its previous version still exists (`aws s3api list-object-versions --prefix drive/`).
  - Sign out returns to the landing page.
- [ ] **Step 6: Commit** `feat(web): Storage Browser on shared drive + deploy script`

### Task 7: README and operating docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** Write the README with these sections:
  - **What it is** (one paragraph).
  - **Prerequisites:** AWS CLI profile, Terraform ≥ 1.10, Node 22.
  - **Create the Google OAuth client:** Web application. Authorized redirect URI `https://<cognito_domain>/oauth2/idpresponse`, filled in after the first apply.
  - **First deploy:**
    1. Bootstrap state.
    2. `terraform init -backend-config="bucket=..."`.
    3. Copy `terraform.tfvars.example`.
    4. Run `terraform apply`.
    5. Run `scripts/deploy.sh`.
  - **Add a person:** add the email to `allowed_emails` and apply.
  - **Remove a person:** remove the email, apply, then run `aws cognito-idp admin-delete-user`. Access ends within 1 hour.
  - **Recover a deleted or overwritten file:** `list-object-versions`, then copy the version back or delete the delete marker. Possible within 30 days.
  - **Local development:** `write-config.sh` + `npm run dev` on `localhost:5173`.
  - **Smoke checklist:** the Task 6 Step 5 list, plus "removed person locked out after ≤1 h".
  - **Teardown:** empty the buckets, then `terraform destroy`.
- [ ] **Step 2:** Follow the README's local-development section from a clean shell. Expected: the app starts and sign-in works.
- [ ] **Step 3: Commit** `docs: README with setup, access management, recovery and smoke checklist`
