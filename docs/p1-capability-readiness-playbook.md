# P1 capability test-writing playbook

This playbook describes focused test-writing sessions, not certification or
feature implementation. The registry remains the factual source for the IDs,
policies, priorities, and implementation/evidence/status values below. This
document does not edit registry metadata/policy/priority, product code, receipt
attribution, tooling, or commands.

Provider/OAuth and physical GPS, permissions, deep-link, BLE, FTMS, and
device-hardware work is fully deferred everywhere. No credentials, devices,
integrations, or hardware tests are part of P1 preparation.

## Session rule

Inspect implementation and existing tests first. Existing behavior gets the
strongest practical nondeferred test layer(s). An absent or partial outcome gets
exactly one executable broad red test at the safest practical layer, named with
the capability ID and plain outcome. Do not add speculative duplicate layers;
use an additional layer only for a distinct real boundary with nonduplicate
value.

Completion means each nondeferred P1 capability is inspected and either has
meaningful executable coverage of existing behavior or one loud red test. Green
results and certification are not required or claimed.

## Atomic session ledger

Each row is one capability session. Status is `implementation/evidence/status`.
The source/test locations remain the registry's recorded locations; copying them
does not authorize registry changes.

| ID | Policy; web status; mobile status | Outcome; known gap |
|---|---|---|
| `activity.import-historical-file` | both; implemented/runtime/active; implemented/screen/component/active | Import FIT/GPX/TCX and recover failed import; mobile device flow missing |
| `activity.record-session-rpe` | both; implemented/runtime/active; implemented/screen/component/active | Save and reload perceived effort; mobile runtime gap |
| `activity.like-and-comment` | both; implemented/runtime/active; partial/source-only/active | Like/comment with retry-safe feedback; mobile proof gap |
| `activity-plan.browse-and-inspect` | both; implemented/runtime/active; implemented/screen/component/active | Find and inspect plan structure/targets; mobile runtime gap |
| `activity-plan.create` | both; implemented/runtime/active; implemented/screen/component/active | Create initial plan identity/metadata; mobile runtime gap |
| `activity-plan.edit-basics` | both; implemented/runtime/active; implemented/screen/component/active | Edit owner-controlled basics; mobile runtime gap |
| `activity-plan.edit-structured-steps` | both; implemented/runtime/active; implemented/screen/component/active | Add, validate, correct, and save steps; mobile runtime gap |
| `activity-plan.duplicate` | both; implemented/runtime/active; partial/screen/component/active | Copy a shared plan into an owned copy; mobile proof gap |
| `activity-plan.schedule` | both; implemented/runtime/active; implemented/screen/component/active | Schedule/reschedule/remove a plan; mobile runtime gap |
| `activity-plan.like-and-comment` | both; implemented/runtime/active; partial/screen/component/active | Like/comment on a plan; persisted mobile flow missing |
| `calendar.navigate-views` | both; implemented/runtime/active; implemented/screen/component/active | Navigate calendar views; mobile runtime gap |
| `calendar.create-event` | both; implemented/runtime/active; implemented/screen/component/active | Persist one-off, all-day, or recurring event; mobile runtime gap |
| `calendar.edit-event` | both; implemented/runtime/active; partial/screen/component/active | Edit exact recurrence scope; mobile implementation/proof gap |
| `calendar.delete-event` | both; implemented/runtime/active; partial/screen/component/active | Delete exact recurrence scope; mobile implementation/proof gap |
| `goals.browse-and-inspect` | both; implemented/runtime/active; implemented/screen/component/active | Browse and inspect owned goals; mobile runtime gap |
| `goals.create` | both; implemented/runtime/active; implemented/screen/component/active | Create and reload a goal; mobile runtime gap |
| `goals.edit` | both; implemented/runtime/active; implemented/screen/component/active | Edit an owned goal; mobile runtime gap |
| `goals.delete` | both; implemented/runtime/active; missing/none/active | Delete an owned goal; mobile implementation/proof missing |
| `routes.browse-and-inspect` | both; implemented/runtime/active; implemented/screen/component/active | Browse and inspect a persisted route; mobile runtime gap |
| `routes.upload` | both; partial/runtime/active; implemented/screen/component/active | Upload/retry and reload a route; mobile runtime gap |
| `routes.edit-metadata` | both; implemented/runtime/active; implemented/screen/component/active | Edit route metadata; mobile runtime gap |
| `routes.attach-to-calendar-event` | both; implemented/runtime/active; partial/source-only/active | Persist a route assignment on an event; mobile implementation incomplete |
| `training-plan.browse` | both; implemented/runtime/active; implemented/screen/component/active | Browse owned/template plans; mobile runtime gap |
| `training-plan.create` | both; implemented/runtime/active; implemented/screen/component/active | Create/reload a training plan; mobile runtime gap |
| `training-plan.edit` | both; implemented/runtime/active; implemented/screen/component/active | Edit/reload a training plan; mobile runtime gap |
| `training-plan.apply-and-remove-schedule` | both; partial/source-only/active; partial/screen/component/active | Apply/remove schedule exactly once; both implementation/proof gaps |
| `training-preferences.edit` | both; implemented/runtime/active; implemented/screen/component/active | Validate, save, and reload preferences; mobile runtime gap |

The registry snapshot contains 27 P1 records, including the IDs above. The
registry's current classifications remain factual; this playbook makes no phase
certification claim.

## Shared receipts

For P1/P2 shared journeys, use unique existing test identities when they already
exist. Otherwise record the shared-receipt limitation as deferred tooling work.
It must not trigger tooling changes or be presented as phase certification.

## Future work note

Any registry, product, receipt-attribution, tooling, or command change belongs to
a separately authorized effort.
