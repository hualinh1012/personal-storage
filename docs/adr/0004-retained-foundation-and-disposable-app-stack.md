# Two Terraform stacks: a retained foundation and a disposable app

`infra/foundation/` holds what must never be lost: the state bucket, the files bucket and the SSM parameters, all with `prevent_destroy`. It's applied only through `bootstrap.sh`. `infra/` holds everything that can be rebuilt (Cognito, Lambdas, Identity Pool, CloudFront, the web bucket) and can be destroyed and redeployed freely. The app stack finds foundation resources **by naming convention through data sources**, not through remote state, so it never depends on the foundation's state layout.

## Consequences

Anything an outside system remembers must survive an app rebuild. That's why the Cognito domain is fixed ([0005](0005-fixed-cognito-domain.md)). The CloudFront URL still changes on a rebuild, which breaks bookmarks and home-screen installs until a custom domain is added.
