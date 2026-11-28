# Docs index

Routing, not content. Find the row for your code path or task, then read only the doc in that row, and the ADRs it names in [adr/README.md](adr/README.md). Each row says what its doc owns; the doc holds the facts. Add a row when you add a doc.

| Area / code path | Read when | Doc | Owns |
|---|---|---|---|
| Sign-in, allowlist, access flags, IAM: `functions/allowlist/`, `infra/auth.tf`, `infra/identity.tf`, `web/src/access.ts`, `web/src/locationPolicy.ts` | Changing sign-in, the allowlist, access levels or IAM | [features/auth-and-access.md](features/auth-and-access.md) | Sign-in flow, allowlist triggers, access flags and their checklist |
| Personal folders: `web/src/locationPolicy.ts`, `infra/identity.tf` | Changing a person's private folder | [features/personal-folders.md](features/personal-folders.md) | `Personal/<email>/` layout and its rules |
| Drive screen, sidebar, + New, file list: `web/src/driveHost/`, `web/src/fileList/`, `web/src/theme/`, `web/src/styles.css` | Changing the drive UI or its look | [features/drive-ui.md](features/drive-ui.md) | Drive screen layout and interaction patterns |
| Web app rules: `web/` | Any change under `web/` | [../web/CLAUDE.md](../web/CLAUDE.md) | Area rules for the web app |
| Upload, download, Copy, Move, Edit, pager: `web/src/move/`, `web/src/edit/`, `web/src/pagination/` | Changing file operations or listing | [features/global-drive.md](features/global-drive.md) | Shared drive operations and paging |
| Delete, Restore, Deleted folder: `web/src/trash/`, `infra/foundation/files.tf` | Changing delete, restore or trash | [features/deleted-folder.md](features/deleted-folder.md) | Deleted folder behaviour and auto-empty |
| File preview: `web/src/preview/` | Changing preview of a file | [features/file-preview.md](features/file-preview.md) | Preview behaviour per file type |
| Import from Google Drive: `web/src/googleImport/` | Changing the Google Drive import | [features/google-import.md](features/google-import.md) | Import flow and its Google consent needs |
| Buckets, versioning, lifecycle, storage classes: `infra/foundation/` | Changing storage or retention | [features/storage-and-retention.md](features/storage-and-retention.md) | Buckets, versions, lifecycle and cost |
| CloudFront, CSP, custom domain, CORS: `infra/web.tf`, `infra/storage.tf` | Changing hosting, headers or domains | [architecture/system-design.md](architecture/system-design.md) | Components, request path and which file implements each |
| Infrastructure rules: `infra/` | Any change under `infra/` | [../infra/CLAUDE.md](../infra/CLAUDE.md) | Terraform area rules |
| Pipelines, deploy, PR checks, lint: `ci/`, `scripts/`, `.github/workflows/`, `*/.oxlintrc.json` | Changing CI, deploy or lint | [deployment.md](deployment.md) | Operating the deploy and its troubleshooting |
| PWA, manifest, icons: `web/public/`, `web/index.html` | Changing install-to-home-screen behaviour | [adr/0007-pwa-without-offline-cache.md](adr/0007-pwa-without-offline-cache.md) | No offline cache decision |
| Any change, architecture checklist | Every pull request | [architecture/architecture-contract.md](architecture/architecture-contract.md) | The checklist for the PR description |
| Components and config flow | Adding or moving a component, or changing config or pipelines | [architecture/system-design.md](architecture/system-design.md) | Components, trust boundaries, config flow, deployment design |
| Architecture definition | Architecture-level questions | [architecture/architecture-definition.md](architecture/architecture-definition.md) | TOGAF definition of the system |
| Quality attributes and requirements | Weighing a trade-off | [architecture/architecture-requirements.md](architecture/architecture-requirements.md) | Requirements and their priority |
| Current state (versioned) | Assessing what exists today | [architecture/baseline/README.md](architecture/baseline/README.md) | Baseline architecture, current version |
| Target state (versioned) | Planning architecture change | [architecture/target/README.md](architecture/target/README.md) | Target architecture and its gaps, current version |
| Product brief (versioned) | Planning scope or product intent, not a code change | [product/brief/README.md](product/brief/README.md) | Problem, users and goals, current version |
| Roadmap (versioned) | Choosing what to build next, not a code change | [product/roadmap/README.md](product/roadmap/README.md) | Planned work, current version |
| Security | Security review or hardening | [security/assessment-2026-11.md](security/assessment-2026-11.md) | Security assessment and findings |
| Setup from scratch | Standing up a new install | [guides/setup-from-scratch.md](guides/setup-from-scratch.md) | Step-by-step setup |
| Operating it | Day-to-day operations or troubleshooting | [deployment.md](deployment.md) | Operations and the end-to-end test checklist |
| Project terms | Unfamiliar term in code or docs | [../GLOSSARY.md](../GLOSSARY.md) | Definitions of project terms |
| Architecture decisions | Before changing an area | [adr/README.md](adr/README.md) | One row per ADR, with the code paths it governs |
