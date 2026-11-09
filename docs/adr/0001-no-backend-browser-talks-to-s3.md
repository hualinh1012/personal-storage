# No backend: the browser talks to S3 directly

Family Drive has no API layer and no database. The SPA gets temporary AWS credentials from a Cognito Identity Pool and calls S3 itself, and S3 is the only source of truth: metadata is only what S3 returns. A family drive doesn't need anything a server would add, and having no server means nothing to run, patch or pay for while idle. Don't add an API or a database to support a feature. Find a browser-side or S3-native way, or bring the trade-off back to the owner.

## Consequences

- The Identity Pool's authenticated role (`infra/identity.tf`) is the security boundary. It may touch only `files-bucket/drive/*`, so every family file lives under `drive/`.
- Long-running work (for example importing from Google Drive) runs in the user's tab and stops when the tab closes.
