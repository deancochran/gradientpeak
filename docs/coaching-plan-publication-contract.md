# Coaching plan publication contract

This Core-only contract supports the C04 review flow: an explicit organization-and-athlete
plan-edit grant selects scoped **draft** sessions in an athlete-local date range. Draft versions
retain separate author and audience facts; a current actor must match the explicit grant and need
not be the draft author. A preview includes the athlete timezone, single-athlete recipient scope,
recipient fingerprint, expected draft revision, and review fingerprint. Published and completed
sessions are returned only as protected history; the pure contract never edits them.

The preview accepts fingerprints as bounded, caller-supplied review identifiers. They are not
cryptographic bindings and are not client authority. An activating server must derive or verify
them from trusted current scope, recipients, draft content, and authorization state before it
persists a confirmation.

`confirmCoachingPlanPublication` is a deterministic retry classifier, not a publication
operation. A `confirmed` result means a caller has a candidate receipt to persist; it does not
mean sessions became athlete-visible or a notification was sent. A matching durable receipt is
an `idempotent_replay`; changed reviewed input for the same operation key is an
`idempotency_conflict`.

## Required activation work (not performed here)

An API/application implementation must, in one authorized durable transaction:

1. load and recheck active organization membership, coaching assignment, and this new explicit
   athlete-specific plan-edit grant (not `AthleteReadScope` consent or an invitation);
2. recheck draft revision, recipient/scope and preview fingerprint, then mutate only eligible
   future draft rows while preserving completed and previously published history;
3. store the idempotency receipt and transition atomically, then enqueue any notification once
   through the existing durable delivery mechanism.

The current database has read-consent and invitation authority, but no approved persistence
model or migration for this plan-edit grant, draft/published version history, recipient receipt,
or atomic publication transition. Those schema changes require separate database authority;
this document and the Core contracts make no operational-publish claim.
