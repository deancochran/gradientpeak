# Social Network Enhancements - Design Document

## 1. Problem Statement
GradientPeak currently lacks social features that allow users to interact with each other. Users cannot follow other athletes, see their public activities, or express appreciation for content (likes). Additionally, while a messaging foundation exists, there is no easy way to initiate a 1-on-1 conversation directly from a user's profile.

## 2. Proposed Solution
We will introduce a suite of social features:
1.  **Privacy Controls & Following:** Users can set their profiles to "Public" or "Private". Public profiles can be followed instantly, while private profiles require a follow request that the user must approve.
2.  **Liking System:** Users can "like" activities, training plans, and activity plans. This will be tracked via a polymorphic `likes` table, with denormalized `likes_count` columns on the target entities for performance.
3.  **Direct Messaging Integration:** We will add a "Message" button to user profiles that seamlessly creates or resumes a 1-on-1 conversation using the existing messaging schema.

## 3. Architecture & Data Model

### 3.1. Database Schema
*   **`profiles` table:** Add `is_public BOOLEAN DEFAULT false`.
*   **`follows` table:** A new table to track relationships (`follower_id`, `following_id`, `status: 'pending' | 'accepted'`).
*   **`likes` table:** A polymorphic table (`profile_id`, `entity_type`, `entity_id`) to ensure users can only like an entity once.
*   **Denormalization:** Add `likes_count` to `activities`, `training_plans`, and `activity_plans`, maintained by Postgres triggers on the `likes` table.

### 3.2. Backend (tRPC)
*   A new `social` router will handle follow requests and toggling likes.
*   The `profiles` router will be updated to return privacy state and follow status, and will conditionally mask private data (like recent activities) if the requesting user is not an approved follower.
*   The `messaging` router will get a new `getOrCreateDM` procedure to handle the "Message" button logic.

### 3.3. Frontend (Mobile & Web)
*   **User Profiles:** New/updated screens to display user details, follow status, and a message button.
*   **Settings:** A toggle for the `is_public` preference.
*   **Notifications:** UI to accept or reject incoming follow requests.
*   **Content Feeds:** Integration of a "Like" button (heart icon) and like counts on activity and template cards.
