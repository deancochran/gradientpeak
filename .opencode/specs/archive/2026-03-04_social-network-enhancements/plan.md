# Social Network Enhancements - Design Plan & Task Specification

## 1. Overview

This document outlines the design and implementation plan for adding social network features to the GradientPeak application. The goal is to allow users to interact with each other through following, liking content, and direct messaging, while respecting user privacy preferences.

## 2. Core Features

1. **User Privacy & Following:**
   - Users can set their accounts to "Public" or "Private".
   - Public accounts can be followed instantly.
   - Private accounts require a follow request that must be approved by the user.
2. **Liking Content:**
   - Users can "like" activity plan templates, training plan templates, and past completed activities.
   - A user can only like a specific record once.
   - The total count of likes will be displayed on the content.
3. **Direct Messaging:**
   - Users can initiate a direct message from another user's profile.
   - If a 1-on-1 conversation already exists between the two users, it will be reused rather than creating a new one.

## 3. Database Schema Changes (New Migration)

A new migration file will be created to implement the following changes:

### 3.1. Profiles Table Update

- Add `is_public BOOLEAN DEFAULT false` to `public.profiles`.

### 3.2. New `follows` Table

- `follower_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE`
- `following_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE`
- `status TEXT CHECK (status IN ('pending', 'accepted'))`
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- `updated_at TIMESTAMPTZ DEFAULT NOW()`
- **Primary Key:** `(follower_id, following_id)`

### 3.3. New `likes` Table

- `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
- `profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE`
- `entity_type TEXT CHECK (entity_type IN ('activity', 'training_plan', 'activity_plan'))`
- `entity_id UUID` (No strict foreign key due to polymorphic nature, but indexed)
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- **Unique Constraint:** `(profile_id, entity_type, entity_id)`

### 3.4. Like Counts & Triggers

- Add `likes_count INTEGER DEFAULT 0` to:
  - `public.activities`
  - `public.training_plans`
  - `public.activity_plans`
- Create a Postgres trigger function `update_likes_count()` that increments/decrements the respective table's `likes_count` upon `INSERT` or `DELETE` in the `likes` table.

## 4. Backend (tRPC) Updates

### 4.1. New `social` Router (`packages/trpc/src/routers/social.ts`)

- `followUser`: Initiates a follow. Sets status to 'accepted' if target is public, 'pending' if private.
- `unfollowUser`: Removes a follow record.
- `acceptFollowRequest`: Updates status from 'pending' to 'accepted'.
- `rejectFollowRequest`: Deletes the pending follow record.
- `toggleLike`: Inserts or deletes a like record for a specific entity.

### 4.2. Update `messaging` Router (`packages/trpc/src/routers/messaging.ts`)

- `getOrCreateDM`: New procedure that takes a `target_user_id`. It queries `conversations` (where `is_group = false`) joined with `conversation_participants` to find an existing chat with exactly the current user and the target user. If found, returns it; if not, creates it.

### 4.3. Update `profiles` Router (`packages/trpc/src/routers/profiles.ts`)

- `updateProfile`: Allow updating the `is_public` field.
- `getPublicById`:
  - Return the `is_public` status.
  - Return the current user's `follow_status` relative to this profile.
  - Conditionally strip out sensitive data (like recent activities) if the profile is private and the current user is not an 'accepted' follower.

### 4.4. Update Entity Routers (`activities`, `training-plans`, `activity_plans`)

- Ensure queries return the `likes_count`.
- Add a derived boolean `has_liked` for the requesting user (likely via a left join or a separate query for lists).

## 5. Mobile App UI Updates (`apps/mobile`)

### 5.1. User Profile Screen (`app/(internal)/(standard)/user/[userId].tsx`)

- **Header Actions:** Add Follow/Requested/Unfollow button based on state.
- **Message Action:** Add a "Message" button that calls `getOrCreateDM` and navigates to `messages/[id]`.
- **Privacy Gate:** If the profile is private and not followed, show a "This account is private" placeholder instead of the activity feed.

### 5.2. Profile Edit Screen (`app/(internal)/(standard)/profile-edit.tsx`)

- Add a toggle switch for "Public Account".

### 5.3. Notifications Screen (`app/(internal)/(standard)/notifications/index.tsx`)

- Render incoming follow requests with "Accept" and "Reject" buttons.

### 5.4. Content Cards

- Update `PastActivityCard`, `TemplatesList`, etc., to include a Heart icon button.
- Display the `likes_count` next to the heart.
- Implement optimistic UI updates when toggling a like.

## 6. Web App UI Updates (`apps/web`)

### 6.1. User Profile Page (`src/app/(internal)/user/[userId]/page.tsx`)

- Create this new page (currently missing in the web app).
- Implement the same layout and privacy gating as the mobile app.
- Include Follow and Message buttons.

### 6.2. Settings Page (`src/app/(internal)/settings/page.tsx`)

- Add a toggle switch for "Public Account".

### 6.3. Notifications Page (`src/app/(internal)/notifications/page.tsx`)

- Render incoming follow requests with "Accept" and "Reject" buttons.

### 6.4. Content Cards

- Update activity and template cards across the web app to include the Like button and count.

## 7. Task Execution Order

1. **Phase 1: Database & Types**
   - [ ] Update `packages/supabase/schemas/init.sql` with `is_public`, `follows`, `likes`, and triggers.
   - [ ] Generate the migration using `supabase db diff -f social-network-enhancements`.
   - [ ] Run the migration locally using `supabase db push` or `supabase migration up`.
   - [ ] Generate updated Supabase TypeScript types using `pnpm update-types`.

2. **Phase 2: Backend Logic**
   - [ ] Create the `social` tRPC router and add it to the root router.
   - [ ] Update the `messaging` router with `getOrCreateDM`.
   - [ ] Update the `profiles` router to handle privacy and follow status.
   - [ ] Update entity routers to include `likes_count` and `has_liked`.

3. **Phase 3: Mobile Frontend**
   - [ ] Update Profile Edit screen with privacy toggle.
   - [ ] Update User Profile screen with Follow/Message buttons and privacy gates.
   - [ ] Update Notifications screen for follow requests.
   - [ ] Update content cards with Like buttons.

4. **Phase 4: Web Frontend**
   - [ ] Update Settings page with privacy toggle.
   - [ ] Create User Profile page with Follow/Message buttons and privacy gates.
   - [ ] Update Notifications page for follow requests.
   - [ ] Update content cards with Like buttons.
