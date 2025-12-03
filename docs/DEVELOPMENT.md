# Development Guide

## Quick Start

```bash
# Install dependencies
npm install

# Start all dev servers
npm dev

# Start specific apps
cd apps/mobile && npm dev
cd apps/web && npm dev:next
```

## Environment Setup

### Prerequisites
- Node.js 18+
- pnpm 8+
- Expo CLI: `npm add -g expo-cli`
- Docker (for local Supabase)
- iOS: Xcode 15+ & CocoaPods (Mac only)
- Android: Android Studio with SDK 34+

### Environment Variables

**Mobile** (`apps/mobile/.env`):
```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**Web** (`apps/web/.env.local`):
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Development Workflow

### Common Commands

```bash
# Root level
npm dev                 # Start all services
npm build              # Build all packages
npm lint               # Lint entire codebase
npm test               # Run all tests
npm check-types        # Type check all packages

# Mobile
cd apps/mobile
npm dev                # Start Expo (clears cache)
npm android            # Run on Android
npm ios                # Run on iOS

# Web
cd apps/web
npm dev:next           # Next.js dev server
npm build              # Production build

# Database
cd packages/supabase
npm run update-types   # Regenerate types from schema
supabase db reset      # Reset to latest migration
supabase migration new <name>
```

## Code Organization

### File Naming
- **Components**: PascalCase (`ActivityCard.tsx`)
- **Utilities**: camelCase (`calculateTSS.ts`)
- **Hooks**: camelCase with `use` prefix (`useActivity.ts`)
- **Types**: PascalCase (`Activity.ts`)
- **Constants**: SCREAMING_SNAKE_CASE (`ACTIVITY_TYPES.ts`)

### Import Order
```typescript
// 1. External dependencies
import { useState } from 'react';
import { View } from 'react-native';

// 2. Internal packages
import { calculateTSS } from '@repo/core';
import { trpc } from '@repo/trpc';

// 3. Relative imports (utils, hooks)
import { useAuth } from '@/lib/hooks';

// 4. Relative imports (components)
import { Button } from '@/components/ui/button';

// 5. Types
import type { Activity } from '@/types';
```

### Component Structure
```typescript
// 1. Imports
import { useState } from 'react';
import { View, Text } from 'react-native';

// 2. Types
interface Props {
  activityId: string;
}

// 3. Component
export function ActivityDetail({ activityId }: Props) {
  // 3a. Hooks
  const { data, isLoading } = trpc.activities.getById.useQuery({ id: activityId });
  
  // 3b. Derived state
  const hasData = !!data;
  
  // 3c. Handlers
  const handleExpand = () => { ... };
  
  // 3d. Early returns
  if (isLoading) return <LoadingSpinner />;
  if (!hasData) return <EmptyState />;
  
  // 3e. Render
  return <View>...</View>;
}
```

## Styling Guidelines

### Mobile (NativeWind)
```typescript
// ✅ Use NativeWind v4
<View className="flex-1 bg-background p-4">
  <Text className="text-2xl font-bold text-foreground">Title</Text>
</View>

// ❌ Don't use StyleSheet
const styles = StyleSheet.create({ ... });
```

### Web (Tailwind CSS)
```typescript
// ✅ Use Tailwind v4 + Shadcn/ui
<div className="flex flex-col gap-4 p-4">
  <h1 className="text-2xl font-bold">Title</h1>
</div>
```

## Type Safety

### Use Core Package Types
```typescript
import type { ActivityPayload, ActivityPlanStructure } from '@repo/core';
```

### Use Generated Database Types
```typescript
import type { Database } from '@repo/supabase';
type Activity = Database['public']['Tables']['activities']['Row'];
```

### Avoid `any` Types
```typescript
// ❌ Bad
const handleActivity = (activity: any) => { ... };

// ✅ Good
import type { Activity } from '@repo/supabase';
const handleActivity = (activity: Activity) => { ... };
```

## Testing

### Core Package Tests
```bash
cd packages/core
npm test --watch
```

**Example**:
```typescript
import { describe, it, expect } from 'npm:test';
import { calculateTSS } from './calculations';

