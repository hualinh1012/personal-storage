# The Cognito domain is fixed: family-drive-<account id>

Google only accepts sign-in redirects to the URIs registered on the OAuth client by hand, and Cognito's redirect URI is built from its domain. The domain used to carry a random Terraform suffix, so every rebuild of the app stack broke Google sign-in with `redirect_uri_mismatch`. It's now `family-drive-<account id>`: unique in the region and stable across rebuilds.

## Consequences

Switching from the random suffix needed a one-time update of the redirect URI in Google Cloud (November 2026). Moving to another AWS account changes the domain again.
