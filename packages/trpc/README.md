# @repo/trpc

A unified tRPC bridge package for the GradientPeak monorepo, providing shared type-safe API exports for the current web and mobile apps while `@repo/api` becomes the steady-state API home.

## Overview

This package re-exports and hosts the shared tRPC surface used by GradientPeak clients. Auth lifecycle operations no longer live under `trpc.auth`; first-party auth now flows through `@repo/auth` and `/api/auth`, while domain routers continue to use shared tRPC procedures.

## Architecture

### Core Components

- **Context** (`src/context.ts`): Re-exports the shared API context from `@repo/api/context`
- **Procedures**: Two types of procedures are available:
  - `publicProcedure`: For endpoints that don't require authentication
  - `protectedProcedure`: For authenticated endpoints (automatically validates user sessions)

### Available Routers

#### 👤 Profiles Router (`profiles`)

Manages user profile data:

- `get`: Fetch current user's profile
- `update`: Update profile information
- `list`: Search and list user profiles (paginated)

#### 🏃 Activities Router (`activities`)

Full CRUD operations for activity activities:

- `get`: Fetch single activity by ID
- `create`: Create new activities
- `update`: Update existing activities
- `delete`: Delete activities
- `list`: List activities with filters (date range, pagination)
- `sync`: Batch upload/sync activities from mobile devices

#### 📊 Activity Streams Router (`activityStreams`)

Manages time-series activity data:

- `getForActivity`: Fetch all stream data for an activity
- `batchCreate`: Insert multiple stream data points efficiently

#### 📅 Planned Activities Router (`plannedActivities`)

Manages future/scheduled activities:

- `get`: Fetch planned activity details
- `create`: Create new planned activities
- `update`: Update planned activities
- `delete`: Remove planned activities
- `list`: List planned activities with filters

#### 📁 Storage Router (`storage`)

Secure file upload/download operations:

- `createSignedUploadUrl`: Generate secure upload URLs for client-side uploads
- `getSignedUrl`: Generate signed URLs for file access
- `deleteFile`: Remove files from storage

## Usage Examples

### Public Procedure

```typescript
import { trpc } from './trpc-client';

// Validate an OAuth state during an integration callback
const storedState = await trpc.integrations.validateOAuthState.query({
  state: 'oauth-state-token'
});
```

### Protected Procedure (Authenticated Operations)

```typescript
// Get current user's profile (requires authentication)
const profile = await trpc.profiles.get.query();

// Create a new activity (requires authentication)
const activity = await trpc.activities.create.mutate({
  name: 'Morning Run',
  if: 0.85,
  moving_time: 3600,
  total_time: 3600,
  started_at: '2024-01-15T06:00:00Z',
  snapshot_ftp: 250,
  snapshot_threshold_hr: 170,
  snapshot_weight_kg: 70,
  tss: 65
});
```

## Security

### Authentication Middleware

The `protectedProcedure` middleware automatically:

1. Verifies that `ctx.session.user` exists after shared context resolution
2. Throws `UNAUTHORIZED` errors for invalid sessions
3. Adds the authenticated user to the procedure context

### File Access Control

The storage router implements strict security measures:

- File paths must belong to the authenticated user
- Signed URLs have short expiration times (60 seconds)
- All file operations require user authentication

## Data Validation

All router inputs are validated using Zod schemas from `@repo/core/schemas`. This ensures:

- Type safety across the entire application
- Consistent validation rules
- Runtime input validation
- Automatic TypeScript type inference

## Error Handling

The API uses standardized tRPC error codes:

- `UNAUTHORIZED`: Authentication required or failed
- `FORBIDDEN`: Access denied (e.g., file doesn't belong to user)
- `NOT_FOUND`: Resource doesn't exist
- `BAD_REQUEST`: Invalid input or operation failed
- `INTERNAL_SERVER_ERROR`: Unexpected server errors

## Integration

### Web App

```typescript
import { createTRPCClient } from '@trpc/client';
import { AppRouter } from '@repo/trpc';

const trpc = createTRPCClient<AppRouter>({
  // Web configuration
});
```

### Expo Mobile App

```typescript
import { createTRPCClient } from '@trpc/client';
import { AppRouter } from '@repo/trpc';

const trpc = createTRPCClient<AppRouter>({
  // Expo configuration
});
```

## Development

### Adding New Procedures

1. Create Zod validation schemas in `@repo/core/schemas`
2. Add procedures to the appropriate router file
3. Update the root router in `src/routers/index.ts`
4. Export new types if needed

### Testing

Run tests to validate the implementation:

```bash
npm test
```

## Dependencies

- `@trpc/server`: tRPC server implementation
- `@trpc/client`: tRPC client utilities
- `@repo/supabase`: Supabase database types and utilities
- `@repo/core`: Shared business logic and Zod schemas
- `zod`: Runtime type validation
