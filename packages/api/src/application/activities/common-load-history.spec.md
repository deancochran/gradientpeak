# Common Load historical grouping specification

This application owner adapts persisted activity facts to Core's
`completed_activity_history` contract. It does not persist or cache a fitness state.

## Canonical authority

- `readCurrentProfileCommonLoadHistory` reads `profiles.planning_timezone`; the server derives the
  current planning date from the same explicit as-of instant. A client-supplied date/timezone must
  match those profile-owned values or the router rejects it.
- `started_at` is an instant. It is converted to a date with the athlete planning timezone before
  day aggregation. UTC-midnight crossings, spring-forward gaps, and fall-back repeated hours do not
  permit the viewer/device timezone to alter canonical history.
- `dailyCommonLoadObservations` intentionally remains an arbitrary-timezone viewer projection. Its
  response declares `timezone_role: viewer_projection`,
  `canonical_history_eligible: false`, and `activity_started_at_in_viewer_timezone`; it is not an
  input to canonical completed history.

## Evidence and as-of behavior

- The complete replay horizon is read in one repeatable-read transaction, scoped to the athlete.
  Provider-history coverage must span every required profile-local date and must itself be known no
  later than the supplied as-of instant. No integration, stale/failed sync state, query truncation,
  duplicate activity identity, missing segment result, partial result, or calculation after as-of
  yields an unavailable history rather than a zero.
- Activities are bounded before the as-of instant and ordered by start instant then ID. Segment and
  activity contributions are canonically ordered; stable Core aggregation makes input ordering
  irrelevant. Known-zero identities include a hashed athlete/timezone/window/as-of read scope and
  never expose the profile ID.
- Completed activity calibration evidence is resolved at each activity/segment instant. The
  history aggregation calculation uses the supplied as-of instant, so repeated reads of the same
  facts/version/as-of produce the same calculation and evidence identity.

## Current limitation

No schema is added here. The result is a deterministic read calculation, not an immutable revision:
the database does not retain historical profile-timezone or provider-coverage revisions. If the
only current sync state was written after a requested historical as-of, the calculation abstains
rather than claiming an earlier snapshot.
