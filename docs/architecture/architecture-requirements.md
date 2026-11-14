# Architecture Requirements Specification

What Family Drive must do and how well, as the measurable companion to
[architecture-definition.md](architecture-definition.md) (ADD). Every requirement traces to an ADD
section and to the ticket or feature doc that delivers it. [architecture-contract.md](architecture-contract.md)
says how changes are checked against this document.

- **Version:** 1.0, 14 November 2026.
- **Status column:** **Met** (in `main`), **Open** (ticket pending), **Accepted gap** (deliberately not met).

## 1. Functional requirements

### Access

| ID | Requirement | ADD | Delivered by | Status |
|---|---|---|---|---|
| FR-01 | People sign in with Google; there is no other sign-in or self sign-up. | §3, §7 | [auth-and-access.md](../features/auth-and-access.md) | Met |
| FR-02 | Only emails on the allowlist, verified by Google, get in; others see an access-denied page. | §3 | ADR 0003, [auth-and-access.md](../features/auth-and-access.md) | Met |
| FR-03 | Removing an email from the allowlist ends that person's access without deleting anything. | §3 | ADR 0003 (pre token generation on every refresh) | Met |
| FR-04 | Each person can have read or write access to the shared drive, and optionally a personal folder and trash management. | §3 | #15, ADR 0010, ADR 0011 | Met |
| FR-05 | The owner changes people and access levels through configuration (SSM) and a pipeline run, with no admin screen. | §2 P4 | ADR 0010, [deployment.md](../deployment.md) | Met |

### Files

| ID | Requirement | ADD | Delivered by | Status |
|---|---|---|---|---|
| FR-10 | Everyone signed in can browse, search, preview and download the shared drive. | §3 | [global-drive.md](../features/global-drive.md) | Met |
| FR-11 | Writers can upload files and folders, create folders, copy and move files in the shared drive. | §3 | [global-drive.md](../features/global-drive.md) | Met |
| FR-12 | Move and Copy never overwrite a file silently; Move deletes the original only after a successful copy. | §3 | `web/src/move/` | Met |
| FR-13 | The file list shows its page and total ("Page X of N · M items"). | §5 | #11 | Met |
| FR-14 | Photos, videos, text, Markdown and PDF can be previewed; other types can be downloaded. | §5 | [file-preview.md](../features/file-preview.md) | Met |
| FR-15 | Writers can edit `.txt` files in place. | §3 | #45 | Met |
| FR-16 | Writers can import files and whole folders from their Google Drive into the open folder; Docs, Sheets and Slides are converted; re-runs skip what's done; nothing is overwritten. | §3, §5 | #1–#10, [google-import.md](../features/google-import.md) | Met |

### Privacy and recovery

| ID | Requirement | ADD | Delivered by | Status |
|---|---|---|---|---|
| FR-20 | A person with a personal folder can do everything there; nobody else can open it from the app. | §3, §7 | #14, ADR 0009, [personal-folders.md](../features/personal-folders.md) | Met |
| FR-21 | Delete in the app moves files to a Deleted folder instead of removing them. | §3 | #24, ADR 0011 | Met |
| FR-22 | Trash managers can restore (never over an existing file), delete permanently and empty the Deleted folder. | §3 | #24, [deleted-folder.md](../features/deleted-folder.md) | Met |
| FR-23 | Files in the Deleted folder are removed automatically after 30 days, and the app says so. | §4 | #25, ADR 0012 | Met |
| FR-24 | An overwritten file, or one deleted outside the app, can be recovered for 30 days. | §4 | ADR 0006, [storage-and-retention.md](../features/storage-and-retention.md) | Met (console only) |

### Experience

| ID | Requirement | ADD | Delivered by | Status |
|---|---|---|---|---|
| FR-30 | The app can be installed on a phone's home screen. | §5 | ADR 0007 | Met |
| FR-31 | The app looks and works like Google Drive (sidebar, "+ New", search, type icons), with its own branding. | §3, §8 | #13 | Open |

