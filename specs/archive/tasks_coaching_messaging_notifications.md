# Tasks: Coaching, Messaging, and Notifications

## 1. Database Layer (Supabase)

- [ ] **Update `init.sql`:** Append the new schema definitions to `packages/supabase/migrations/*_init.sql`.
- [ ] **Apply Changes to Local DB:** Execute the new SQL statements against the local Supabase instance to stage the changes.
- [ ] **Generate Migration:** Run `supabase db diff -f coaching_messaging_notifications` to generate a new migration file based on the local database changes.
- [ ] **Apply Migration:** Run `supabase migration up` to ensure the migration is applied and tracked correctly.
- [ ] **Update Types:** Run `pnpm run update-types` to regenerate the database types and Zod schemas.

## 2. Core Package (`@repo/core`)

- [ ] **Create Schemas:** Create new schema files in `packages/core/src/schemas/`:
  - `coaching.ts`: `CoachingInvitationSchema`, `CoachAthleteRelationSchema`.
  - `messaging.ts`: `ConversationSchema`, `MessageSchema`, `CreateMessageSchema`.
  - `notifications.ts`: `NotificationSchema` (Ensure `type` enum matches DB).
- [ ] **Export Types:** Export inferred TypeScript types from these schemas in `packages/core/src/index.ts`.

## 3. API Layer (`@repo/trpc`)

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

- [ ] **Messaging UI:**
  - **Inbox Screen:** Tab or drawer item for conversations.
  - **Chat Screen:** Mobile-optimized chat interface.
- [ ] **Notifications UI:**
  - **Badging:** Tab bar or header badge for unread items.
  - **Notification Center (Full Screen):** Screen to view and manage notifications.
  - **Type Rendering:** Ensure `coaching_invitation` notifications display correctly (e.g., "You have a new coach invite") and navigate to the appropriate web view or handle the action if supported.
