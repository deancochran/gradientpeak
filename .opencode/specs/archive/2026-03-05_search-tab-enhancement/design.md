# Search Tab Enhancement Specification

## Overview

Enhance the mobile "Discover" tab to provide comprehensive search functionality across multiple entity types: Users, Activity Plans, Training Plans, and Routes. Implement tab-based navigation to filter results by entity type, with each tab displaying paginated results.

## Problem Statement

The current Discover tab only searches activity plans. Users need to find:

- Other users to follow
- Activity plans (workouts/templates)
- Training plans (multi-week programs)
- Routes (saved courses/maps)

Currently, there's no unified search experience - users must navigate to different sections of the app to find these entities.

## Goals

1. **Unified Search**: Single search input that queries all entity types
2. **Tab-Based Filtering**: Users can switch between entity types (Users, Activity Plans, Training Plans, Routes)
3. **Paginated Results**: Each tab shows paginated lists for smooth performance
4. **Navigation**: Clicking any result navigates to the appropriate detail screen
5. **Consistent UX**: Follow existing mobile app patterns and component library

## Technical Approach

### Backend Requirements

#### New tRPC Procedures (in `social.ts` or new `search.ts` router)

```typescript
// Search users by username
searchUsers: protectedProcedure
  .input(
    z.object({
      query: z.string().min(1),
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
    }),
  )
  .query(async ({ ctx, input }) => {
    // Search profiles table by username (ilike)
    // Return paginated results with total count
  });
```

#### Existing Procedures to Use

- `activityPlans.list` - Already exists, add search parameter
- `trainingPlansCrud.listTemplates` - Already exists, add search parameter
- `routes.list` - Check if exists, or create

### Frontend Requirements

#### Search Screen (`discover.tsx`)

1. **Search Input**: Persistent search bar at top
2. **Tab Bar**: Segmented tabs for entity types:
   - All (combined results)
   - Users
   - Activity Plans
   - Training Plans
   - Routes

3. **Results Display**:
   - Each tab shows paginated FlatList
   - Pull-to-refresh functionality
   - Load more on scroll

4. **Result Cards**:
   - Users: Avatar, username, follow button
   - Activity Plans: Name, description, category icon
   - Training Plans: Name, duration, difficulty
   - Routes: Name, distance, elevation

#### Navigation Targets

| Entity Type   | Detail Screen              | Route                           |
| ------------- | -------------------------- | ------------------------------- |
| User          | `user/[userId].tsx`        | `/user/{userId}`                |
| Activity Plan | `activity-plan-detail.tsx` | `/activity-plan-detail?id={id}` |
| Training Plan | `training-plan.tsx`        | `/training-plan?id={id}`        |
| Route         | `route-detail.tsx`         | `/route-detail?id={id}`         |

## UI/UX Design

### Layout Structure

```
┌─────────────────────────────────┐
│         App Header              │
│  "Discover"                     │
├─────────────────────────────────┤
│  [🔍 Search...        ] [⚙️]   │
├─────────────────────────────────┤
│  [Activity Plans] [Training]    │
│  [Routes] [Users]              │
├─────────────────────────────────┤
│                                 │
│    Paginated Results List       │
│    ┌─────────────────────┐     │
│    │ Result Card         │     │
│    └─────────────────────┘     │
│    ┌─────────────────────┐     │
│    │ Result Card         │     │
│    └─────────────────────┘     │
│           ...                  │
│    [Load More]                 │
│                                 │
└─────────────────────────────────┘
```

### Component Specifications

#### Search Bar

- Height: 48px
- Placeholder: "Search users, activities, plans..."
- Clear button when text present
- Debounced search (300ms)

#### Tab Bar

- Use existing tab/segmented control component
- Tabs: "Activity Plans", "Training Plans", "Routes", "Users"
- Default tab: "Activity Plans"
- Each tab queries its specific entity type (no combined results)

#### Result Cards

**User Card**

- Height: 72px
- Avatar (48x48), Username, Follow button
- Private indicator if applicable

**Activity Plan Card**

- Height: 80px
- Icon (category), Name, Description (truncated)
- Duration, category badge

**Training Plan Card**

- Height: 88px
- Name, duration (e.g., "8 weeks")
- Difficulty level, workout count

**Route Card**

- Height: 80px
- Name, distance, elevation gain
- Map thumbnail (optional)

### States

1. **Empty**: "No results found for '[query]'"
2. **Loading**: Skeleton loaders during fetch
3. **Error**: Error message with retry button
4. **No Query**: Show "Recent searches" or "Popular" content
5. **Results**: Paginated list with "Load more"

## Implementation Phases

### Phase 1: Backend (Database & tRPC)

1. Create `searchUsers` procedure in `social.ts` or new `search.ts` router
2. Add `search` parameter to existing `activityPlans.list`
3. Add `search` parameter to existing `trainingPlansCrud.listTemplates`
4. Check/create `routes.list` with search support

### Phase 2: Frontend - Search Screen

1. Refactor `discover.tsx` to use tabs
2. Implement search input with debounce
3. Create tab state management
4. Implement paginated queries per tab

### Phase 3: Result Components

1. Create `UserSearchCard` component
2. Create `TrainingPlanSearchCard` component
3. Create `RouteSearchCard` component
4. Reuse existing `ActivityPlanCard`

### Phase 4: Navigation

1. Wire up navigation to detail screens
2. Handle deep linking back to search results
3. Test all navigation paths

## Database Schema Notes

### Search Considerations

- Use PostgreSQL `ilike` for case-insensitive search
- Consider full-text search (`tsvector`) for better relevance
- Add database indexes on searchable columns:
  - `profiles.username`
  - `activity_plans.name`, `activity_plans.description`
  - `training_plans.name`
  - `routes.name`

### Performance

- Limit initial results to 20 items
- Use cursor-based pagination for efficiency
- Debounce search input to reduce API calls
- Cache recent searches locally

## Testing Strategy

1. **Unit Tests**: Test search filtering logic
2. **Integration Tests**: Test search API endpoints
3. **E2E Tests**: Test search flow end-to-end
4. **Performance Tests**: Verify pagination works correctly
5. **Accessibility Tests**: Verify screen reader support

## Success Metrics

- Search results appear within 500ms for typical queries
- Pagination loads smoothly without jank
- All navigation paths work correctly
- Search works offline with cached results (future enhancement)
