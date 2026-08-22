# P2 capability test-writing playbook

This is a focused test-writing guide, not certification. Registry IDs, policy,
priority, and implementation/evidence/status remain factual inventory. This
document does not edit registry metadata/policy/priority, product code, receipt
attribution, tooling, or commands.

Provider/OAuth and physical GPS, permissions, deep-link, BLE, FTMS, and
device-hardware work is fully deferred and never blocks this session.

## Session rule and completion

Inspect implementation and existing tests. If behavior exists, choose the
strongest practical nondeferred layer(s) for the current public outcome. If it
is absent or partial, add exactly one executable broad red test named with the
capability ID and plain outcome. Do not add speculative duplicate layers; add a
second only for a distinct real boundary with nonduplicate value.

Every nondeferred P2 capability must be inspected and either meaningfully tested
against existing behavior or represented by one loud red test. Green tests,
feature completion, and certification are not claimed.

## Scope and factual ledger

The scope is exactly these 20 active `both` registry IDs. Status remains the
registry's `implementation/evidence/status` value.

| ID | Policy; web status; mobile status | Outcome; known gap |
|---|---|---|
| `discover.search-resources` | both; implemented/runtime/active; partial/source-only/active | Search/open a supported result; mobile selection proof missing |
| `discover.filter-feed` | both; implemented/runtime/active; partial/screen/component/active | Apply API-correct filters; mobile interpretation proof missing |
| `feed.browse` | both; implemented/runtime/active; implemented/screen/component/active | Refresh/page persisted feed; mobile runtime gap |
| `feed.retry-failed-load` | both; implemented/runtime/active; implemented/screen/component/active | Distinguish empty from failure and recover; mobile runtime gap |
| `social.request-follow` | both; implemented/runtime/active; partial/source-only/active | Request/accept follow with privacy; mobile lifecycle proof missing |
| `social.browse-followers` | both; implemented/runtime/active; partial/source-only/active | Page followers with empty/error recovery; mobile proof missing |
| `groups.browse-and-join` | both; implemented/runtime/active; partial/screen/component/active | Browse/join/reload group; mobile lifecycle gap |
| `groups.create` | both; implemented/runtime/active; partial/source-only/active | Owner creates group; mobile implementation/proof gap |
| `groups.edit` | both; implemented/runtime/active; partial/source-only/active | Owner edits group; mobile implementation/proof gap |
| `group.manage-invitations` | both; partial/source-only/active; partial/screen/component/active | Manage invitations safely; both gaps |
| `groups.manage-members` | both; partial/source-only/active; partial/source-only/active | Manage membership by role; both gaps |
| `group-event.create` | both; implemented/runtime/active; implemented/screen/component/active | Create group event; mobile runtime gap |
| `group-event.edit` | both; implemented/runtime/active; implemented/screen/component/active | Edit event within ownership rules; mobile runtime gap |
| `group-event.delete` | both; implemented/runtime/active; implemented/screen/component/active | Delete event once/reload; mobile runtime gap |
| `group-event.rsvp` | both; implemented/runtime/active; partial/screen/component/active | RSVP idempotently; mobile proof gap |
| `messaging.open-conversation` | both; implemented/runtime/active; partial/screen/component/active | Participants open conversation; mobile implementation/proof gap |
| `messaging.start-direct-message` | both; implemented/runtime/active; implemented/screen/component/active | Start one direct conversation; mobile runtime gap |
| `messaging.create-group-conversation` | both; implemented/runtime/active; missing/none/active | Create group conversation; mobile implementation/proof missing |
| `notifications.browse` | both; implemented/runtime/active; implemented/screen/component/active | Browse notifications; mobile runtime gap |
| `notifications.mark-read` | both; partial/source-only/active; implemented/screen/component/active | Persist mark-read once; web implementation/proof gap |

## Shared receipts

Use unique existing test identities when available. If none exists, record the
shared-receipt issue as a deferred tooling limitation. Do not change tooling,
add attribution, or claim P2 certification because of it.

## Future work note

Registry, product, receipt-attribution, tooling, and command changes require
separate authorization.
