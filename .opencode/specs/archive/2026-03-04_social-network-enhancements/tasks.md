# Social Network Enhancements - Tasks

## Phase 1: Database & Types

- [x] Update `packages/supabase/schemas/init.sql` with `is_public`, `follows`, `likes`, and triggers.
- [x] Generate the migration using `supabase db diff -f social-network-enhancements`.
- [x] Run the migration locally using `supabase db push` or `supabase migration up`.
- [x] Generate updated Supabase TypeScript types using `pnpm update-types`.

## Phase 2: Backend Logic

- [x] Create the `social` tRPC router and add it to the root router.
- [x] Update the `messaging` router with `getOrCreateDM`.
- [x] Update the `profiles` router to handle privacy and follow status.
- [x] Update entity routers to include `likes_count` and `has_liked`.
- [x] Update `profiles.getPublicById` to include `followers_count` and `following_count`.
- [x] Add `social.getFollowers` and `social.getFollowing` procedures.

## Phase 3: Mobile Frontend

- [x] Update Profile Edit screen with privacy toggle.
- [x] Update User Profile screen with Follow/Message buttons and privacy gates.
- [x] Update Notifications screen for follow requests.
- [x] Update content cards with Like buttons.

## Phase 4: Web Frontend

- [x] Update Settings page with privacy toggle.
- [x] Create User Profile page with Follow/Message buttons and privacy gates.
- [x] Update Notifications page for follow requests.
- [x] Update content cards with Like buttons.