## 2. Non-functional requirements

### Security

| ID | Requirement | Measure | ADD | Delivered by | Status |
|---|---|---|---|---|---|
| NFR-S1 | Every file permission is enforced by IAM, not by the UI. | No S3 request outside the role's prefixes and tag conditions succeeds (IAM simulator or console checks in the end-to-end checklist) | §7 | ADR 0009, ADR 0010 | Met |
| NFR-S2 | An outsider can't reach any file. | No unauthenticated Identity Pool role; buckets private and TLS-only | §7 | [security assessment](../security/assessment-2026-11.md) | Met |
| NFR-S3 | Content of uploaded files is never executed in the app's origin. | Viewers' safety rules and their tests | §7 | [file-preview.md](../features/file-preview.md) | Met |
| NFR-S4 | A defence in depth against script injection. | A Content Security Policy is sent | §7 | #55 | Open |
| NFR-S5 | Changing production requires review. | `main` protected; foundation pipeline gated | §7 | #52 | Open |
| NFR-S6 | Pipelines can't grant themselves more than the app needs. | Permissions boundary on created roles | §7 | #53 | Open |
| NFR-S7 | Production trusts only its own origin. | No `localhost` in callbacks, CORS or Google origins | §7 | #57 | Open |
| NFR-S8 | No known high or critical vulnerability ships. | `npm audit` clean in both packages; IaC scan triaged | §7 | #12 (baseline), #22 (won't fix: continuous) | Met for npm; IaC scan pending |

### Privacy

| ID | Requirement | Measure | Delivered by | Status |
|---|---|---|---|---|
| NFR-P1 | A removed person loses access quickly. | Within about 2 hours, or at once by deleting their Cognito user | ADR 0003 | Met |
| NFR-P2 | The Google token isn't stored or sent anywhere but Google. | In memory only; `driveClient.ts` the only caller | ADR 0008 | Met |
| NFR-P3 | Logs hold no file contents and no tokens. | Trigger Lambdas log only errors | [auth-and-access.md](../features/auth-and-access.md) | Met |

### Availability and recoverability

| ID | Requirement | Measure | Delivered by | Status |
|---|---|---|---|---|
| NFR-A1 | Every file is always readable at once. | No archive storage class or archive tier | ADR 0013 | Met |
| NFR-A2 | Rebuilding the app never touches the files or settings. | App stack destroy and redeploy keeps the foundation | ADR 0004 | Met |
| NFR-A3 | Mistakes are recoverable for 30 days. | Versioning + Deleted folder | ADR 0006, 0011, 0012 | Met |
| NFR-A4 | The files survive loss of the bucket or the account. | Independent backup | #54 | Accepted gap (cost) |
| NFR-A5 | Misuse or failure is noticed promptly. | Trail, alarms, budget alert | #56 | Accepted gap (cost) |

### Cost

| ID | Requirement | Measure | Delivered by | Status |
|---|---|---|---|---|
| NFR-C1 | Nothing costs money while idle except storage. | No servers, databases or always-on services | ADR 0001 | Met |
| NFR-C2 | Storage gets cheaper for files nobody opens. | Intelligent-Tiering on `Global/` and `Personal/` | #18, ADR 0013 | Met |
| NFR-C3 | Running cost stays at a few dollars a month for a family's files. | See [storage-and-retention.md](../features/storage-and-retention.md#cost) | ADD §1 | Met (no alert: NFR-A5) |

### Performance and limits

| ID | Requirement | Measure | Delivered by | Status |
|---|---|---|---|---|
| NFR-L1 | Large folders stay usable. | 100 rows per page with a total; jump to any page | #11 | Met |
| NFR-L2 | Large uploads work. | Multipart over 5 MiB, up to 160 GB per file | [global-drive.md](../features/global-drive.md) | Met |
| NFR-L3 | Preview never loads huge files. | 50 MB limit for every type | [file-preview.md](../features/file-preview.md) | Met |
| NFR-L4 | Imports don't exhaust the browser. | 500 MB per file, 3 at a time | #9 | Met |

