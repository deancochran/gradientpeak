# P0 test-preparation checklist

This is a preparation checklist, not a release gate. It preserves the registry
IDs and current classifications while guiding focused test writing. It does not
implement behavior, edit registry metadata/policy/priority, change receipt
attribution, change tooling, or add commands.

Provider/OAuth and physical GPS, permissions, deep-link, BLE, FTMS, and
device-hardware tests are fully deferred. They are inventory entries only, not
tests to create or prerequisites to obtain, and they do not block this session.

## Preparation rule

Inspect the implementation and existing tests for each nondeferred capability.
If the public outcome exists, use the strongest practical nondeferred test
layer(s). If it is absent or partial, add exactly one executable broad red test
with the capability ID and plain expected outcome at the safest practical layer.
Do not add speculative duplicate layers. Add another only for a distinct real
boundary that adds nonduplicate value.

Completion means every nondeferred P0 capability was inspected and is either
covered by meaningful executable tests against current behavior or represented
by one loud red test. Green tests, runtime receipts, feature completion, and
certification are not required or claimed.

## Decision and inventory register

| ID / area | Current registry fact | Session disposition |
|---|---|---|
| `auth.*`, `startup.restore-session-and-recording` | Auth/session entries retain their recorded implementation/evidence/status | Prepare nondeferred pure/session tests; defer native deep-link and device restart proof |
| `activity.change-visibility`, `activity.delete`, `profile.*` | Current statuses remain as recorded in the baseline | Test current public authorization/visibility outcomes at the strongest practical layer |
| `share.open-public-activity-link`, `share.open-public-activity-plan-link`, `share.open-public-training-plan-link` | Current web/mobile classifications remain unchanged | Test existing public-reader behavior where executable; defer native handoff/device work |
| `record.manual-start`, `record.pause`, `record.resume`, `record.finish` | Lifecycle entries are classified implemented with declared evidence | Test the current lifecycle behavior without claiming runtime proof |
| `record.attach-route`, `routes.delete` | Existing implementation/proof gaps remain factual | Add one broad red test per absent/partial outcome; do not repair product behavior |
| `record.review-finalized`, `record.submit-finalized`, `record.retry-failed-submit`, `record.discard-finalized` | Existing statuses remain factual | Test current queue/submission behavior where practical; one red test for an absent outcome |
| `integrations.connect-provider` | Provider connection remains an implementation/proof gap | Fully deferred: no OAuth tests, credentials, adapters, or journeys |
| `record.gps-free-live-session` | Registry entry remains factual | Fully deferred physical GPS/permission/deep-link/device proof |
| `record.sensor-discovery`, `record.sensor-connect`, `record.sensor-measurements`, `record.sensor-reconnect`, `record.ftms-command`, `record.ftms-control-recovery` | Mobile-only hardware entries remain factual | Inventory only; no BLE/FTMS/device tests or hardware setup |

## Non-goals

Do not turn a deferred entry into a baseline/P0 requirement. Do not make a
missing receipt, unavailable device, provider credential, or shared-receipt
limitation a failure of this session. Do not claim that declared evidence is
executed proof.

### Future work note

Registry policy/priority/metadata, product behavior, receipt attribution,
tooling, and command changes require a separate authorization and are outside
this checklist.
