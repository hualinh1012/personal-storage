# Files move to S3 Intelligent-Tiering, with its archive tiers off

The files bucket's current versions under `Global/` and `Personal/` move to **S3 Intelligent-Tiering** through a lifecycle transition at 0 days (`infra/foundation/files.tf`, rules `intelligent-tiering-global` and `intelligent-tiering-personal`). Most family files are rarely opened after the first weeks. Intelligent-Tiering moves those to its Infrequent Access tier (about 40% cheaper) after 30 days without a read and to Archive Instant Access (about 68% cheaper) after 90, and moves a file back to Frequent Access when someone opens it.

**Only the tiers that serve a read immediately are used.** There is no `aws_s3_bucket_intelligent_tiering_configuration`, because that resource is what turns on the optional Archive Access and Deep Archive Access tiers. Don't add one.

## Why not something cheaper

- **Glacier Flexible Retrieval / Deep Archive, or Intelligent-Tiering's archive tiers:** a GET on an archived object fails until someone restores it, which takes minutes to 12+ hours. Download and preview would break, and so would Move and Delete (both copy, and S3 won't copy an archived object). The app has no restore flow and no backend to run one (ADR 0001). Glacier also bills a 90- or 180-day minimum.
- **Glacier Instant Retrieval:** it works, but every download and preview pays a per-GB retrieval fee, with a 90-day minimum and a 128 KB minimum billable size. A family drive is read unpredictably. Intelligent-Tiering has no retrieval fee and no minimum duration.

## Why these details

- **`Deleted/` stays in Standard.** Files there are gone within `deleted_retention_days` (ADR 0012). Intelligent-Tiering only saves money after 30 days without a read, so for those files the per-object monitoring fee and the transition request would buy nothing. Lifecycle filters take one prefix, hence one rule per prefix.
- **Transition at 0 days, not set at upload.** Storage Browser and Google import upload through Amplify, which doesn't let us pick a storage class, and copies (Move, Delete into `Deleted/`, Restore) land in Standard because S3 copies to Standard unless told otherwise. The lifecycle rule picks all of them up on its next run, usually within a day or two, so nothing in the app has to know about storage classes. A Deleted file that's restored goes back through the transition.
- **Small files stay in Standard.** By default, S3 lifecycle doesn't transition objects under 128 KB, and Intelligent-Tiering would bill them as Frequent Access anyway without monitoring them.
- **Noncurrent versions keep the class they had.** The rule only moves current versions; the bucket-wide 30-day noncurrent expiry is unchanged.

## Consequences

- Download, preview, Move, Copy, Delete, Restore and listing behave exactly as before, because every tier in use serves a GET immediately.
- Each object over 128 KB adds a small monthly monitoring fee, and each transition is a one-off request charge, which also applies once to the files already in the bucket. For photos, videos and documents the tier savings outweigh both.
- A file someone opens again goes back to Frequent Access and is billed at the Standard rate until it's left alone for another 30 days.
- The change lives in the foundation stack, so it's applied by the foundation pipeline. Its role already has `s3:PutLifecycleConfiguration`.