### Browser and phone support

| ID | Requirement | Measure | Status |
|---|---|---|---|
| NFR-B1 | Works on current desktop Chrome, Edge, Firefox and Safari. | End-to-end checklist | Met |
| NFR-B2 | Works on Android Chrome and iPhone Safari, installed or not; nothing scrolls sideways. | Phone items in the end-to-end checklist; playground at phone width | Met (iOS home-screen app signs in separately: known gap) |

## 3. Constraints and assumptions

| ID | Constraint or assumption | Source |
|---|---|---|
| C-1 | One family, tens of people at most; everyone allowlisted trusts each other. | ADD §1, ADR 0006 |
| C-2 | Google is the only identity provider; every member has a Google account and is a Google test user while the consent screen is in Testing. | ADR 0003, ADR 0008 |
| C-3 | AWS region `ap-southeast-1`; one AWS account. | [deployment.md](../deployment.md) |
| C-4 | No backend and no database. | ADR 0001 |
| C-5 | A small budget: no paid backup, monitoring or WAF. | #54, #56 |
| C-6 | One operator, who is also the architecture authority. | [architecture-contract.md](architecture-contract.md) |
| C-7 | The allowlist and access levels fit in the Lambda's 4 KB environment. | [auth-and-access.md](../features/auth-and-access.md#limits-and-quotas) |
| C-8 | Long work (imports, emptying the trash) runs in a browser tab and stops if it's closed. | ADR 0001 |

## 4. Interoperability requirements

| ID | System | Requirement | Where |
|---|---|---|---|
| I-1 | Google OAuth (through Cognito) | Web-application OAuth client with the Cognito `/oauth2/idpresponse` redirect URI; scopes `openid email profile` | `infra/auth.tf`, [deployment.md step 4](../deployment.md#4-finish-google-sign-in) |
| I-2 | Google Identity Services | Token client for `drive.readonly`; the site as an Authorized JavaScript origin | `web/src/googleImport/google.ts` |
| I-3 | Google Picker | API key restricted to the site and the Picker API; project number as the app ID | same, [deployment.md step 4b](../deployment.md#4b-google-drive-import-setup-optional) |
| I-4 | Google Drive API v3 | `files.list`, `files.get?alt=media`, `files.export`; retry on 429, 5xx and rate-limit 403s | `web/src/googleImport/driveClient.ts`, `retry.ts` |
| I-5 | AWS Storage Browser | CORS on the files bucket as Storage Browser requires; re-check custom parts after upgrades | `infra/storage.tf`, CLAUDE.md |

## 5. Conformance criteria

How to check that the build matches this specification:

| Check | Covers | How |
|---|---|---|
| Unit tests pass | FR-02–FR-04, FR-12–FR-16, FR-20–FR-23, NFR-S3, NFR-L1, NFR-L3, NFR-L4 | `npm test` in `functions/allowlist` and `web` (also run by the app pipeline) |
| Terraform is valid and its preconditions pass | FR-05, NFR-A2, C-7 | `terraform validate` offline; `terraform plan` in the pipeline |
| Playground at every access level | FR-04, FR-10–FR-16, FR-21–FR-22, NFR-B2 | `/playground.html?view=drive&access=…`, desktop and phone width |
| End-to-end checklist after a deploy | all FR, NFR-S1, NFR-S2, NFR-P1, NFR-A1, NFR-B1–B2 | [deployment.md](../deployment.md#end-to-end-test-checklist) |
| IAM simulator checks | NFR-S1, FR-20 | [personal-folders.md](../features/personal-folders.md#inspect-and-operate) |
| Security review | NFR-S1–S8 | [security assessment](../security/assessment-2026-11.md); its open tickets |
| Every ADR still holds | §2 principles | [architecture-contract.md](architecture-contract.md) |
