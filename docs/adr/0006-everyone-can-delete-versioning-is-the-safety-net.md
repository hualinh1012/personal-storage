# Everyone can delete; bucket versioning is the safety net

There are no roles: every allowlisted person can upload, overwrite and delete anything in the shared drive. Instead of permissions, the files bucket keeps noncurrent versions for 30 days, so an accidental delete or overwrite can be recovered from the AWS console. Roles would mean per-user state, which [0001](0001-no-backend-browser-talks-to-s3.md) rules out, for a family that trusts each other.

Amended by [0009](0009-personal-folders-keyed-by-email.md): each person also has a private folder, enforced by an IAM condition on their email session tag (no per-user state). The shared drive is unchanged, and versioning covers both.

Superseded by [0010](0010-per-person-access-levels-in-ssm.md): per-person access levels (read-only or write on the shared drive, personal folder on or off) are kept in SSM next to the allowlist and enforced by IAM session tags. Versioning stays the safety net.
