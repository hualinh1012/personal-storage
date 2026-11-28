# infra/CLAUDE.md

Rules for the two Terraform stacks. The full picture is in
[`docs/architecture/system-design.md`](../docs/architecture/system-design.md) §4–5 (config flow,
stacks, pipelines) and the feature docs' AWS sections.

## Before any plan, apply or destroy

- Build the Lambdas first: `npm --prefix functions/allowlist run build`. `archive_file` in
  `auth.tf` zips `functions/allowlist/dist/*.js`.
- Offline check: `terraform fmt -check -recursive infra`, then `init -backend=false` and
  `validate` in `infra/` and `infra/foundation/`.
- Terraform `>= 1.10`, AWS provider `~> 6.0`. The S3 backend uses `use_lockfile`; the bucket name
  is passed as `-backend-config` (`ci/tf-init.sh`).

## The two stacks

- **`foundation/` is retained.** State bucket, files bucket (versioning, lifecycle), SSM
  parameters, the app roles' permissions boundary. Every resource keeps `prevent_destroy`. Apply
  it only through `foundation/bootstrap.sh`.
- **`infra/` is disposable**: Cognito, the Lambdas, the Identity Pool, CloudFront, the web bucket,
  the files bucket's CORS. It finds foundation resources **by name through data sources**
  (`foundation_inputs.tf`), never through remote state.
- Hand-set SSM parameters start as `CHANGE_ME` with `ignore_changes` on the value, so Terraform
  never overwrites real values. `deleted_retention_days` and the custom domain's three
  (`custom_domain`, `certificate_arn`, `hosted_zone_id`) are Terraform-owned instead: change the
  foundation variables in `foundation/main.tf`, never the parameters.

## Rules that must not break

- **IAM is the security boundary** (`identity.tf`). A new permission is a statement there; the
  SPA only hides what IAM refuses. Change `web/test/locationPolicy.test.ts` with it.
- **Every role the app stack creates sets `permissions_boundary = local.permissions_boundary`.**
  The boundary (`foundation/boundary.tf`) allows only S3 on `Global/`, `Personal/`, `Deleted/` and
  the trigger Lambdas' logs; a permission outside that needs the boundary widened first, in the
  foundation.
- **A new AWS resource type adds its actions to the matching `ci/iam/*-policy.json`**, or the
  pipeline fails with AccessDenied. The app's two managed files each stay under 6,144
  non-whitespace characters; the owner re-attaches them (`ci/iam/attach-app-policies.sh`) before
  the change is pushed. Never add them to `ci/iam/github-trigger-*.json`: the GitHub trigger roles
  only start and watch one pipeline each, and their trust names one GitHub Environment
  ([ADR 0017](../docs/adr/0017-github-actions-starts-codepipeline-with-oidc.md)).
- **Never add `aws_s3_bucket_intelligent_tiering_configuration` or a Glacier class.** Archived
  objects break download, preview, Move and Delete
  ([ADR 0013](../docs/adr/0013-files-in-intelligent-tiering-without-archive-tiers.md)). Never
  suspend versioning.
- **`local.app_url`** (`storage.tf`) is the only trusted origin: it drives Cognito's URLs, the
  files bucket's CORS and `config.json`. `dev_origin` stays empty in production (#57).
- **`local.csp`** (`web.tf`) lists exact hosts. Keep the Google hosts (`accounts.google.com`,
  `apis.google.com`, `docs.google.com`, `www.googleapis.com`, `fonts.googleapis.com`,
  `fonts.gstatic.com`); a new host the browser calls goes here.
- Access levels: SSM `/family-drive/access` is a JSON `String`, validated in
  `foundation_inputs.tf` preconditions and passed to the Lambda **as written** (#41). Don't copy
  its flags into Terraform logic beyond `access_flags`.
