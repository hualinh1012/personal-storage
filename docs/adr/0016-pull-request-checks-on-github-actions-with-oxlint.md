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

- Rules are errors when they catch bugs (the `correctness` category, `rules-of-hooks`). Rules the code breaks on purpose today are **warnings**, so they show in the log without failing the check:
  - `react/refs`: `useStableItems` and `DriveView` read refs during render deliberately (Storage Browser's `useAction` resets on new arrays);
  - `react/set-state-in-effect` and `react/exhaustive-deps`: the pager, the New menu, the upload picker and two previews.
  Each needs a careful look before it becomes an error; changing them blind risks the update loops `useStableItems` exists to stop.
- Turned off: `vitest/require-mock-type-parameters` (style only), `jsx-a11y/prefer-tag-over-role` (`role="status"` on a `div` is fine) and `jsx-a11y/control-has-associated-label` (it flags empty skeleton cells in an `aria-hidden` row).
- The check doesn't cover what needs AWS: `terraform plan`, the S3 contract test (`driveStorage.s3.test.ts`, skipped without a bucket) and the deployed app. Those stay with the pipeline and the end-to-end checklist in `docs/deployment.md`.
- The repository is public, so Actions minutes are free. Requiring the check before merging is a branch protection setting on GitHub, which the owner turns on.
