# Writers can restore earlier versions where they can write

Anyone who can write in a location can see a file's earlier **versions** (ADR 0006) and restore one from the app. **Versions** goes in the file's ⋮ menu. Restoring copies the chosen version on top of the file, so the current content becomes a version itself and nothing is lost. Versions are kept 30 days (`infra/foundation/files.tf`), so that is the window.

Who can do it follows the existing write rules:
- **Shared drive:** people with `global: "write"`.
- **Personal folder:** its owner, with `personal: true`.
- **Deleted folder:** no change. Trash managers already restore whole files there (ADR 0011).

## IAM

The authenticated role (`infra/identity.tf`) gains, under the same tag conditions as writing:
- `s3:ListBucketVersions` with the same `s3:prefix` conditions as `s3:ListBucket`;
- `s3:GetObjectVersion` on `Global/*` (write tag) and `Personal/${aws:PrincipalTag/email}/*` (personal tag).

Restoring is a `CopyObject` from `?versionId=` to the same key, which needs `GetObjectVersion` on the source and `PutObject` on the target. Writers already have `PutObject`. **No `DeleteObjectVersion`:** writers can bring back history but can't erase it.

The Location policy (`web/src/locationPolicy.ts`) gains a capability for it, granted wherever `write` is. Its table test and `infra/identity.tf` change together, as every change to who can do what does.

## Why

Brief 1.0.0 measure M2: no file-recovery request should need the owner and the AWS console when a writer could do it in the app. Writers are the people who overwrite files, by editing a text file (last write wins, #45) or uploading over one. Only trash managers was considered and rejected: most writers aren't trash managers, so the owner would still be asked.

## Consequences

- Readers can't see versions. A version may hold content a writer deliberately replaced.
- A restore never blocks on a conflict: it's last write wins, like Edit, and the replaced content stays as a version for 30 days.
- New S3 actions go into `ci/iam/` only if the pipeline itself needs them. Here only the app role changes.
