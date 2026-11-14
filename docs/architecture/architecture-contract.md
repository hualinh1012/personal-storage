# Architecture Contract

The agreement on how changes to Family Drive conform to its architecture
([architecture-definition.md](architecture-definition.md)) and requirements
([architecture-requirements.md](architecture-requirements.md)). In TOGAF this governs implementation;
here it is scaled to a project with one owner, occasional contributors and coding agents.

- **Version:** 1.0, 14 November 2026.
- **Applies to:** every change merged into `main`: code, Terraform, pipelines, IAM policies, docs.

## 1. Parties and roles

| Party | Role | Responsibilities |
|---|---|---|
| Owner | Architecture authority, operator, approver | Owns the principles and ADRs; triages tickets; approves and merges every PR; applies console-only changes (IAM policy re-attachment, SSM values, Google Cloud); grants waivers |
| Contributor (human) | Implementer | Follows this contract; fills in the checklist in the PR description |
| Coding agent | Implementer | Same as a contributor; picks only `ready-for-agent` tickets; never merges or approves; never pushes to `main` |

## 2. What every change must respect

1. **The principles** (ADD §2): no backend or database; S3 as the only source of truth; IAM as the
   security boundary; configuration over admin screens; retained data, disposable app; recover rather
   than restrict; everything as code; the cheapest option that never blocks a read.
2. **The ADRs** in [`docs/adr/`](../adr/). A change that contradicts one says so explicitly and comes
   with a new ADR that supersedes or amends it.
3. **IAM stays the boundary.** A new permission is an IAM statement in `infra/identity.tf`; the UI
   may only hide what IAM refuses, never grant.
4. **Pipeline permissions follow the resources.** A new AWS resource type adds its actions to the
   matching `ci/iam/*-pipeline-policy.json`, and the owner re-attaches the policy **before** the
   change is pushed.
5. **Docs move with the code.** A change to a feature updates its doc in `docs/features/` in the same
   PR; a change to components, the config flow or the pipelines updates
   [system-design.md](system-design.md); a change to setup steps updates the setup guide and
   [deployment.md](../deployment.md).
6. **No secrets in the repository.** Values go to SSM or the environment's secrets, never into code,
   docs, tickets or commit messages.
7. **The storage rules** hold: no archive tier or Glacier class (ADR 0013); never suspend versioning;
   `prevent_destroy` stays on foundation resources.

## 3. Conformance checklist (every PR)

Copy into the PR description and tick what applies; explain any box left unticked.

```markdown
### Architecture conformance
- [ ] Ticket linked; it was `ready-for-agent` / `ready-for-human` (or the owner asked for it)
- [ ] Respects ADRs: none contradicted, or a new ADR is included
- [ ] Tests: `npm test` in `functions/allowlist` and `web` pass; new rules have tests
- [ ] Terraform: `terraform fmt -check -recursive infra` and `validate` pass (if `infra/` changed)
- [ ] IAM: permissions changed only in `infra/identity.tf`; UI hiding matches (if access changed)
- [ ] Pipeline policy: new AWS actions added to `ci/iam/`, re-attach noted for the owner (if resources changed)
- [ ] Playground: `?view=drive` checked at every `&access=` level, desktop and phone width (if UI changed)
- [ ] Docs: feature doc / system design / setup guide / deployment.md updated in this PR
- [ ] Security: no new way to run file content; no secrets; security assessment still accurate
- [ ] Requirements: affected ARS rows still Met, or their status updated
```

**Who checks:** the implementer fills it in; the owner reviews it with the diff and merges. A coding
agent states which boxes it could not verify itself (for example a live deploy or a console setting).

## 4. Waivers

When a change can't meet a rule:
- **Small or temporary:** record it in the ticket and the PR description (what, why, until when),
  and open a follow-up ticket to remove it.
- **Lasting:** write an ADR, so the rule itself changes.
- **Accepted risks** are listed in the [security assessment](../security/assessment-2026-11.md#accepted-risks)
  and as **Accepted gap** rows in the ARS (currently #54 and #56, for cost).

Only the owner grants a waiver.

## 5. Review cadence

| When | What |
|---|---|
| Every new ADR | Update the ADD (principles, decisions table) and any ARS rows it touches |
| A feature ticket closes | Update its ARS row's status and the ADD gap analysis |
| A Storage Browser (`@aws-amplify/ui-react-storage`) upgrade | Re-check the custom parts listed in CLAUDE.md and the playground |
| Every 3 months, or before inviting new people | Re-read the ADD and ARS; re-run `npm audit` and the security checks; confirm accepted risks still stand |
| A security incident | Revisit the security architecture (ADD §7) and the assessment |

## 6. Documents covered

| Document | Holds | Owner |
|---|---|---|
| [architecture-definition.md](architecture-definition.md) | Principles, five domains (business, data, application, technology, security), gaps, risks | Owner |
| [architecture-requirements.md](architecture-requirements.md) | Requirements with traceability and status, constraints, interoperability, conformance | Owner |
| This contract | Rules and checklist for changes | Owner |
| [system-design.md](system-design.md) | The detailed cross-cutting design | Kept current by each PR |
| [`docs/features/`](../features/) | Per-feature technical detail | Kept current by each PR |
| [`docs/adr/`](../adr/) | Individual decisions | Owner |
