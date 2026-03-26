# Maestro fixtures

Use stable seeded data for mutation-heavy Maestro flows.

## Accounts

- `standard_user`
  - verified
  - onboarded
  - has at least one own activity plan
  - has at least one own editable training plan
  - has scheduled calendar data
- `onboarding_user`
  - verified
  - not onboarded
- `shared_plan_owner`
  - public activity and training plans visible in Discover
- `dm_sender` / `dm_receiver`
  - optional actor-specific accounts for messaging and notification scenarios
- `observer_user`
  - optional read-only actor for visibility and follower-state assertions

## Canonical env variables

- `STANDARD_USER_EMAIL`
- `STANDARD_USER_PASS`
- `ONBOARDING_USER_EMAIL`
- `ONBOARDING_USER_PASS`
- `SIGNUP_EMAIL` (optional when intentionally reusing a sign-up account)
- `SIGNUP_PASSWORD`
- `TARGET_USERNAME`
- `SHARED_TRAINING_PLAN_NAME`
- `SHARED_ACTIVITY_PLAN_NAME`
- `PLAN_ANCHOR_DATE`
- `DM_SENDER_EMAIL`
- `DM_SENDER_PASS`
- `DM_RECEIVER_EMAIL`
- `DM_RECEIVER_PASS`

See `apps/mobile/.maestro/fixtures.env.example` for the expected shape.

The repo runners auto-load `apps/mobile/.maestro/fixtures.env` if present. Multi-actor matrices can stack actor-specific overlays like `apps/mobile/.maestro/actors/sender.env` and `apps/mobile/.maestro/actors/receiver.env` on top.

When you run Maestro through the repo scripts, sign-up flows auto-generate a unique `SIGNUP_EMAIL` if you leave it unset.

For multi-device scenarios, prefer actor-specific env overlays instead of reusing one mutable social account.

## Data expectations

- one public profile discoverable by username
- one activity plan that can be duplicated and scheduled
- one training plan that can be duplicated and scheduled
- one scheduled planned event that can be rescheduled and deleted
- one custom event that can be edited and deleted
- one goal so Plan tab chart updates are visible after scheduling changes
- optional direct-message conversation and unread notification state for social lanes

## Why this matters

- Mutation flows become deterministic.
- Calendar and Plan side-effect assertions stop depending on whatever state the last flow left behind.
- Detail-page open/edit/delete coverage becomes practical without ad hoc setup in every flow.
- Multi-actor scenarios can stay understandable when each device has a named role.
