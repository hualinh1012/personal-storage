# Delete moves files to a Deleted folder; only trash managers remove them for good

Amends [0010](0010-per-person-access-levels-in-ssm.md) (a third access flag) and narrows what "versioning is the safety net" meant in [0006](0006-everyone-can-delete-versioning-is-the-safety-net.md).

Bucket versioning made an accidental delete recoverable for 30 days, but only from the AWS console, and a delete in the app was instant. Now Delete in the app **moves** a file to `Deleted/`, keeping its path and stamping its name:

```
Global/photos/a.jpg → Deleted/Global/photos/a (deleted 2026-11-10 14-03-12 7f2c).jpg
```

People with the new `trash` access flag (`{"global": "write", "trash": true}` in SSM `/family-drive/access`) see `Deleted/` on Home and can **Restore** (back to the original key, never over an existing file), **Delete permanently** and **Empty Deleted**. Both of the last two remove every version, so nothing is left in the console either. Everyone else can move files *into* `Deleted/` but cannot list or read it.

There is one shared `Deleted/`, including files deleted from personal folders (`Deleted/Personal/<email>/...`). The owner accepted that trash managers can see those.

## Why these choices

- **The original key is in the name, not in object metadata.** People without `trash` can't read `Deleted/`, so a move into it can't check for a clash; a timestamp plus four random characters makes every deleted copy unique without a check. Restore parses the stamp back out. Storage Browser's copy handler (Amplify `copy`) can't set metadata anyway.
- **Writes into `Deleted/` mirror write access.** `Deleted/Global/*` takes writes from people with `global_access` = `write`, and `Deleted/Personal/<own email>/*` from people with a personal folder. Nobody can drop files into another person's part.
- **The built-in Delete is reused, with a new handler.** Storage Browser shows its Delete only where the location has `delete` permission. `Global/` and personal folders keep `write` + `delete`, so Delete (now "move to Deleted") shows there; `Deleted/` has `delete` without `write`, so it gets Restore, Delete permanently and Empty Deleted, and nothing that writes.
- **The AWS SDK (`@aws-sdk/client-s3`) handles the S3 calls,** because Amplify Storage has no version APIs (`ListObjectVersions`, `DeleteObject` with a version ID). It loads on first use, outside the main bundle.

## Consequences

- This protects against mistakes **in the app**, not against someone using their raw credentials: a move deletes the source, so writers still have `s3:DeleteObject` on `Global/*`. Versioning stays the backstop for that.
- "Delete permanently" purges versions under `Deleted/` only. The move left a noncurrent version at the original key, which the bucket's 30-day noncurrent-version rule expires; purging it immediately would need `s3:DeleteObjectVersion` on `Global/*`, which isn't granted.
- A trash manager can't restore into someone else's personal folder (no write there); Restore says so instead of failing with AccessDenied.
- A move is a single-request S3 copy, so files over 5 GB can't be deleted from the app, as with Move.
- `Deleted/` grows until someone empties it; auto-empty after 30 days is #25.
- Set `"trash": true` for at least one person, or nobody can see or empty `Deleted/`.
