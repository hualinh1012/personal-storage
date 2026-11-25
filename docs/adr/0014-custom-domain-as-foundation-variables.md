# Custom domain as foundation variables, with Route 53 records in the app stack

Amends [0004](0004-retained-foundation-and-disposable-app-stack.md), whose consequence was that the CloudFront URL changes on every app rebuild "until a custom domain is added".

The app can be served at a custom domain such as `drive.example.com`. Three foundation Terraform variables (`infra/foundation/main.tf`) switch it on, and they're all empty by default:

- `custom_domain`: the host name;
- `certificate_arn`: an issued ACM certificate in **us-east-1** covering it (CloudFront only uses certificates from that region);
- `hosted_zone_id`: the Route 53 zone in this account that holds the name.

The foundation writes them to SSM (`/family-drive/custom_domain`, `certificate_arn`, `hosted_zone_id`; `CHANGE_ME` when empty, since SSM refuses empty values), where the app stack reads them by name like its other foundation inputs.

When all three are set, the app stack (`infra/web.tf`):
- adds the domain to the distribution's `aliases`;
- uses the certificate (SNI, minimum `TLSv1.2_2021`);
- creates `A` and `AAAA` alias records to the distribution;
- makes the domain the app's **only** trusted origin (`local.app_url`).

That origin feeds Cognito's callback and logout URLs, the files bucket's CORS rule and `config.json`. A partial set, a certificate outside us-east-1 or this account, or a malformed host name or zone ID stops the plan (`infra/foundation_inputs.tf`).

## Why these choices

- **Terraform owns the values, like `deleted_retention_days` (owner's choice).** They describe infrastructure, not people or credentials, and rarely change, so a change is a reviewed commit that `plan` shows, with no hand-run `put-parameter`. Hand-set parameters stay for secrets (the Google client) and day-to-day values (the allowlist, access levels). The domain and certificate ARN are committed; neither is secret (the domain is in public DNS, the account ID is already in `ci/iam/`).
- **Still through SSM.** The app stack finds foundation values by name, never through remote state ([0004](0004-retained-foundation-and-disposable-app-stack.md)). Empty means "off", so a fresh setup deploys without a domain.
- **The certificate is created outside Terraform.** Validation needs DNS records, possibly in another account or provider, and a us-east-1 provider. Taking an ARN keeps the stack in one region. The app pipeline needs no ACM permission for this: CloudFront's docs list `acm:ListCertificates` only for the console.
- **The DNS records live in the disposable app stack.** They point at the distribution, which is rebuilt with the app. On a rebuild the records follow the new distribution, so the address people use stays the same.
- **One origin only (owner's choice).** The `*.cloudfront.net` address still serves the page, but Cognito, CORS and Google trust only the custom domain, so sign-in works there alone.

## Consequences

- The app address now survives app rebuilds. Bookmarks, home-screen installs and the Google settings stay valid.
- Switching moves sign-in to the new address at once. Home-screen installs of the old `cloudfront.net` link must be re-added once, and the Google OAuth client and API key need the new origin (`docs/deployment.md`).
- The app pipeline can change `A`/`AAAA` records in any hosted zone of the account (`ci/iam/app-pipeline-policy.json`). The zone isn't known when the policy is written, so this can't be narrowed to one zone ahead of time.
- The foundation must write the parameters before the app pipeline uses them. A merge touching `infra/foundation/` starts both pipelines; if the app runs first it plans with the old values (or fails on a missing parameter the first time), and re-running it once the foundation has finished fixes that (as with [0012](0012-deleted-folder-auto-empties-after-30-days.md)).
