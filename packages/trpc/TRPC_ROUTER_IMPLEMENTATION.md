## **Enhanced AI Prompt: Full-Stack tRPC Router Implementation for TurboFit**

### **1. Role & Objective**

You are a senior full-stack developer contributing to the **TurboFit monorepo**.

Your objective is to implement a new **tRPC API** that serves as the unified backend for the Next.js web app (`apps/web`) and the Expo mobile app (`apps/mobile`). This involves migrating legacy API logic into a modular, Supabase-backed tRPC router architecture, adhering strictly to the project's development rules and conventions.

### **2. Core Project Rules & Context**

Before you begin, you must review and adhere to the project's foundational rules outlined in `@file:///Users/deancochran/Dev/turbo-fit/.rules`.

**Key principles to enforce:**

*   **Single Source of Truth:** All shared business logic, types, and schemas must be imported from the `packages/core` and `packages/supabase` directories. **Do not** create app-specific types.
*   **Thin Routers:** tRPC routers must be thin, stateless wrappers around the Supabase client (`ctx.supabase`).
*   **Schema-First Development:** The ground truth for all database structures is `packages/supabase/database.types.ts` and the SQL files in `packages/supabase/schemas`. **Do not** infer types or modify the schema.
*   **Documentation & Traceability:** All changes must be documented. For this task, you will create a new `README.md` within the `packages/trpc` directory to document the new API structure.

### **3. The Task: Migrate to a Unified tRPC API**

You will create a set of tRPC routers within the `packages/trpc` directory. This new API will replace the existing, fragmented backend logic currently found in `apps/web/app/api/mobile`.

#### **Architectural Requirements:**

1.  **Location:** All new tRPC router code will reside in `packages/trpc/src/routers/`.
2.  **Context:** The tRPC context (`packages/trpc/src/context.ts`) provides a Supabase client instance via `ctx.supabase`. Use this for all database operations.
3.  **Procedures:**
    *   Use `publicProcedure` for endpoints that do not require authentication (e.g., auth-related actions like sign-in/sign-up).
    *   Implement a `protectedProcedure` that verifies a user's session using `ctx.supabase.auth.getUser()`. This procedure should be used for all endpoints that require an authenticated user.
4.  **Input Validation:** All procedure inputs must be validated using Zod schemas. Import or create these schemas in `packages/core/schemas/` and import them into your routers.

### **4. Feature-by-Feature Implementation Plan**

You will implement the following routers, ensuring each replicates the baseline functionality of the old mobile API endpoints.

#### **A. Authentication Router (`auth.ts`)**

*   **Objective:** Provide a complete, unified authentication API for both web and mobile clients by wrapping core Supabase auth functionalities.

*   **Procedures:**

    *   **`signUp` (`publicProcedure`)**
        *   **Action:** Creates a new user in Supabase Auth.
        *   **Input:** Zod schema with `email`, `password`, and an optional `metadata` object.
        *   **Logic:** Calls `supabase.auth.signUp()`.

    *   **`signInWithPassword` (`publicProcedure`)**
        *   **Action:** Authenticates a user and returns a session.
        *   **Input:** Zod schema with `email` and `password`.
        *   **Logic:** Calls `supabase.auth.signInWithPassword()`.

    *   **`signOut` (`protectedProcedure`)**
        *   **Action:** Invalidates the user's current session.
        *   **Input:** None.
        *   **Logic:** Calls `supabase.auth.signOut()`. Must be called by an authenticated user.

    *   **`getUser` (`protectedProcedure`)**
        *   **Action:** Retrieves the session user's data. This is the primary method for clients to verify an active session.
        *   **Input:** None.
        *   **Logic:** Reads the user object from the tRPC context.

    *   **`sendPasswordResetEmail` (`publicProcedure`)**
        *   **Action:** Sends a password reset link to a user's email.
        *   **Input:** Zod schema with `email` and `redirectTo` (a URL or deep-link string).
        *   **Logic:** Calls `supabase.auth.resetPasswordForEmail()`. The `redirectTo` field is essential for directing the user back to the correct application (web or mobile) after clicking the link.

    *   **`updatePassword` (`protectedProcedure`)**
        *   **Action:** Updates the password for the currently authenticated user.
        *   **Input:** Zod schema with `newPassword`.
        *   **Logic:** Calls `supabase.auth.updateUser()`. This is intended for use after a user has followed a password reset link and is in a temporary authenticated state.

#### **B. Profiles Router (`profiles.ts`)**

*   **Objective:** Manage user profiles.
*   **Procedures (all `protectedProcedure`):**
    *   `get`: Fetches a single user profile based on the authenticated user's ID.
    *   `update`: Updates the authenticated user's profile. Input should be validated against a Zod schema (`profileUpdateSchema`).
    *   `list`: A searchable list procedure.
        *   **Input:** A Zod schema allowing optional filters (e.g., by `username`) and pagination (`limit`, `offset`).
        *   **Output:** A paginated list of profiles.

