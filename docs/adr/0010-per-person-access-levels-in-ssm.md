# Per-person access levels live in SSM and are enforced by IAM session tags

Supersedes [0006](0006-everyone-can-delete-versioning-is-the-safety-net.md).

Each person has two settings: write or read-only on the shared drive (`Global/`), and whether they have a personal folder. They live in SSM `/family-drive/access` next to the allowlist, as JSON keyed by email:

```json
{ "a@x.com": { "global": "write", "personal": true }, "b@x.com": { "global": "read" } }
```

An allowlisted email with no entry gets read-only `Global/` and no personal folder.

0006 rejected roles because they meant per-user state, which [0001](0001-no-backend-browser-talks-to-s3.md) rules out. This state is config, like the allowlist: no database, no admin screen, no API. The path is the one personal folders already use ([0009](0009-personal-folders-keyed-by-email.md)):

1. The pre token generation trigger ([0003](0003-allowlist-in-cognito-triggers.md)) adds the ID-token claims `global_access` (`read`/`write`) and `personal` (`yes`/`no`).
2. The Identity Pool maps them to session tags, next to `email`.
3. The authenticated role grants writes on `Global/*` only when `aws:PrincipalTag/global_access` is `write`, and the personal-folder statements only when `aws:PrincipalTag/personal` is `yes`. A missing tag fails the condition, so the fallback is read-only.

The web app reads the same claims to hide Upload, Delete, Move, Create folder and Import, but only for display. IAM is the boundary.

## Considered options

- **A comma-separated StringList** (`a@x.com=write+personal,b@x.com=read`), matching `allowed_emails`. Rejected for JSON: new flags (such as `trash`, #24) are plain booleans rather than a growing mini-language, and both Terraform (`jsondecode`) and the Lambda parse it without a custom parser. The parameter is a `String`, because a StringList splits on commas.
- **Separate IAM roles per level**, chosen by Identity Pool role mapping rules. Rejected: one role with tag conditions keeps a single policy, and the personal folder already depends on session tags.

## Consequences

- Versioning stays the safety net for anyone with write access.
- Changes take effect at the person's next token refresh or sign-in (up to about 2 hours, as for allowlist removal), after an app pipeline run: Terraform bakes the value into the Lambda's environment.
- The value is checked twice: Terraform preconditions stop the plan on invalid JSON, unknown keys, bad values, an email listed twice in different case, or an email that isn't on the allowlist; the Lambda's parser applies the same rules and throws if it ever sees a malformed value.
- Set the parameter **before** deploying this change, or everyone falls back to read-only.
