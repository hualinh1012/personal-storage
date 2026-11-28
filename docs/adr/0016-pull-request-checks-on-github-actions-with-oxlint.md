# Pull-request checks on GitHub Actions, linted with oxlint

> Partly superseded by [ADR 0017](0017-github-actions-starts-codepipeline-with-oidc.md): GitHub Actions now
> starts the CodePipelines (with OIDC), and `ci.yml` runs on push to `main` only as part of `deploy.yml`.
> `ci.yml` itself still has no AWS access.

Until now nothing checked a pull request: CodePipeline runs the tests only after a merge to `main`, as part of deploying. `.github/workflows/ci.yml` now runs on every pull request and every push to `main`:

- **Lambdas** (`functions/allowlist`): lint, type-check, test, build, on Node 22 (the Lambda runtime).
- **Web app** (`web`): lint, test, build (`tsc --noEmit` + `vite build`), on Node 22 (the documented minimum).
- **Terraform**: `fmt -check`, then `init -backend=false` and `validate` for both stacks.

It has no AWS credentials and needs none: **deploying stays in CodePipeline** (`ci/pipeline.sh`), which still runs its own tests before applying. The workflow only reads the repository (`permissions: contents: read`), and every action is pinned to a commit SHA.

The linter is **oxlint**, not ESLint. The project is on TypeScript 7, which no longer ships the JavaScript compiler API (`createSourceFile` and the rest) that typescript-eslint parses with. oxlint has its own TypeScript parser and covers the rules we want: correctness, React hooks, JSX accessibility and Vitest. Each package has an `.oxlintrc.json` and an `npm run lint` script; oxlint is pinned to an exact version.

## Consequences

- Rules are errors when they catch bugs (the `correctness` category, `rules-of-hooks`). At first, rules the code broke on purpose were **warnings**: `react/refs` (`useStableItems`, `DriveView`), `react/set-state-in-effect` and `react/exhaustive-deps` (the pager, the New menu, the upload picker and two previews).
- **Amended (#84):** those 11 warnings are gone and the three rules are errors; `npm run lint` runs with `--deny-warnings` in both packages, so a new warning fails the check too.
  - Fixed: state that follows a prop is adjusted while rendering (New menu, PDF page, the pager's jump, which remembers the listing it started on); Markdown keeps the URL its result is for; the pager's `onPaginate` and the upload picker's first-open check are `useEffectEvent`s; folder notes get where the person is (`NoteHost`), not the host's ref-reading functions.
  - Allowed in the code: `useStableItems` reads and writes its ref while rendering on purpose (`// oxlint-disable-next-line react/refs`, with the reason). Changing it risks the update loops it exists to stop.
- Turned off: `vitest/require-mock-type-parameters` (style only), `jsx-a11y/prefer-tag-over-role` (`role="status"` on a `div` is fine) and `jsx-a11y/control-has-associated-label` (it flags empty skeleton cells in an `aria-hidden` row).
- **Amended (#103):** three more offline jobs. **IaC scan** with Trivy (`trivy config infra`, both stacks): every finding is reported, high and critical fail the job. Trivy is a release binary pinned by version and SHA-256 rather than `aquasecurity/trivy-action`, whose tags were rewritten in a 2026 supply-chain attack; it uses the checks bundled in the binary (`--skip-check-update`), so results change only with the version. Accepted findings are suppressed where they occur (`#trivy:ignore:<ID>` with a one-line reason): no KMS, no WAF, the default CloudFront certificate's TLS minimum, all accepted in the [security assessment](../security/assessment-2026-11.md). **ShellCheck** on every tracked `*.sh` (the runner's copy). **actionlint** on `.github/workflows/`, pinned the same way as Trivy. Trivy over Checkov: one static binary with a severity filter, no Python toolchain.
- The check doesn't cover what needs AWS: `terraform plan`, the S3 contract test (`driveStorage.s3.test.ts`, skipped without a bucket) and the deployed app. Those stay with the pipeline and the end-to-end checklist in `docs/deployment.md`.
- The repository is public, so Actions minutes are free. Requiring the check before merging is a branch protection setting on GitHub, which the owner turns on.
