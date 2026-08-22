# Test-maintenance playbook

This is a local test-writing and refactoring guide. It does not implement
product behavior or claim certification. It does not edit registry
metadata/policy/priority, product code, receipt attribution, tooling, or add
commands.

Provider/OAuth and physical GPS, permissions, deep-link, BLE, FTMS, and
device-hardware tests are fully deferred. Do not obtain credentials, use
devices, or treat those inventory entries as blockers.

## Session method

For each nondeferred capability, inspect the implementation and existing tests.
If the public behavior exists, strengthen or refactor the strongest practical
nondeferred test without changing product code. If behavior is partial or
absent, add exactly one executable broad red test named with the capability ID
and plain outcome. Use the safest practical layer. Do not add speculative
duplicate layers; add another only for a distinct real boundary with
nonduplicate value.

Current-session completion means every nondeferred capability was inspected and
either has meaningful executable tests against existing behavior or one loud red
test. A green suite is not required. Feature completion and certification are
not claimed.

## Results and limitations

Record the capability ID, outcome, selected test location, result, and any
deferred limitation. A declared registry reference or an old receipt is not
runtime proof. For P1/P2 shared journeys, use unique existing identities when
available; otherwise record the shared-receipt issue as deferred tooling work.
Do not change tooling or claim phase certification.

## Escalation boundary

Stop rather than alter authorization, migration, public contracts, concurrency,
security behavior, provider/device integrations, registry policy, tooling, or
commands. Those are separate decisions or future work.
