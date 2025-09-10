Architectural Vision: A Local-First Fitness Application**

The primary goal of the TurboFit native app is to provide a **local-first, offline-capable experience**. This ensures that the user can reliably record workouts and interact with their data with or without an internet connection. The architecture is built on a clear separation of concerns, using two distinct database clients powered by Drizzle ORM to manage local and remote data, with Supabase Auth handling user identity.

---

### **1. The Local Layer: Instant & Offline**

This is the app's primary operational database, designed for speed and offline availability.

*   **Technology**: It uses **Expo SQLite** as the database engine and the **Drizzle ORM SQLite client** for type-safe queries.
*   **Function**:
    *   All new data, such as a newly started workout, GPS data points, or user notes, is written **immediately** to the local SQLite database.
    *   This makes the UI extremely fast and responsive, as it does not need to wait for a network request to complete.
    *   The app can be used entirely offline for its core functions.
*   **Key Tables**: `local_activities` for in-progress workouts and a `sync_queue` to track all local changes that need to be sent to the cloud.
*   **Access**: Code interacts with this database via the `useLocalDb` hook we created (`import { useLocalDb } from "@lib/db"`).

---

### **2. The Cloud Layer: The Single Source of Truth**

This is the central, persistent data store for the entire TurboFit platform.

*   **Technology**: A **PostgreSQL** database managed by **Supabase**, with the schema and queries managed by the Drizzle ORM client defined in the `@repo/drizzle` package.
*   **Function**:
    *   It stores the complete, normalized history of all user data.
    *   It enables data synchronization across multiple clients (e.g., the native app and the web dashboard).
    *   It's where long-term analytics and data processing will occur.
*   **Access**: The native app interacts with this database via the `onlineDb` client (`import { onlineDb } from "@lib/db"`).

---

### **3. The Authentication Layer: Secure User Identity**

User authentication is handled entirely and exclusively by Supabase Auth.

*   **Technology**: The official `@supabase/supabase-js` client library.
*   **Function**: It manages all aspects of user identity: sign-up, sign-in, password resets, and session management (JWTs).
*   **Separation**: Drizzle ORM is **not** involved in authentication. The Supabase client provides the user's session status and identity, which is a prerequisite for making any authenticated data requests.

---

### **4. The Synchronization Process: Bridging Local and Cloud**

This is the critical process that makes the local-first architecture work. It runs in the background when the device is online.

*   **Uploading Changes**:
    1.  A service periodically checks the local `sync_queue` table.
    2.  For each pending operation (e.g., 'create activity'), it takes the data payload.
    3.  It uses the **`onlineDb`** client to send this data to the PostgreSQL database.
    4.  Upon successful upload, the entry is removed from the local `sync_queue`.

*   **Downloading Changes**:
    1.  The service also queries the cloud database for any new or updated information since the last sync (e.g., a new training plan assigned via the web app).
    2.  It then writes these changes back into the local SQLite database, ensuring the local data is fresh and ready for offline use.

---

### **5. Handling Security: The Role of RLS**

The interaction between Drizzle and Supabase's Row-Level Security (RLS) is handled with specific intent:

*   **For Background Sync**: The synchronization process, which may run with elevated service-level privileges, can use the direct-to-database **`onlineDb`** Drizzle client for efficient, bulk data transfers.
*   **For User-Facing Operations**: For any action that requires the strict security context of the logged-in user (e.g., fetching a user's private profile details), the app will use the **Supabase JS client** (`supabase.from('profiles').select()`). This ensures the request goes through Supabase's API layer, which properly enforces any RLS policies dependent on the user's ID (`auth.uid()`).
