# Development Guide

Complete guide for developing in the GradientPeak codebase.

## Quick Start

```bash
# Clone repository
git clone https://github.com/your-org/gradientpeak.git
cd gradientpeak

# Install dependencies (uses npm)
npm install

# Start all development servers
npm dev

# Start specific apps
cd apps/mobile && npm dev
cd apps/web && npm dev:next
```

## Environment Setup

### Prerequisites

- **npm:** v1.2.20+ (package manager)
- **Node.js:** v18+ (required by some dependencies)
- **Expo CLI:** Installed globally (`npm add -g expo-cli`)
- **Docker:** For local Supabase (optional)
- **iOS Development:** Xcode 15+ and CocoaPods (Mac only)
- **Android Development:** Android Studio with SDK 34+

### Environment Variables

#### Mobile (`apps/mobile/.env`)
```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

#### Web (`apps/web/.env.local`)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # Server-side only
```

### Local Supabase (Optional)

```bash
# Start local Supabase instance
cd packages/supabase
supabase start

# Apply migrations
supabase db reset

# Generate types
npm run update-types
```

## Development Workflow

### Starting Development

```bash
# Root level - starts all services
npm dev

# This runs:
# - Mobile: expo start (port 8081)
# - Web: next dev (port 3000)
# - Core package in watch mode
```

### Working on Specific Packages

#### Core Package Development

```bash
cd packages/core

# Run tests in watch mode
npm test --watch

# Build package
npm build

# Lint
npm lint
```

#### Mobile App Development

```bash
cd apps/mobile

# Start with clear cache
npm dev

# Run on specific platform
npm android
npm ios

# Generate native projects
npx expo prebuild

# Run native builds
npx expo run:android
npx expo run:ios
```

#### Web App Development

```bash
cd apps/web

# Start Next.js dev server
npm dev:next

# Start with ngrok tunnel (for mobile testing)
npm dev

# Build for production
npm build

# Type check
npm check-types
```

#### tRPC Development

```bash
cd packages/trpc

# After changing routers, rebuild
npm build

# Restart dependent apps (mobile/web)
```

#### Database Development

```bash
cd packages/supabase

# Create new migration
supabase migration new add_new_feature

# Edit migration file in migrations/

# Apply migration
supabase db reset

# Generate TypeScript types
npm run update-types
```

## Common Commands

### Monorepo Commands (Root)

```bash
npm dev                 # Start all dev servers
npm build              # Build all packages/apps
npm lint               # Lint entire codebase
npm test               # Run all tests
npm check-types        # Type check all packages
npm format             # Format code with Prettier
```

### Mobile Commands

```bash
npm dev                # Start Expo with cache clear
npm android            # Run on Android
npm ios                # Run on iOS
npm lint               # Lint mobile app

# Production builds (requires EAS)
eas build --platform android --profile production
eas build --platform ios --profile production
eas submit --platform ios
```

### Web Commands

```bash
npm dev:next           # Next.js dev server
npm build              # Production build
npm start              # Start production server
npm lint               # Lint web app
```

### Database Commands

```bash
npm run update-types   # Regenerate types from schema
supabase db reset      # Reset to latest migration
supabase db diff       # Generate migration from changes
supabase migration new <name>  # Create new migration
```

## Code Organization

### File Naming Conventions

- **Components:** PascalCase (`ActivityCard.tsx`)
- **Utilities:** camelCase (`calculateTSS.ts`)
- **Hooks:** camelCase with `use` prefix (`useActivity.ts`)
- **Types:** PascalCase (`Activity.ts`)
- **Constants:** SCREAMING_SNAKE_CASE (`ACTIVITY_TYPES.ts`)

### Import Order

```typescript
// 1. External dependencies
import { useState } from 'react';
import { View, Text } from 'react-native';

// 2. Internal packages
import { calculateTSS } from '@repo/core';
import { trpc } from '@repo/trpc';

// 3. Relative imports (utils, hooks)
import { useAuth } from '@/lib/hooks';
import { formatDuration } from '@/lib/utils';

// 4. Relative imports (components)
import { Button } from '@/components/ui/button';
import { ActivityCard } from '@/components/dashboard/ActivityCard';

// 5. Types
import type { Activity } from '@/types';
```

