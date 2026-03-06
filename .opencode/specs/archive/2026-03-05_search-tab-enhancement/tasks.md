# Search Tab Enhancement - Tasks

## Phase 1: Backend (tRPC)

- [ ] **1.1** Create `searchUsers` procedure in `social.ts` router
  - Input: `{ query: string, limit: number, offset: number }`
  - Search profiles by username (ilike)
  - Return: `{ users: Profile[], total: number, hasMore: boolean }`
  - Add database index on `profiles.username`

- [ ] **1.2** Update `activityPlans.list` to support search
  - Add optional `search` parameter
  - Search in `name` and `description` fields
  - Ensure pagination works with search

- [ ] **1.3** Update `trainingPlansCrud.listTemplates` to support search
  - Add optional `search` parameter
  - Search in `name` and `description` fields
  - Ensure pagination works with search

- [ ] **1.4** Verify/create routes search functionality
  - Check if `routes.list` exists in tRPC
  - Add search support if needed

## Phase 2: Frontend - Search Screen Infrastructure

- [ ] **2.1** Refactor `discover.tsx` to use tab-based UI
  - Install/import segmented tabs component
  - Create tabs: "Activity Plans", "Training Plans", "Routes", "Users"
  - Default tab: "Activity Plans"
  - Manage active tab state

- [ ] **2.2** Implement search input with debounce
  - Create search state management
  - Add 300ms debounce to search queries
  - Show clear button when text present

- [ ] **2.3** Create pagination hooks for each entity type
  - UseInfiniteQuery for each search type
  - Handle page state for each tab
  - Implement load more functionality

## Phase 3: Result Components

- [ ] **3.1** Create `UserSearchCard` component
  - Display avatar, username, follow button
  - Show private indicator if applicable
  - Handle follow/unfollow from card

- [ ] **3.2** Create `TrainingPlanSearchCard` component
  - Display name, duration, difficulty
  - Show workout count
  - Category indicator

- [ ] **3.3** Create `RouteSearchCard` component
  - Display name, distance, elevation
  - Optional map thumbnail
  - Route type indicator

- [ ] **3.4** Reuse existing `ActivityPlanCard`
  - Verify it works in search context
  - Add any missing props

## Phase 4: Navigation

- [ ] **4.1** Wire up User navigation
  - Navigate to `/user/{userId}`
  - Use existing `user/[userId].tsx`

- [ ] **4.2** Wire up Activity Plan navigation
  - Navigate to `/activity-plan-detail?id={id}`
  - Use existing `activity-plan-detail.tsx`

- [ ] **4.3** Wire up Training Plan navigation
  - Navigate to `/training-plan?id={id}`
  - Use existing `training-plan.tsx`

- [ ] **4.4** Wire up Route navigation
  - Navigate to `/route-detail?id={id}`
  - Use existing `route-detail.tsx`

## Phase 5: Polish & Error Handling

- [ ] **5.1** Implement loading states
  - Show skeleton loaders during fetch
  - Show loading indicator for "Load more"

- [ ] **5.2** Implement error states
  - Show error message with retry button
  - Handle network errors gracefully

- [ ] **5.3** Implement empty states
  - Show "No results found" message
  - Show suggestions for empty search

- [ ] **5.4** Implement pull-to-refresh
  - Add RefreshControl to FlatLists
  - Refresh current tab results

## Phase 6: Testing & Polish

- [ ] **6.1** Unit tests for search logic
- [ ] **6.2** Integration tests for tRPC procedures
- [ ] **6.3** E2E tests for search flow
- [ ] **6.4** Performance testing with large datasets
- [ ] **6.5** Accessibility testing
