# TurboFit Mobile App Modernization Tasks

## 🔥 Critical Architecture Fixes

### Integrate Modern Data Fetching
- Install and configure TanStack Query
- Add QueryClient provider to `app/_layout.tsx`
- Replace all `useState` + `useEffect` patterns with `useQuery`/`useMutation`
- Remove manual loading states in favor of Query's built-in states
- Add React Query DevTools for development

### Complete Backend Migration
- **Refactor `activity-sync-service.ts`:**
  - Keep direct Supabase Storage uploads (this is correct!)
  - Update to use Next.js API for activity metadata and processing
  - Flow: Upload file to Supabase Storage → Send file URL + metadata to Next.js API
  - Add proper error handling and retry logic

- **Refactor `profile-service.ts`:**
  - Use Next.js API for profile operations
  - Keep Supabase auth operations direct
  - Implement optimistic updates with Query mutations

- **Update API client methods:**
  - Business logic operations go through Next.js API
  - Keep auth and file operations direct to Supabase
  - Add proper TypeScript return types
  - Implement request/response interceptors for auth tokens

## ⚡ State Management Modernization

### Implement Zustand for Client State
- Install Zustand with persistence middleware
- Create domain-specific stores:
  - `stores/auth-store.ts` - Auth state and actions
  - `stores/workout-store.ts` - Active workout recording state
  - `stores/settings-store.ts` - User preferences
  - `stores/ui-store.ts` - UI state (modals, tabs, etc.)

- Migrate `AuthContext` to Zustand store
- Add workout recording store with persistence for recovery
- Create custom hooks combining Query + Zustand for optimistic updates

## 🚀 Feature Completion

### Complete Core Features
- **Trends Screen:** Implement charts with Victory Native, time filters, CTL/ATL/TSB progression
- **Training Plans Screen:** Plan viewing, progress tracking, workout scheduling
- **Enhanced Workout Recording:** Real-time metrics, auto-pause, structure following
- Build `usePerformanceMetrics` hook integration with Query

### Offline-First Improvements
- Implement conflict resolution strategies
- Add sync status indicators in UI
- Create background sync with Expo TaskManager
- Add optimistic UI updates with proper rollback

## 📱 Modern Expo Features

### Leverage Latest Expo Capabilities
- Implement proper GPS tracking with expo-location
- Add workout data export and sharing
- Implement workout reminders with expo-notifications
- Add haptic feedback for important actions
- Create proper splash screen and app state persistence

### Performance & UX Optimizations
- Add list virtualization for large datasets
- Implement pull-to-refresh patterns
- Create better loading states, empty states, and error boundaries
- Add dark/light theme toggle with persistence

## 🔧 Developer Experience

### Development Tooling
- Configure proper logging with structured logs
- Set up error reporting (Sentry)
- Add unit tests for stores and hooks
- Set up pre-commit hooks with lint-staged
- Configure ESLint rules for React Query and Zustand

## 📋 Recommended Dependencies

```bash
# Development
bun add -D lint-staged husky
```

## 🎯 Architecture Considerations

### Data Flow Strategy
```
Mobile App
├── Auth: Direct to Supabase Auth ✓
├── File Storage: Direct to Supabase Storage ✓
├── Business Logic: Next.js API ✓
└── Database: Next.js API → Drizzle → PostgreSQL ✓
```

### State Management Pattern
- **Server State:** TanStack Query (caching, sync, background updates)
- **Client State:** Zustand (UI state, active workouts, preferences)
- **Persistence:** Zustand middleware for client state, Query for server state
- **Optimistic Updates:** Zustand immediate updates + Query mutations with rollback

### Breaking Changes to Plan For
- AuthContext removal requires updating all consuming components
- API service refactoring may temporarily break sync functionality
- Query integration changes loading state patterns throughout app
- Plan for thorough testing after each major change

### Success Metrics
- Zero duplicate types (all from `@turbofit/core`)
- No manual `useState` + `useEffect` for server data
- Consistent state management pattern
- Complete feature set with real data
- Robust offline-first sync capabilities