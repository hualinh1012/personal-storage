# Custom domain from SSM, with Route 53 records in the app stack

Amends [0004](0004-retained-foundation-and-disposable-app-stack.md), whose consequence was that the CloudFront URL changes on every app rebuild "until a custom domain is added".

The app can be served at a custom domain such as `drive.example.com`. Three foundation SSM parameters switch it on, and they're all `CHANGE_ME` by default:

- `/family-drive/custom_domain`: the host name;
- `/family-drive/certificate_arn`: an issued ACM certificate in **us-east-1** covering it (CloudFront only uses certificates from that region);
- `/family-drive/hosted_zone_id`: the Route 53 zone in this account that holds the name.

When all three are set, the app stack (`infra/web.tf`):
- adds the domain to the distribution's `aliases`;
- uses the certificate (SNI, minimum `TLSv1.2_2021`);
- creates `A` and `AAAA` alias records to the distribution;
- makes the domain the app's **only** trusted origin (`local.app_url`).

That origin feeds Cognito's callback and logout URLs, the files bucket's CORS rule and `config.json`. A partial set, a certificate outside us-east-1 or this account, or a malformed host name or zone ID stops the plan (`infra/foundation_inputs.tf`).

## Why these choices

- **SSM, like the other deployment values.** The repo stays free of one family's domain, and setting a domain is the same `put-parameter` step as the allowlist. Placeholders mean "off", as with Google import, so a fresh setup deploys without a domain.
- **The certificate is created outside Terraform.** Validation needs DNS records, possibly in another account or provider, and a us-east-1 provider. Taking an ARN keeps the stack in one region. The app pipeline needs no ACM permission for this: CloudFront's docs list `acm:ListCertificates` only for the console.
- **The DNS records live in the disposable app stack.** They point at the distribution, which is rebuilt with the app. On a rebuild the records follow the new distribution, so the address people use stays the same.
- **One origin only (owner's choice).** The `*.cloudfront.net` address still serves the page, but Cognito, CORS and Google trust only the custom domain, so sign-in works there alone.

## Consequences

- The app address now survives app rebuilds. Bookmarks, home-screen installs and the Google settings stay valid.
- Switching moves sign-in to the new address at once. Home-screen installs of the old `cloudfront.net` link must be re-added once, and the Google OAuth client and API key need the new origin (`docs/deployment.md`).
- The app pipeline can change `A`/`AAAA` records in any hosted zone of the account (`ci/iam/app-pipeline-policy.json`). The zone isn't known when the policy is written, so this can't be narrowed to one zone ahead of time.
- The foundation must create the parameters before the app pipeline runs with this change, or the app plan fails on a missing parameter (as with [0012](0012-deleted-folder-auto-empties-after-30-days.md)).
