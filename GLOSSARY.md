# Glossary

Family Drive's terms. Use them as written here in issues, code, tests and docs.

## Locations

A **location** is a top-level place in the files bucket that Storage Browser opens. Its
**kind** is how `web/src/locationPolicy.ts` classifies a prefix or key.

| Term | Kind | Prefix | Who can open it |
|---|---|---|---|
| **Shared drive** | `shared` | `Global/` | Everyone on the allowlist (reads); writers change it |
| **Personal folder** | `personal` | `Personal/<email>/` (lower-cased, ADR 0009) | Only its owner, with the `personal` flag |
| **Deleted folder** | `deleted` | `Deleted/` (ADR 0011) | Only people with the `trash` flag |
| (anything else) | `other` | e.g. someone else's personal folder | Nobody, through the app |

_Avoid:_ "trash" or "bin" for the Deleted folder in UI text (the flag is named `trash`);
"home folder" for the personal folder (**Home** is Storage Browser's list of locations).

**Home**: Storage Browser's start screen listing the locations the person can read.

## Access

**Allowlist**: the emails allowed to sign in (SSM `/family-drive/allowed_emails`, ADR 0003).

**Access level**: a person's set of **access flags** (SSM `/family-drive/access`, ADR 0010).
Unlisted allowlisted people get read-only shared drive and nothing else.

| Flag | Claim / session tag | Grants |
|---|---|---|
| `global: "write"` | `global_access` = `write` | Write, move and delete in the shared drive |
| `personal: true` | `personal` = `yes` | A personal folder |
| `trash: true` | `trash` = `yes` | Sees and manages the Deleted folder |

**Capabilities**: what the Location policy says a person can do in a location: `read`
(list, download), `write` (upload, create folder, copy into, import, edit), `move` (Move, and
Delete, which moves to the Deleted folder), `manageDeleted` (Restore, Delete permanently,
Empty Deleted), `restoreVersions` (list a file's earlier versions and restore one; exactly where
`write` is, never in the Deleted folder). Display only: IAM session tags are the boundary.

**Location policy**: `web/src/locationPolicy.ts`, the one browser-side mirror of the IAM
policy in `infra/identity.tf` (issue #38).

## Recovery

**Version**: an earlier state of a file kept by S3 versioning for 30 days after it's overwritten or
deleted (ADR 0006). Same bucket, same account.

**Backup copy**: a copy of a file outside the files bucket (another region or account), never read
by the app. **None exists today** (ADR 0018).

_Avoid:_ "backup" for versions or the Deleted folder: neither survives loss of the bucket.
