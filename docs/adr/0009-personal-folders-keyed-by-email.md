# Personal folders are keyed by email, enforced with principal tags

Each family member gets a private folder at `Personal/<email>/` next to the shared drive (`Global/`), issue #14. In the app only its owner can list, open, upload to or delete from it. The AWS account owner still sees everything in the console: the restriction is app-only.

The Identity Pool passes the ID token's `email` claim to STS as the session tag `email` (`aws_cognito_identity_pool_provider_principal_tag`, `use_defaults = false`). The authenticated role allows listing `Personal/${aws:PrincipalTag/email}/` and object access to `Personal/${aws:PrincipalTag/email}/*`, nothing else under `Personal/`. A request for someone else's folder gets AccessDenied from S3, whatever the browser sends.

We key by email, not by the Identity Pool identity ID (Amplify's usual `{entity_id}` paths). The Identity Pool lives in the disposable app stack ([0004](0004-retained-foundation-and-disposable-app-stack.md)), so identity IDs change whenever it's recreated and ID-keyed folders would be orphaned. The email survives that, matches the allowlist and is readable in the console.

Consequences:
- Amends [0001](0001-no-backend-browser-talks-to-s3.md): the role may touch `Global/*` **and** the caller's own `Personal/<email>/*`. Still no backend and no database.
- Amends [0006](0006-everyone-can-delete-versioning-is-the-safety-net.md): there is now per-user access, but only as an IAM condition on a tag the token already carries, with no per-user state. In the shared drive everyone can still delete everything. Versioning is the safety net in both places.
- Home lists only `Global/` and the signed-in person's folder (`listDriveLocations()` in `web/src/config.ts` replaces the Amplify adapter's `listLocations`). Listing everyone's would mean shipping the allowlist to the browser, and IAM would deny opening them anyway.
- IAM compares prefixes case-sensitively. The app lower-cases the email when building the prefix, and the tag is the raw claim, so they agree only because Google sends lower-case emails. If that ever changes, that person gets AccessDenied in their own folder.
- Session tag values allow only letters, digits, spaces and `_.:/=+-@`, up to 256 characters. Ordinary email addresses fit.
- Move and Copy stay inside the current location; there is no moving between the shared drive and a personal folder. Google Drive import writes to whichever folder is open, personal ones included.
- Someone removed from the allowlist keeps their folder in S3, unreachable from the app. The owner deletes it in the console if needed.
