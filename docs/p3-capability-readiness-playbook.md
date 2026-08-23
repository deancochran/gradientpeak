# P3 capability test-writing playbook

This playbook preserves the accepted 12-ID P3 inventory. It is not a
certification gate and does not implement behavior, edit registry
metadata/policy/priority, change receipt attribution, change tooling, or add
commands.

Provider/OAuth and physical GPS, permissions, deep-link, BLE, FTMS, and
device-hardware work is fully deferred. No device or credential work is part of
this session.

## Scope and factual status

The accepted planning IDs are `navigation.not-found-recovery`,
`navigation.primary-destinations`, `startup.restore-session-and-recording`,
`onboarding.complete-identity`, `onboarding.select-people-and-groups`,
`planning.view-training-path`, `planning.view-day-agenda`,
`settings.select-theme`, `profile.view`, `profile.edit`,
`coaching.protected-entry`, and `coaching.view-dashboard`.

The registry also evaluates `home.view-dashboard`, `activities.browse-history`,
and `activities.inspect-detail` as P3; that source conflict remains recorded and
is not silently resolved here. Coaching remains `web_only` with intentional
mobile absence. All implementation/evidence/status values remain those in the
registry; no status is inferred from this document.

| ID | Policy; web status; mobile status | Outcome; known gap |
|---|---|---|
| `navigation.not-found-recovery` | both; implemented/screen/component/active; partial/source-only/active | Safe unknown-route recovery; mobile auth-aware proof gap |
| `navigation.primary-destinations` | both; implemented/runtime/active; implemented/screen/component/active | Reach primary areas; mobile runtime gap |
| `startup.restore-session-and-recording` | both; implemented/runtime/active; implemented/screen/component/active | Restore valid session/recording; process-death device proof missing |
| `onboarding.complete-identity` | both; implemented/runtime/active; implemented/screen/component/active | Complete identity once; mobile runtime gap |
| `onboarding.select-people-and-groups` | both; missing/none/active; implemented/screen/component/active | Follow people and join or request to join groups during onboarding; web flow missing |
| `planning.view-training-path` | both; implemented/runtime/active; implemented/screen/component/active | View composed training path; mobile runtime gap |
| `planning.view-day-agenda` | both; implemented/screen/component/active; implemented/screen/component/active | Select any day and view its planned and completed agenda information |
| `settings.select-theme` | both; partial/screen/component/active; implemented/screen/component/active | Choose/reload theme; web persistence/proof gap |
| `profile.view` | both; implemented/runtime/active; implemented/screen/component/active | View profile; mobile runtime gap |
| `profile.edit` | both; partial/runtime/active; implemented/screen/component/active | Edit/reload owned profile; web implementation/proof gap |
| `coaching.protected-entry` | web_only; implemented/runtime/active; intentional_absence/none/intentional_absence | Authorized coach entry; mobile absence intentional |
| `coaching.view-dashboard` | web_only; partial/source-only/active; intentional_absence/none/intentional_absence | Coach dashboard; web implementation/proof gap; mobile absence intentional |

## Session rule and completion

Inspect implementation and existing tests for each nondeferred capability. Use
the strongest practical nondeferred layer(s) when behavior exists. For absent or
partial behavior, add exactly one executable broad red test named with the ID
and plain expected outcome. Do not add speculative duplicate layers; additional
layers are only for distinct real boundaries with nonduplicate value.

Every nondeferred P3 capability must be inspected and either meaningfully tested
against existing behavior or represented by one loud red test. Green tests,
feature completion, and certification are not claimed.

## Shared receipts and future work

Use unique existing identities where available. Otherwise record shared receipt
attribution as a deferred tooling limitation; do not change tooling or claim
phase certification. Registry, product, receipt, tooling, and command changes
belong to separately authorized future work.
