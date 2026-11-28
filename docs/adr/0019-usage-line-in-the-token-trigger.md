# Active use is counted from one log line per token issue

The pre token generation trigger (`functions/allowlist/src/preTokenGeneration.ts`) writes **one structured log line** each time it issues tokens: `{"event":"token","email":"<lower-cased email>","source":"<trigger source>"}`. Its CloudWatch log group keeps lines for **90 days**. The owner counts active people each month with a saved CloudWatch Logs Insights query (distinct `email` per month), documented in `docs/deployment.md`. This is how brief 1.0.0 measure M3 (at least 2 active family members a month) is measured.

## Why

- The trigger already runs on every sign-in and every token refresh, about hourly while someone has the app open, so a line there means "was active", not only "signed in". Nothing new runs, and there's no new service.
- The cost is a few kilobytes a month, well inside the free CloudWatch Logs allowance, so it fits the $2 ceiling (ADR 0018, target principle P10).

## Considered and rejected

- **CloudTrail data events on the files bucket:** it would show file activity per person, but it's billed per request and needs a trail bucket. It's more than M3 needs.
- **Cognito's sign-in activity (Plus feature plan):** paid per active user.
- **Analytics in the SPA:** needs an endpoint to send to, and there is no backend (ADR 0001).

## Consequences

- NFR-P3 changes from "trigger Lambdas log only errors" to "trigger Lambdas log errors and one usage line, with the email and never a token or file name".
- The email in the line is personal data the owner already holds in the allowlist. It's removed after 90 days.
- The pre token generation log group's retention goes from 14 to 90 days (`infra/auth.tf`). The pre sign-up group stays at 14.
- A line is only written when tokens are issued. Someone who opens the app once and leaves within the hour counts once that month, which is enough for M3.