### Component Structure

```typescript
// 1. Imports
import { useState } from 'react';
import { View, Text } from 'react-native';
import { trpc } from '@/lib/trpc';

// 2. Types
interface Props {
  activityId: string;
}

// 3. Component
export function ActivityDetail({ activityId }: Props) {
  // 3a. Hooks
  const { data, isLoading } = trpc.activities.getById.useQuery({ id: activityId });
  const [expanded, setExpanded] = useState(false);

  // 3b. Derived state
  const hasData = !!data;

  // 3c. Handlers
  const handleExpand = () => setExpanded(!expanded);

  // 3d. Early returns
  if (isLoading) return <LoadingSpinner />;
  if (!hasData) return <EmptyState />;

  // 3e. Render
  return (
    <View>
      <Text>{data.name}</Text>
      <Button onPress={handleExpand}>Toggle</Button>
    </View>
  );
}
```

## Styling Guidelines

### Mobile (NativeWind)

**Use NativeWind v4** - Tailwind CSS for React Native:

```typescript
// ✅ Correct
<View className="flex-1 bg-background p-4">
  <Text className="text-2xl font-bold text-foreground">Title</Text>
  <Text className="text-muted-foreground mt-2">Subtitle</Text>
</View>

// ❌ Wrong - Don't use StyleSheet
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 }
});
<View style={styles.container}>...</View>
```

**Theme Colors:**
- `bg-background` / `text-foreground` - Base colors
- `bg-card` / `text-card-foreground` - Card backgrounds
- `text-muted-foreground` - Secondary text
- `bg-primary` / `text-primary-foreground` - Primary actions
- `bg-destructive` - Danger actions

### Web (Tailwind CSS)

**Use Tailwind v4** with Shadcn/ui components:

```typescript
// ✅ Correct
<div className="flex flex-col gap-4 p-4">
  <h1 className="text-2xl font-bold">Title</h1>
  <p className="text-muted-foreground">Description</p>
</div>
```

**Shadcn/ui Components:**
```typescript
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Activity</CardTitle>
  </CardHeader>
  <CardContent>
    <Button variant="outline">View Details</Button>
  </CardContent>
</Card>
```

## Type Safety

### Core Package Types

```typescript
// Import from core package
import type {
  ActivityPayload,
  ActivityPlanStructure,
  TrainingPlanStructure
} from '@repo/core';

// Use in components
const activity: ActivityPayload = { ... };
```

### Database Types

```typescript
// Import generated types
import type { Database } from '@repo/supabase';

// Extract table types
type Activity = Database['public']['Tables']['activities']['Row'];
type ActivityInsert = Database['public']['Tables']['activities']['Insert'];
type ActivityUpdate = Database['public']['Tables']['activities']['Update'];
```

### tRPC Types

```typescript
// tRPC provides inferred types
import { trpc } from '@/lib/trpc';

// Automatically typed from router
const { data } = trpc.activities.list.useQuery();
//      ^? data: Activity[] | undefined

// Mutation input is also typed
const update = trpc.activities.update.useMutation();
await update.mutateAsync({
  id: 'uuid',
  name: 'New Name',  // Only valid fields allowed
});
```

### Avoid `any` Types

```typescript
// ❌ Bad
const handleActivity = (activity: any) => { ... };
const activities: any[] = [];

// ✅ Good
import type { Activity } from '@repo/supabase';
const handleActivity = (activity: Activity) => { ... };
const activities: Activity[] = [];

// ✅ Better (when type is unknown)
const handleActivity = (activity: unknown) => {
  if (isActivity(activity)) {
    // Type guard narrows to Activity
  }
};
```

## Testing

### Core Package Tests

