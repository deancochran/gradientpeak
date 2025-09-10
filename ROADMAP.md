# TurboFit Mobile App Modernization Tasks


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
