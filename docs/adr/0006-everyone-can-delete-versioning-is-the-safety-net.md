# Everyone can delete; bucket versioning is the safety net

There are no roles: every allowlisted person can upload, overwrite and delete anything in the shared drive. Instead of permissions, the files bucket keeps noncurrent versions for 30 days, so an accidental delete or overwrite can be recovered from the AWS console. Roles would mean per-user state, which [0001](0001-no-backend-browser-talks-to-s3.md) rules out, for a family that trusts each other.
