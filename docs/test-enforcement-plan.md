# Test-writing enforcement plan

This plan governs only the current local test-writing and test-refactoring
session. It does not implement product behavior, edit registry
metadata/policy/priority, change receipt attribution, change test tooling, or
add commands.

Provider/OAuth and physical GPS, permissions, deep-link, BLE, FTMS, and
device-hardware work is fully deferred. Those capabilities remain inventory
entries with factual IDs/statuses. Do not create integration tests, seek
credentials, use devices, or block this session on them. Existing pure logic
tests may be inspected/refactored only when they do not require those
integrations.

## Common decision rule

For each capability selected for this session:

1. Inspect its implementation and existing tests.
2. If behavior exists, choose the strongest practical nondeferred layer(s) that
   exercise the current public/user outcome.
3. If behavior is absent or partial, add exactly one executable broad red test at
   the safest practical layer, named with the capability ID and plain expected
   outcome.
4. Do not add speculative duplicate layers. Add another only when current code
   exposes a distinct real boundary and it adds nonduplicate value.

A red test means “test prepared,” not “feature complete.” It must be loud and
executable, not skipped, TODO, or quarantined.

## Current-session completion

Every nondeferred capability must be inspected and either covered by meaningful
executable tests against existing behavior or represented by one loud red test.
Green tests are not required. This session does not claim feature completion,
runtime proof, or certification.

## Layer guidance

Choose by the behavior actually exposed, not by priority or a blanket matrix:

| Behavior | Practical starting point |
|---|---|
| Pure calculation, schema, policy, or state transition | Unit test |
| Public API input/result, authorization, or error mapping | Contract test |
| Persistence or ownership boundary | Live-database test when needed to exercise that boundary |
| Complex view, form, accessibility, or navigation state | Component/route test |
| Existing browser-visible outcome | Playwright only when it is the strongest practical nondeferred layer |
| Existing native-visible outcome | App/native test or existing Maestro coverage; defer physical OS/hardware proof |

These are choices, not automatic requirements. A lower layer is sufficient when
it exercises the current public behavior and no distinct boundary adds value.

## Inventory and status handling

Preserve the exact capability ID, current status, platform policy, and unresolved
product decisions while writing tests. Do not turn a missing test into a policy
decision or change an inventory classification. A declared runtime reference is
not executed proof.

For P1/P2 shared-receipt issues, use unique existing test identities when
available. Otherwise record a deferred tooling limitation. It must not trigger
tooling work or support a phase-certification claim.

## Future work note

Changes to product behavior, registry metadata/policy/priority, receipt
attribution, test runner/tooling, or commands require separate authorization.
