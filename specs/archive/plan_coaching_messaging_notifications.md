# Plan: Coaching, Messaging, and Notifications

## 1. Database Layer (Supabase)

**Goal:** Establish the data foundation for the new features.

- [ ] **Update `init.sql`:** Append the new schema definitions to `packages/supabase/migrations/*_init.sql`.

  **Table Definitions:**

  ```sql
  -- Coaching Invitations
  CREATE TABLE coaching_invitations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      athlete_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      status coaching_invitation_status NOT NULL DEFAULT 'pending', -- enum: 'pending', 'accepted', 'declined'
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(athlete_id, coach_id)
  );

  -- Coaches & Athletes Relationship
  CREATE TABLE coaches_athletes (
      coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      athlete_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (coach_id, athlete_id),
      UNIQUE (athlete_id)
  );

  -- Audit Log (for attribution)
  CREATE TABLE audit_log (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      target_table TEXT,
      target_record_id UUID,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Conversations
  CREATE TABLE conversations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      is_group BOOLEAN NOT NULL DEFAULT FALSE,
      group_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Conversation Participants
  CREATE TABLE conversation_participants (
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (conversation_id, user_id)
  );

  -- Messages
  CREATE TABLE messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 5000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ -- for soft deletes
  );

  -- Notifications
  CREATE TABLE notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Recipient
      actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Triggered by
      type notification_type NOT NULL, -- enum: 'new_message', 'coaching_invitation', etc.
      entity_id UUID, -- Polymorphic reference
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ```

- [ ] **Apply Changes to Local DB:** Execute the new SQL statements against the local Supabase instance to stage the changes.
- [ ] **Generate Migration:** Run `supabase db diff -f coaching_messaging_notifications` to generate a new migration file based on the local database changes.
- [ ] **Apply Migration:** Run `supabase migration up` to ensure the migration is applied and tracked correctly.
- [ ] **Update Types:** Run `pnpm run update-types` to regenerate the database types and Zod schemas.

## 2. Core Package (`@repo/core`)

**Goal:** Define shared Zod schemas and TypeScript types for the new entities. This ensures type safety across the DB, API, and Frontend.

- [ ] **Create Schemas:** Create new schema files in `packages/core/src/schemas/`:
  - `coaching.ts`: `CoachingInvitationSchema`, `CoachAthleteRelationSchema`.
  - `messaging.ts`: `ConversationSchema`, `MessageSchema`, `CreateMessageSchema`.
  - `notifications.ts`: `NotificationSchema` (Ensure `type` enum matches DB).
- [ ] **Export Types:** Export inferred TypeScript types from these schemas in `packages/core/src/index.ts`.

## 3. API Layer (`@repo/trpc`)

**Goal:** Expose secure, type-safe endpoints for the frontend applications.

- [ ] **Create `coaching` Router:** (`packages/trpc/src/routers/coaching.ts`)
  - `invite`: Send an invitation (Coach -> Athlete or Athlete -> Coach).
  - `respond`: Accept or decline an invitation.
  - `getRoster`: Fetch list of athletes for a coach.
  - `getCoach`: Fetch current coach for an athlete.
  - `logAction`: Internal helper to write to `audit_log`.
- [ ] **Create `messaging` Router:** (`packages/trpc/src/routers/messaging.ts`)
  - `createConversation`: Start a 1:1 or group chat.
  - `getConversations`: List user's conversations with latest message preview.
  - `getMessages`: Paginated message history for a conversation.
  - `sendMessage`: Post a new text message.
  - `deleteMessage`: Soft-delete a message (sender only).
- [ ] **Create `notifications` Router:** (`packages/trpc/src/routers/notifications.ts`)
  - `getRecent`: Fetch recent notifications.
  - `getUnreadCount`: efficient count for badges.
  - `markRead`: Mark specific or all notifications as read.
- [ ] **Update Root Router:** Register the new routers in `packages/trpc/src/root.ts`.

## 4. Web Application (`apps/web`)

**Goal:** Implement the full suite of features including the exclusive Coaching Dashboard.

- [ ] **Coaching UI (Web Only):**
  - **Coach Dashboard:** New page showing athlete roster.
  - **Athlete Detail View:** "Coach View" of the existing user profile, allowing edits to plans/metrics.
  - **Invitation Flow:** UI to search users and send invites.
- [ ] **Messaging UI:**
  - **Inbox:** Sidebar or page listing active conversations.
  - **Chat Interface:** Real-time (optimistic) message list and input.
- [ ] **Notifications UI:**
  - **Header Badge:** Bell icon with unread count.
  - **Notification List (Dropdown):** Quick view of recent notifications.
  - **Notification Page (Full Screen):** Dedicated page for viewing all notifications.
  - **Type Rendering:** Ensure `coaching_invitation` notifications display correctly with appropriate actions (Accept/Decline) or navigation.

## 5. Mobile Application (`apps/mobile`)

**Goal:** Implement communication features. **No Coaching UI implementation.**

- [ ] **Messaging UI:**
  - **Inbox Screen:** Tab or drawer item for conversations.
  - **Chat Screen:** Mobile-optimized chat interface.
- [ ] **Notifications UI:**
  - **Badging:** Tab bar or header badge for unread items.
  - **Notification Center (Full Screen):** Screen to view and manage notifications.
  - **Type Rendering:** Ensure `coaching_invitation` notifications display correctly (e.g., "You have a new coach invite") and navigate to the appropriate web view or handle the action if supported.
