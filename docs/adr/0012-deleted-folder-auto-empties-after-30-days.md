# The Deleted folder empties itself after 30 days, through an S3 lifecycle rule

Amends [0011](0011-delete-moves-to-a-deleted-folder.md), where `Deleted/` grew until a trash manager emptied it.

S3 now removes a file from `Deleted/` **30 days after it was deleted**, with every version, so the trash can't grow forever and "deleted" eventually means gone without anyone having to empty it. A trash manager can still Restore, Delete permanently or Empty Deleted before then.

The files bucket's lifecycle configuration (`infra/foundation/files.tf`) gets two rules filtered to the prefix `Deleted/`:

- `expire-deleted-folder`: current versions expire after `var.deleted_retention_days` (30), and noncurrent versions 1 day after they become noncurrent.
- `remove-deleted-folder-delete-markers`: removes the delete marker left once nothing is under it (`expired_object_delete_marker`). S3 doesn't allow it in the same `expiration` block as `days`.

## Why these choices

- **A lifecycle rule, not code.** There's no backend (ADR 0001), and the app can't sweep the trash on someone's visit: only trash managers can list `Deleted/`, and they may not sign in for months.
- **The age is the deletion time.** Lifecycle counts from an object's creation, and a delete in the app is a copy into `Deleted/`, which creates a new object. Restoring and deleting again starts a fresh 30 days.
- **Noncurrent versions under `Deleted/` go after 1 day, not the bucket-wide 30.** In a versioned bucket, expiring a current version only adds a delete marker; without the shorter rule the file would sit for another 30 days as a noncurrent version, visible in the console, after the app said it was gone. S3 applies the shorter of two overlapping expirations.
- **One number, two readers.** The retention is a foundation Terraform variable. The foundation also writes it to SSM `/family-drive/deleted_retention_days`, which the app stack reads by name (like its other foundation inputs) and passes through `config.json` to the SPA, which says in `Deleted/` when files there are removed. Unlike the other SSM parameters, Terraform owns this value: change the variable, never the parameter.

## Consequences

- A file is recoverable from the app for 30 days after deletion, and from nowhere after about 31.
- Lifecycle runs asynchronously: S3 may remove a file a day or two after it's due. The note says when it becomes eligible.
- Other prefixes are unaffected; `Global/` and personal folders keep the bucket-wide 30-day noncurrent rule.
- Changing the retention means: change `deleted_retention_days`, run the foundation pipeline, then the app pipeline (which rewrites `config.json`). A shorter value applies to files already in `Deleted/`.
- The app stack needs the parameter, so the foundation must be applied with this change before the app pipeline runs, or the app plan fails on a missing parameter.
- Intelligent-Tiering ([0013](0013-files-in-intelligent-tiering-without-archive-tiers.md)) must not transition `Deleted/`: those files are short-lived, and its monitoring fee would buy nothing.
