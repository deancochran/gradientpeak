# Capability test-preparation baseline

This document is an inventory and test-writing guide. It does not implement
product behavior, edit registry metadata or policy, change priorities, alter
receipt attribution, change tooling, or add commands.

Provider/OAuth and physical GPS, permissions, deep-link, BLE, FTMS, and
device-hardware work is fully deferred. Those entries remain inventory entries
with their factual IDs and statuses. They are not tests to create, credentials
or devices to obtain, or blockers for this session. Existing pure logic tests
may be inspected or refactored only when they do not require those integrations.

## Baseline snapshot

| Measure | Current result |
|---|---:|
| Registered capabilities | 98 |
| Required platform entries | 187 |
| Implemented required entries | 135 / 187 |
| Required entries declaring Playwright or Maestro runtime evidence | 78 / 187 |
| Required entries with an implementation gap | 52 |
| Implemented entries with a runtime-proof gap | 63 |
| Records with an intentional platform difference or absence | 15 |
| Unclassified discovered surfaces | 0 |
| Stale or missing evidence references | 0 |

These are registry classifications, not executed proof. One capability may have
one web and one mobile entry. An implementation gap and a runtime-proof gap are
separate facts. No receipt or feature certification is claimed here.

## Session decision rule

For each nondeferred capability session:

1. Inspect the implementation and existing tests.
2. If the behavior exists, choose the strongest practical nondeferred layer or
   layers that exercise the current public/user behavior.
3. If the required outcome is absent or partial, add exactly one executable,
   broad red test at the safest practical layer. Name it with the capability ID
   and plain user outcome.
4. Do not add speculative duplicate layers. Add another layer only when the
   current code exposes a distinct real boundary and that layer adds
   nonduplicate value.

Completion for this session means every nondeferred capability was inspected and
either has meaningful executable tests against existing behavior or one loud red
test. A green suite is not required. This does not claim feature completion or
certification.

## Priority guide

Priority is preserved as inventory context, not a layer mandate.

| Priority | Inventory area | Test-preparation focus |
|---|---|---|
| P0 | Trust, safety, privacy, recording, submission, recovery | Strongest practical test of the current public outcome; one red test when absent or partial |
| P1 | Activities, plans, calendar, routes, goals, preferences, synchronization | Same decision rule, with no blanket layer requirement |
| P2 | Feed, discovery, groups, messaging, notifications, sharing | Same decision rule, including access behavior when the selected boundary exposes it |
| P3 | Navigation, theme, presentation, bounded platform differences | Focused practical test of the current outcome |

## Capability inventory

The following factual rows are retained from the registry snapshot. They are
planning entries, not instructions to change the registry or to prove runtime
behavior.

### P0

| Area | Implementation gaps | Runtime-proof gaps |
|---|---|---|
| Auth/runtime | `auth.sign-in` (web); `auth.sign-out` (web, mobile) | `auth.create-account`, `auth.protected-entry`, `auth.reset-password`, `auth.sign-in`, `auth.verify-email` (mobile) |
| Identity/profile | `profile.edit` (web) | `profile.edit`, `profile.view` (mobile) |
| Privacy/share | `activity.change-visibility` (mobile); `share.open-public-activity-link` (web); `share.open-public-activity-plan-link` (web, mobile); `share.open-public-training-plan-link` (web) | `share.open-public-activity-link` (mobile); `share.open-public-training-plan-link` (mobile) |
| Recording runtime | `record.attach-route` (web); `record.retry-failed-submit` (mobile) | `record.discard-finalized`, `record.gps-free-live-session`, `record.review-finalized`, `record.submit-finalized`, `startup.restore-session-and-recording` |
| Recording hardware | None classified | `record.ftms-command`, `record.ftms-control-recovery`, `record.sensor-connect`, `record.sensor-discovery`, `record.sensor-measurements`, `record.sensor-reconnect` (mobile); **deferred** |
| Activity safety | `activity.delete` (mobile) | None after implementation is complete |
| Route/data recovery | `routes.delete` (web, mobile) | None after implementation is complete |
| External authorization | `integrations.connect-provider` (web, mobile) | Provider/OAuth proof **deferred** |

### P1, P2, and P3

The complete factual ID/status tables remain in the phase playbooks:
`p1-capability-readiness-playbook.md`, `p2-capability-readiness-playbook.md`,
and `p3-capability-readiness-playbook.md`. Their rows are inventory only and
use the decision rule above; they do not require all test layers.

## Future work note

A separately authorized future effort may decide whether registry metadata or
policy, product code, receipt attribution, test tooling, or commands need to
change. None of those changes is part of this test-writing session.
