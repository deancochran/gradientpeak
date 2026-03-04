# Social Network Enhancements - Tasks

## Phase 1: Database & Types
- [ ] Update `packages/supabase/schemas/init.sql` with `is_public`, `follows`, `likes`, and triggers.
- [ ] Generate the migration using `supabase db diff -f social-network-enhancements`.
- [ ] Run the migration locally using `supabase db push` or `supabase migration up`.
- [ ] Generate updated Supabase TypeScript types using `pnpm update-types`.

## Phase 2: Backend Logic
- [ ] Create the `social` tRPC router and add it to the root router.
- [ ] Update the `messaging` router with `getOrCreateDM`.
- [ ] Update the `profiles` router to handle privacy and follow status.
- [ ] Update entity routers to include `likes_count` and `has_liked`.

## Phase 3: Mobile Frontend
- [ ] Update Profile Edit screen with privacy toggle.
- [ ] Update User Profile screen with Follow/Message buttons and privacy gates.
- [ ] Update Notifications screen for follow requests.
- [ ] Update content cards with Like buttons.

## Phase 4: Web Frontend
- [ ] Update Settings page with privacy toggle.
- [ ] Create User Profile page with Follow/Message buttons and privacy gates.
- [ ] Update Notifications page for follow requests.
- [ ] Update content cards with Like buttons.
