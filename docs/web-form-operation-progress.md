# Web form operation progress

Reference: approved OpenChamber plan **Web form operations and coaching navigation**,
ID `17288dc1-0425-4de9-aa7f-552dc5421bed`. The user explicitly reaffirmed that delivery
covers the entire W00–W17 and E01–E29 plan, not only the first three workflows.

## Delivery boundaries

Web-only organization administration; reuse existing identities. Membership,
engagement, assignment and athlete consent remain independent. Preserve accounts,
community groups, training privacy and history. No implicit schema application,
shared-data reset, ownership transfer or deployment. Workers do not mutate preview
or its servers. Coordinator owns verification, commits, preview and publication.

## Coaching queue

### Approved remaining workflow policies

The user approved the conservative policy proposal during execution:

- Root owners manage administrator roles; root owners and administrators manage
  coach roles. Protect the root owner; prohibit self-demotion and self-suspension.
- Suspension blocks access and ends affected assignments. Resume does not restore
  assignments or consent automatically.
- Administrators manage assignments only between eligible people in the same
  organization. Consent remains athlete-controlled.
- Audit visibility is root/admin-only with allowlisted fields, never raw details,
  recipient email addresses, invitation tokens or hashes.
- Initial editable settings are name/timezone only. Slugs remain immutable;
  timezone changes do not rewrite existing scheduled data.
- Ownership transfer design requires acceptance by an active same-organization
  administrator and leaves the former owner an administrator. Implementation
  still requires separate atomic-design review.
- This approval does not authorize schema application or preserved-data mutation.

W08 read-only implementation uses the existing recipient-safe summary, canonical
verified recipient identity, bounded scoped keyset pagination, and effective
expired projection for elapsed pending invitations without writing expiration.

| Item | State | Evidence / dependency |
| --- | --- | --- |
| W00 | Established | Typed submission contract in approved plan; SSR prerequisite `153791a6` live |
| W01 | Live in preview | `2f2002c0`; 9 feature tests, desktop/mobile create/reload proof; 10 integrated tests |
| W02 | Live in preview | `e778227e`; 17 web tests, API/web types, exact guarded lifecycle test, both staff browser journeys; 17 integrated tests |
| W03 | Live in preview | `afd89bfc`; web types, 28 combined focused tests, four browser journeys, 19 integrated athlete tests |
| W04 | Implementing | Separate `feat/organization-group-workflows` lane; create/archive only, immutable metadata |
| W05 | Waiting on W04 | Group athlete links; scoped detail contract required |
| W06 | Waiting on W04 | Group coach links; separate implementation ownership |
| W07 | Waiting on W08 | Invitation creation/revocation needs complete discovery contract |
| W08 | Discovery | Administrator/recipient-safe list DTO, verified-email policy; no token disclosure |
| W09 | Discovery | Recipient preview/decline and authoritative repeat/audit semantics |
| W10 | Discovery | Staff role authority and durable mutation contract |
| W11 | Discovery | Suspension/restoration effects must be explicit |
| W12 | Discovery | Direct assignment authority, coexistence and durable audit |
| W13 | Discovery | Athlete-controlled consent and personal departure; not admin consent |
| W14 | Discovery | Safe audit DTO/redaction and bounded filters |
| W15 | Discovery | Explicit settings mutability contract |
| W16 | Deferred authority boundary | Ownership transfer requires separately approved design/authority |
| W17 | Incremental | Both management links integrated; broader shell/cross-route work remains |

Current recorded preview checkpoint: `a3a7d543e3cfb9af37a8677d0ba22a9dbbc95448`.
The coordination activation record is authoritative for subsequent integrations.

## Existing forms: audit is not complete

- E01–E12, E14–E17, E19–E20, E22, E24–E25 and E27–E29 have preliminary
  source observations only; these are not accepted audit completion or runtime proof.
- E13 worker found the actual import route already handles navigation failures.
  Proposed component recovery has 16 passing tests/types but is under independent
  necessity review; do not integrate redundant hypothetical-caller behavior.
- E23 follow duplicate-submit and E26 onboarding transport-error candidates need
  bounded implementation/caller verification and independent acceptance.
- E18, E21, E28 and incomplete portions of E19/E20/E25/E27 require further audit.
- E08 and E29 share one security/sign-out owner, not duplicate workers.

## Open verification and publication issues

- Combined staff/athlete run `acceptance-1131529-1793724440735`: **5 passed,
  1 failed**. Both staff journeys passed with explicit committed-success wait.
  Desktop athlete failed in fixture setup; kernel recorded Chrome OOM kill at
  12:08:42. Earlier unchanged athlete checkpoint passed all four journeys in
  `acceptance-1100542-1793724108483`. Combined desktop rerun remains outstanding;
  do not describe the six-test run as green. Avoid competing high-memory workloads.
- Normal SSR and W01 pushes failed required browser startup because storage-service
  credentials were absent. No hook bypass. Guarded `db:e2e:status` passed identity,
  migration and schema-fingerprint checks; repository runtime preparation helper
  provides an in-memory credential path for normal-hook retry. Publication/PRs
  remain incomplete and distinct from preview delivery.
- Earlier W02 accidental broad live suite ran 30 files. Historical database target
  provenance is **unknown**. Current unset environment is not retrospective proof;
  do not claim preserved data was untouched or perform automatic restoration.
  Subsequent exact lifecycle verification uses its guarded disposable database.
- Temporal/FK work remains isolated and is not part of these UI checkpoints.
