# Web Application Setup

## Environment Variables

Keep web env files under `apps/web/`.

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in your values:

```bash
cp apps/web/.env.example apps/web/.env.local
```

### Required Variables

1. **Supabase Configuration**
   - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Public anon key
   - `SUPABASE_SERVICE_ROLE_KEY` - Service role key for server-only usage

2. **OAuth Providers** (configure as needed)
   - Strava, Wahoo, TrainingPeaks, Garmin, Zwift credentials

3. **Callback URLs**
   - `OAUTH_CALLBACK_BASE_URL` - For development (e.g., ngrok URL)
   - `NEXT_PUBLIC_APP_URL` - Production domain

## Database Setup

Relational schema ownership lives in `packages/db`.

Key locations:

- Drizzle schema: `packages/db/src/schema/**`
- Baseline migration: `packages/db/drizzle/0000_baseline.sql`
- Local stack assets: `packages/db/supabase/**`

### Database workflow

1. Edit `packages/db/src/schema/**`
2. Generate a migration:

```bash
pnpm db:migration:new your_migration_name
```

3. Apply the migration:

```bash
pnpm db:migrate
```

4. Use the local stack when needed:

```bash
pnpm self-host:up
pnpm self-host:down
```

### Current Architecture: Service Role Key (No RLS)

This application uses a service role key for server-side database access.

- Row Level Security is not the primary application authorization boundary.
- Authorization is enforced in application code.
- Server-side queries explicitly scope data to the authenticated user where required.

Why this is acceptable in the current architecture:

- Service role key is **never exposed** to clients (server-side only)
- Authentication middleware validates requests
- Business logic enforces data isolation

RLS becomes more important if you introduce:

- Direct database access from clients (we don't do this)
- Multiple backend services accessing the same DB
- Third-party integrations with DB access
- Complex multi-tenant authorization

## Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build
```

## Important Notes

### Service Role Key Security

- Never commit `apps/web/.env.local`.
- Never use `SUPABASE_SERVICE_ROLE_KEY` in client-side code.
- Never prefix it with `NEXT_PUBLIC_`.

The service role key should **only** be used in:
- Server-side API routes (`app/api/**`)
- Server Components (when using RSC)
- Backend services (tRPC)

### Environment Variable Naming Convention

- `NEXT_PUBLIC_*` - Exposed to browser (safe for client-side)
- No prefix - Server-side only (never exposed to client)
