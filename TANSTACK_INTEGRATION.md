Technical Specification: TanStack Query Integration (v2)

### 1. Executive Summary

This document details the process for completing the integration of TanStack Query into the `native` application. The goal is to refactor the app's data-fetching layer to align with the sophisticated, local-first architecture of **TurboFit**. By replacing imperative `useState` + `useEffect` patterns, we will create a more resilient, declarative, and maintainable system for managing server state.

### 2. Current State Analysis

The foundational work is complete and correctly implemented:

- **Library Installed:** `@tanstack/react-query` is a dependency.
- **Provider Configured:** `app/_layout.tsx` correctly wraps the application in a `QueryClientProvider` and includes the necessary `onlineManager` and `focusManager` for a native, offline-first environment.

The next phase is to refactor the application to utilize this foundation for all data fetching and mutations.

### 3. Implementation Plan: Refactoring to TanStack Query

This plan outlines the methodical replacement of legacy data-fetching logic with TanStack Query hooks, ensuring the new code adheres to **TurboFit's** architectural principles.

#### 3.1. Guiding Principles

- **Separation of Concerns:** API logic (fetching, caching) will be encapsulated within custom hooks. UI components will consume this data, remaining unaware of the underlying fetching mechanism. This mirrors the principle of the shared **`core` package**, which separates business logic from UI.
- **Predictable Query Keys:** Query keys are the cornerstone of TanStack Query's cache. A consistent, predictable structure is mandatory.
    - **Format:** An array, starting with the data scope and ending with specific identifiers or filters.
    - **List/Search Queries:** `['scope', 'list', { filters }]` (e.g., `['activities', 'list', { status: 'planned' }]`)
    - **Detail/ID Queries:** `['scope', 'detail', id]` (e.g., `['profiles', 'detail', 'user123']`)

#### 3.2. Code Structure

To organize our server state logic, all new TanStack Query hooks will be co-located.

**Proposed Directory:** `apps/native/lib/hooks/api/`

- For each data domain (e.g., `profiles`, `activities`), create a corresponding file (e.g., `profiles.ts`, `activities.ts`).

#### 3.3. Refactoring Strategy: Step-by-Step Examples

**Example 1: Fetching a Single Item (User Profile)**

This follows the pattern for fetching a specific resource, like the user's profile data, which is central to the **TurboFit** experience.

**Step 1: The API Service Function**
Ensure a clean service function exists, which can later be powered by the `drizzle` package.

```typescript
// apps/native/lib/services/ProfileService.ts
import { Profile } from '@repo/core/schemas'; // Use shared schemas

export const getProfile = async (): Promise<Profile> => {
  // This function will eventually call your Drizzle-backed API
  const response = await fetch('/api/mobile/profile');
  if (!response.ok) throw new Error('Failed to fetch profile');
  return response.json();
};
```

**Step 2: The Custom Query Hook**
Create a hook that encapsulates the query logic.

```typescript
// apps/native/lib/hooks/api/profiles.ts
import { useQuery } from '@tanstack/react-query';
import { getProfile } from '@lib/services/ProfileService';

// Centralized query keys prevent typos and simplify cache invalidation
export const profileKeys = {
  all: ['profiles'] as const,
  detail: () => [...profileKeys.all, 'detail'] as const,
};

export const useProfile = () => {
  return useQuery({
    queryKey: profileKeys.detail(),
    queryFn: getProfile,
  });
};
```

**Example 2: Fetching a List of Data (Planned Activities)**

This pattern is for fetching collections, such as a user's list of **planned activities**.

**Step 1: The API Service Function**

```typescript
// apps/native/lib/services/ActivityService.ts
import { PlannedActivity } from '@repo/core/schemas';

export const getPlannedActivities = async (filters: { month: number; year: number }): Promise<PlannedActivity[]> => {
  const params = new URLSearchParams(filters as any).toString();
  const response = await fetch(`/api/mobile/activities/planned?${params}`);
  if (!response.ok) throw new Error('Failed to fetch planned activities');
  return response.json();
};
```

**Step 2: The Custom Query Hook**

```typescript
// apps/native/lib/hooks/api/activities.ts
import { useQuery } from '@tanstack/react-query';
import { getPlannedActivities } from '@lib/services/ActivityService';

export const activityKeys = {
  all: ['activities'] as const,
  lists: () => [...activityKeys.all, 'list'] as const,
  list: (filters: object) => [...activityKeys.lists(), filters] as const,
};

export const usePlannedActivities = (filters: { month: number; year: number }) => {
  return useQuery({
    queryKey: activityKeys.list(filters),
    queryFn: () => getPlannedActivities(filters),
  });
};
```

#### 3.4. Handling Data Mutations (`useMutation`)

For creating, updating, or deleting data, `useMutation` is used. Its `onSuccess` callback is perfect for invalidating cached data, ensuring the UI automatically reflects changes.

**Example: Creating a new completed activity**

```typescript
// apps/native/lib/hooks/api/activities.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCompletedActivity } from '@lib/services/ActivityService';
// ... assume activityKeys is defined as above

export const useCreateCompletedActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCompletedActivity, // (newActivityData) => Promise<Activity>
    onSuccess: () => {
      // When a new activity is created, invalidate all activity lists.
      // This will cause any component using usePlannedActivities to automatically refetch.
      queryClient.invalidateQueries({ queryKey: activityKeys.lists() });
    },
    onError: (error) => {
      console.error("Failed to create activity", error);
    }
  });
};
```

### 4. Verification & Development Experience

To debug and verify your data flow, the React Query Devtools are essential.

**Action:**
1.  Install the native devtools: `bun add react-query-native-devtools`
2.  Add the devtools to `app/_layout.tsx` inside the `QueryClientProvider`.

```tsx
// apps/native/app/_layout.tsx
import { ReactQueryDevtools } from 'react-query-native-devtools';

export default function RootLayout() {
  // ...
  return (
    <QueryClientProvider client={queryClient}>
      {/* ... other providers */}
      <ReactQueryDevtools />
    </QueryClientProvider>
  );
}
```

### 5. Maintenance and Long-Term Strategy

- **Embrace the `core` Package:** Continue to define all your types and validation schemas (Zod) in `packages/core`. Your API hooks should import these types to ensure end-to-end type safety.
- **Centralize Hooks:** All server state logic must live within `lib/hooks/api/`. No UI component should ever contain direct data-fetching logic.
- **Optimize for Local-First:** For a truly seamless offline experience, explore using TanStack Query's persistence and hydration features in combination with Expo-SQLite. You can serialize the query cache to local storage and rehydrate it on app start.