```bash
cd packages/core
npm test

# Watch mode
npm test --watch

# Coverage
npm test --coverage
```

**Example Test:**
```typescript
import { describe, it, expect } from 'npm:test';
import { calculateTSS, calculateIntensityFactor } from './calculations';

describe('calculateIntensityFactor', () => {
  it('calculates IF correctly', () => {
    const np = 250;  // Normalized Power
    const ftp = 300; // Functional Threshold Power
    const result = calculateIntensityFactor(np, ftp);
    expect(result).toBeCloseTo(0.833, 2);
  });

  it('handles zero FTP gracefully', () => {
    const result = calculateIntensityFactor(250, 0);
    expect(result).toBe(0);
  });
});
```

### Integration Tests (tRPC)

```typescript
import { describe, it, expect } from 'npm:test';
import { createCaller } from '@repo/trpc';

describe('activities router', () => {
  it('lists activities by date range', async () => {
    const ctx = { user: { id: 'test-user' } };
    const caller = createCaller(ctx);

    const result = await caller.activities.list({
      start_date: '2024-01-01',
      end_date: '2024-01-31',
    });

    expect(Array.isArray(result)).toBe(true);
  });
});
```

### E2E Tests (Mobile)

```typescript
// Using Maestro (maestro.mobile.dev)
// File: .maestro/test-activity-recording.yaml

appId: com.gradientpeak.app
---
- launchApp
- tapOn: "Record"
- tapOn: "Outdoor Run"
- tapOn: "Start Activity"
- waitForAnimationToEnd
- assertVisible: "00:00:*"
- tapOn: "Finish"
- assertVisible: "Activity Saved"
```

## Debugging

### Mobile Debugging

**React DevTools:**
```bash
# Install globally
npm i -g react-devtools

# Start devtools
react-devtools

# In app, press 'd' in Expo Go, select "Open React DevTools"
```

**Flipper:**
```bash
# Install Flipper desktop app
# Run development build with Flipper enabled
expo run:android --variant debug
```

**Console Logs:**
```typescript
// Structured logging
console.log('[ActivityRecorder]', 'Starting activity', { activityType });
console.error('[ActivityRecorder]', 'Failed to save', error);
```

### Web Debugging

**Next.js DevTools:**
- Automatically available in development
- View network requests, server/client components

**React Query DevTools:**
```typescript
// apps/web/app/layout.tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

<ReactQueryDevtools initialIsOpen={false} />
```

### tRPC Debugging

```typescript
// Enable verbose logging
import { trpc } from '@/lib/trpc';

const client = trpc.createClient({
  links: [
    loggerLink({
      enabled: () => true,
      logger(opts) {
        console.log('[tRPC]', opts.type, opts.path, opts.input);
      },
    }),
    // ... other links
  ],
});
```

## Common Issues & Solutions

### Issue: "Module not found" errors after adding dependency

**Solution:**
```bash
# Clear all caches
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules
npm install

# Restart dev servers
npm dev
```

### Issue: Mobile app not reflecting code changes

**Solution:**
```bash
# Clear Metro bundler cache
cd apps/mobile
npm dev  # Uses -c flag to clear cache

# If that doesn't work
rm -rf .expo
rm -rf node_modules
npm install
```

### Issue: Type errors after database schema changes

**Solution:**
```bash
# Regenerate types from database
cd packages/supabase
npm run update-types

# Rebuild core package
cd packages/core
npm build

# Restart apps
npm dev
```

### Issue: tRPC procedures returning wrong types

**Solution:**
```bash
# Rebuild tRPC package
cd packages/trpc
npm build

# Ensure core and supabase packages are built
cd packages/core && npm build
cd packages/supabase && npm run update-types

# Restart apps
npm dev
```

### Issue: "Cannot connect to Supabase" in local development

**Solution:**
```bash
# Check Supabase is running
cd packages/supabase
supabase status

# If not running
supabase start

# Update .env files with local URLs
# EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
```

### Issue: Expo build failing on iOS

