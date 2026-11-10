# The allowlist is enforced by Cognito triggers

Only emails listed in SSM `/family-drive/allowed_emails` get in. Two Lambda triggers check them: **Pre sign-up** (an unlisted Google account never becomes a Cognito user) and **Pre token generation** (runs on every sign-in and token refresh, so removing an email takes effect without deleting the user). The list is config, not an admin screen, because the owner adds people rarely and by hand.

## Consequences

- Both triggers deny with `Error("ACCESS_DENIED")`, and `web/src/authErrors.ts` matches that exact string to show the access-denied page. Keep them identical.
- A removed person keeps their current AWS credentials until they expire (tokens last 60 minutes).
- Pre token generation also adds the access-level claims `global_access` and `personal` from SSM `/family-drive/access` ([0010](0010-per-person-access-levels-in-ssm.md)).
