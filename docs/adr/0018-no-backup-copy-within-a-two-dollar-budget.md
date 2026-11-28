# No backup copy of the files while the budget is about $2 a month

Family Drive's whole running cost is kept to **about $2 a month**, and that ceiling outranks data durability. So there is **no backup copy** of the files outside the files bucket: no replication to another region or account, and no export. This confirms #54 (closed as not planned) and the accepted gap NFR-A4, now as a decision the owner made in [brief 1.0.0](../product/brief/1.0.0.md) rather than only a cost note.

What protects the files today: versioning (noncurrent versions kept 30 days, ADR 0006), the Deleted folder (ADR 0011, 0012), `prevent_destroy` on the foundation stack (ADR 0004), and gated pipelines with a permissions boundary (#52, #53).

## Why a future reader will question this

The brief ranks data durability first among the quality attributes, and the [security assessment](../security/assessment-2026-11.md) rates the lack of a backup High (S3). A cross-region or cross-account copy in S3 Glacier Deep Archive is cheap per GB. The ceiling still wins, for two reasons:
- Replication bills more than Deep Archive storage: replication PUT requests per object, cross-region transfer per GB, and the 180-day minimum on every overwritten or deleted object. For a photo library, those charges together with the current storage cost can pass $2 a month.
- The owner chose a fixed, small monthly cost over insurance against a rare event.

ADR 0013's "no archive tiers" rule is not the reason. That rule covers files the app reads, and a backup copy would never be read by the app.

## Consequences

- Losing the bucket or the account, or noticing a mistake after 30 days, loses files for good (risk R1 in the brief).
- The owner should keep the copies people already have elsewhere (phones, Google) until this changes.
- Revisit when the budget rises, or when the stored data is small enough that a Deep Archive copy fits under the ceiling (brief Q3). Reversing this decision means a new ADR and a foundation-stack change.