#### **C. Activities & Streams Routers (`activities.ts`, `activityStreams.ts`)**

*   **Objective:** Provide full CRUD and sync functionality for activities and their associated time-series data.
*   **`activities.ts` Procedures (all `protectedProcedure`):**
    *   `get`: Fetches a single activity by its ID, ensuring it belongs to the authenticated user.
    *   `create`: Creates a new activity. Input is a Zod schema matching the `activities` table structure.
    *   `update`: Updates an existing activity.
    *   `delete`: Deletes an activity.
    *   `list`: Searchable list with filters for `activity_type`, `date_range`, and pagination.
    *   `sync`: A procedure to handle batch uploads/updates of activities from a client device. This replicates the logic from `/activities/sync`.

*   **`activityStreams.ts` Procedures (all `protectedProcedure`):**
    *   `getForActivity`: Fetches all stream data for a given `activity_id`.
    *   `batchCreate`: A procedure to insert an array of stream points for a single activity. This is critical for performance.

#### **D. Planning Routers (`plannedActivities.ts`)**

*   **Objective:** Manage planned future workouts.
*   **Procedures (all `protectedProcedure`):**
    *   `get`, `create`, `update`, `delete`, and `list` procedures with the same structure as the `activities` router, but for the `planned_activities` table.

#### **E. Storage Router (`storage.ts`)**

*   **Objective:** Securely manage user file uploads and downloads (e.g., profile avatars) by generating signed URLs. This avoids exposing storage permissions directly to clients and is highly efficient for mobile.
*   **Workflow:** The client will first request a signed URL from a tRPC procedure. It will then use this URL to upload or download the file directly to/from Supabase Storage, bypassing the tRPC server for the file transfer itself.

*   **Procedures (all `protectedProcedure`):**

    *   **`createSignedUploadUrl`**
        *   **Action:** Generates a temporary, secure URL for a client to upload a file.
        *   **Input:** Zod schema with `fileName` and `fileType`.
        *   **Logic:**
            1.  Construct a unique file path using the authenticated user's ID (e.g., `profile-avatars/${userId}/${fileName}`).
            2.  Call `supabase.storage.from(...).createSignedUploadUrl(filePath)`.
            3.  Return the `signedUrl` and the `path`.
        *   **Client-Side:** The client receives the `signedUrl` and uses it to `PUT` the file content directly to Supabase Storage. After the upload succeeds, the client must call another procedure (e.g., `profiles.update`) to save the returned `path` in the database.

    *   **`getSignedUrl`**
        *   **Action:** Generates a temporary URL to view or download a private file.
        *   **Input:** Zod schema with `filePath`.
        *   **Logic:**
            1.  **Security Check:** Verify the requested `filePath` belongs to the authenticated user (e.g., `filePath.startsWith(userId)`).
            2.  Call `supabase.storage.from(...).createSignedUrl(filePath, expiresIn)` with a short expiration time (e.g., 60 seconds).
            3.  Return the `signedUrl`.
        *   **Client-Side:** The client can use this URL directly as the `src` for an image or to initiate a file download.

    *   **`deleteFile`**
        *   **Action:** Deletes a file from storage.
        *   **Input:** Zod schema with `filePath`.
        *   **Logic:**
            1.  **Security Check:** Verify the `filePath` belongs to the authenticated user.
            2.  Call `supabase.storage.from(...).remove([filePath])`.

### **5. Deliverables**

1.  **Router Files:** Create the following files within `packages/trpc/src/routers/`:
    *   `auth.ts`
    *   `profiles.ts`
    *   `activities.ts`
    *   `activityStreams.ts`
    *   `plannedActivities.ts`
    *   `index.ts`: The root app router that merges all the individual routers.

2.  **Shared Schemas:** Add any new Zod validation schemas to the appropriate files in `packages/core/schemas/`.

3.  **Documentation:** Create a `README.md` in `packages/trpc/` that:
    *   Briefly explains the purpose of the tRPC package.
    *   Lists the available routers and their primary responsibilities.
    *   Provides a clear example of how to use a `protectedProcedure` and a `publicProcedure`.

### **6. Final Instructions & Constraints**

*   **Start Fresh:** Do not copy-paste old Drizzle queries. Write new, clean Supabase queries.
*   **No Business Logic:** The routers should only contain logic for querying and mutating data. No calculations.
*   **Error Handling:** Wrap Supabase calls in `try/catch` blocks and throw appropriate `TRPCError` instances on failure (e.g., `NOT_FOUND`, `UNAUTHORIZED`, `BAD_REQUEST`).
*   **Incremental Steps:** Implement and verify one router at a time to ensure correctness. I recommend starting with `auth.ts` and `profiles.ts`.