**Solution:**
```bash
# Update CocoaPods
cd apps/mobile/ios
pod install --repo-update

# Clean build folder
cd ..
rm -rf ios/build

# Try build again
eas build --platform ios --profile development
```

## Performance Optimization

### Core Package Optimizations

- **Pure functions:** No side effects or I/O
- **Tree shaking:** Only import what you use
- **Memoization:** Use for expensive calculations

```typescript
// ✅ Good - tree-shakable
import { calculateTSS } from '@repo/core';

// ❌ Bad - imports entire package
import * as core from '@repo/core';
```

### React Query Optimizations

```typescript
// Aggressive caching for static data
trpc.activityPlans.list.useQuery(undefined, {
  staleTime: 1000 * 60 * 5,  // 5 minutes
  cacheTime: 1000 * 60 * 30, // 30 minutes
});

// Disable refetch for infrequently changing data
trpc.profiles.getCurrent.useQuery(undefined, {
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
```

### Mobile Optimizations

```typescript
// Use React.memo for expensive components
export const ActivityCard = React.memo(({ activity }: Props) => {
  // Expensive rendering logic
}, (prev, next) => prev.activity.id === next.activity.id);

// Use FlatList for long lists
<FlatList
  data={activities}
  renderItem={({ item }) => <ActivityCard activity={item} />}
  keyExtractor={(item) => item.id}
  removeClippedSubviews
  maxToRenderPerBatch={10}
  windowSize={5}
/>
```

## Git Workflow

### Branch Naming

- `feature/add-activity-zones` - New features
- `fix/activity-recording-crash` - Bug fixes
- `refactor/intensity-system` - Code refactoring
- `docs/update-architecture` - Documentation updates

### Commit Messages

Follow conventional commits:

```bash
# Features
git commit -m "feat: add 7-zone intensity classification"
git commit -m "feat(mobile): implement activity recording service"

# Fixes
git commit -m "fix: resolve TSS calculation edge case"
git commit -m "fix(web): correct training plan display"

# Refactoring
git commit -m "refactor: move intensity calculations to core package"

# Documentation
git commit -m "docs: update development guide"
```

### Pull Request Process

1. Create feature branch from `main`
2. Make changes and commit
3. Push branch and create PR
4. Ensure CI passes (linting, tests, type checking)
5. Request review
6. Address feedback
7. Merge to `main`

## Deployment

### Mobile Deployment

```bash
# Configure EAS (first time)
eas build:configure

# Production builds
eas build --platform all --profile production

# Submit to stores
eas submit --platform ios --profile production
eas submit --platform android --profile production

# Over-the-air updates (no store review)
eas update --branch production --message "Bug fixes"
```

### Web Deployment

```bash
# Automatic deployment via Vercel
git push origin main  # Deploys automatically

# Manual deployment
vercel --prod

# Preview deployment
vercel
```

### Database Migrations

```bash
# Create migration
cd packages/supabase
supabase migration new add_intensity_zones

# Test locally
supabase db reset

# Deploy to production
supabase db push
```

## Best Practices

1. **Use core package for all calculations** - Ensures consistency
2. **Validate with Zod schemas** - Type safety at runtime
3. **Leverage tRPC types** - Avoid manual type definitions
4. **Test pure functions** - Core package should be 100% tested
5. **Use React Query effectively** - Configure caching appropriately
6. **Follow styling conventions** - NativeWind for mobile, Tailwind for web
7. **Handle loading/error states** - Provide good UX
8. **Optimize database queries** - Use proper indexes
9. **Keep components small** - Extract sub-components when > 300 lines
10. **Document complex logic** - Especially in core package

## Resources

- [Expo Documentation](https://docs.expo.dev/)
- [Next.js Documentation](https://nextjs.org/docs)
- [tRPC Documentation](https://trpc.io/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [NativeWind Documentation](https://www.nativewind.dev/)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Zod Documentation](https://zod.dev/)

---

**Last Updated:** 2025-01-23
