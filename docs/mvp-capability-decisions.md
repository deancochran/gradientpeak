# MVP capability decisions

Accepted on 2026-08-23. This record defines product intent for capability and
test reconciliation. It does not authorize feature implementation by itself.

## Accepted outcomes

| Current capability | MVP decision | Required user outcome |
|---|---|---|
| `record.manual-lap` | Remove from web and mobile | GradientPeak recording does not offer a manual lap action or create manual lap markers. This decision does not remove lap or split data read from imported activity files. |
| `record.attach-route` | MVP on web and mobile | An athlete can select or upload a saved route, attach it to recording configuration, and retain the association on the resulting recording or activity. |
| `routes.attach-to-calendar-event` | MVP on web and mobile | An athlete can assign a saved route to an event. The association persists and is visible when the event is reopened. |
| `activity-plan.import-content` | Unsupported on web and mobile | Activity plans cannot be imported through a product UI. They enter the system through authoring in the web app or submission through the API. |
| `planning.inspect-ledger` | Replace with a shared day agenda on web and mobile | The product shows an agenda for any selected day. The agenda presents relevant planned and completed information. It is the same product outcome on web and mobile, not a separate analytical “ledger.” |
| `onboarding.select-people-and-groups` | MVP on web and mobile | During onboarding, a new user can discover and follow people and groups, subject to the normal access rules for those people and groups. |

## Contract and test reconciliation

1. Remove `record.manual-lap` from the active capability contract and remove its
   tests. Remove existing manual-lap recording controls and production behavior
   later as a separate, focused implementation change.
2. Keep `record.attach-route` as a required cross-platform capability. Its tests
   should prove that route selection survives recording setup and reaches the
   resulting recording or activity.
3. Keep `routes.attach-to-calendar-event` as a required cross-platform
   capability. Its tests should prove persisted assignment and retrieval, not
   only the presence of a button.
4. Remove `activity-plan.import-content` from the active capability contract and
   remove tests that expect an import UI. Preserve web authoring and API
   submission as the supported entry paths.
5. Replace `planning.inspect-ledger` with `planning.view-day-agenda`. Tests should
   select an arbitrary day and show its planned and completed information on
   both platforms. Do not require a separate ledger screen or load-comparison
   interface.
6. Keep `onboarding.select-people-and-groups` as a required cross-platform
   capability. Tests should prove that onboarding can complete the follow
   actions, not merely display suggestions.

Security, privacy, authorization, recovery, and data-integrity protections
remain required while these capabilities are reconciled.