describe('calculateTSS', () => {
  it('calculates TSS correctly', () => {
    const result = calculateTSS(3600, 0.85);
    expect(result).toBeCloseTo(85, 0);
  });
});
```

### Manual Testing (Required)
- Test on physical iOS and Android devices
- Verify haptic feedback (simulators don't support)
- Check GPS tracking accuracy
- Validate offline sync behavior

**Note**: Unit testing is not required for mobile/web apps.

## Debugging

### Mobile
```bash
# React DevTools
npm i -g react-devtools
react-devtools

# Console logs
console.log('[Feature]', 'Message', { data });
```

### Web
- Next.js DevTools (automatic in dev)
- React Query DevTools (enabled in layout)

### tRPC
```typescript
import { loggerLink } from '@trpc/client';

// Enable verbose logging
const client = trpc.createClient({
  links: [
    loggerLink({
      enabled: () => true,
    }),
  ],
});
```

## Common Issues

### Module not found after adding dependency
```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
npm install
npm dev
```

### Mobile not reflecting code changes
```bash
cd apps/mobile
npm dev  # Clears cache automatically
```

### Type errors after schema changes
```bash
cd packages/supabase
npm run update-types

cd packages/core
npm build

npm dev  # Restart all apps
```

## Git Workflow

### Branch Naming
- `feature/add-activity-zones`
- `fix/recording-crash`
- `refactor/intensity-system`
- `docs/update-architecture`

### Commit Messages (Conventional Commits)
```bash
feat: add 7-zone intensity classification
feat(mobile): implement activity recording service
fix: resolve TSS calculation edge case
fix(web): correct training plan display
refactor: move intensity calculations to core
docs: update development guide
```

### Pull Request Process
1. Create feature branch from `main`
2. Make changes and commit
3. Push and create PR
4. Ensure CI passes (linting, types)
5. Request review
6. Merge to `main`

## Deployment

### Mobile (EAS)
```bash
eas build:configure  # First time only
eas build --platform all --profile production
eas submit --platform ios --profile production
eas update --branch production  # OTA updates (no review)
```

### Web (Vercel)
```bash
git push origin main  # Automatic deployment
```

### Database
```bash
cd packages/supabase
supabase db push  # Deploy migrations
```

## Best Practices

1. **Use core package for calculations** - Ensures consistency
2. **Validate with Zod schemas** - Type safety at runtime
3. **Leverage tRPC types** - Avoid manual type definitions
4. **Keep components small** - Extract when > 300 lines
5. **Use React Query caching** - Configure staleTime appropriately
6. **Handle loading/error states** - Provide good UX
7. **Optimize queries** - Use proper database indexes
8. **Document complex logic** - Especially in core package
9. **Test on physical devices** - Simulators miss key features
10. **Follow styling conventions** - NativeWind for mobile, Tailwind for web

## Performance Tips

### Memoization
```typescript
// ✅ Calculate once, cache result
const avgPower = useMemo(() => {
  return powerValues.reduce((sum, p) => sum + p, 0) / powerValues.length;
}, [powerValues]);
```

### React Query
```typescript
// Aggressive caching for static data
trpc.activityPlans.list.useQuery(undefined, {
  staleTime: 1000 * 60 * 5,  // 5 minutes
  cacheTime: 1000 * 60 * 30, // 30 minutes
});
```

### Mobile Lists
```typescript
<FlatList
  data={activities}
  renderItem={({ item }) => <ActivityCard activity={item} />}
  keyExtractor={(item) => item.id}
  removeClippedSubviews
  maxToRenderPerBatch={10}
  windowSize={5}
/>
```

## Resources

- [Expo Documentation](https://docs.expo.dev/)
- [Next.js Documentation](https://nextjs.org/docs)
- [tRPC Documentation](https://trpc.io/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [NativeWind Documentation](https://www.nativewind.dev/)
