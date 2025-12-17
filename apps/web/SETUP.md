# Web Application Setup

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

### Required Variables

1. **Supabase Configuration**
   - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Public anon key
   - `SUPABASE_SERVICE_ROLE_KEY` - **Critical:** Service role key (never expose to client!)

2. **OAuth Providers** (configure as needed)
   - Strava, Wahoo, TrainingPeaks, Garmin, Zwift credentials

3. **Callback URLs**
   - `OAUTH_CALLBACK_BASE_URL` - For development (e.g., ngrok URL)
   - `NEXT_PUBLIC_APP_URL` - Production domain

## Database Setup

### Single Source of Truth: `packages/supabase/schemas/init.sql`

All database schema changes should be made in the `init.sql` file. This ensures consistency and makes it easy to recreate the database from scratch.

### Making Database Changes

1. **Edit `packages/supabase/schemas/init.sql`**
   - Add/modify tables, columns, indexes, etc.
   - Update RLS policies if needed

2. **Generate Migration**
   ```bash
   cd packages/supabase
   npx supabase db diff --schema public --file your_migration_name
   ```

3. **Apply to Remote Database**
   ```bash
   # Option 1: Push migration files
   npx supabase db push
   
   # Option 2: Run SQL directly in Supabase Dashboard
   # Copy the migration SQL and run it in SQL Editor
   ```

### Current Architecture: Service Role Key (No RLS)

This application uses **Service Role Key** for database access, which means:

- ✅ **Row Level Security (RLS) is DISABLED** on all tables
- ✅ Authorization is handled at the **application layer** via tRPC `protectedProcedure`
- ✅ All queries explicitly filter by `profile_id = ctx.session.user.id`
- ✅ Simpler development and debugging
- ✅ Faster queries (no RLS policy checks)

**Why this is secure:**
- Service role key is **never exposed** to clients (server-side only)
- Authentication middleware validates **every request**
- Business logic enforces **data isolation**

**When you'd need RLS:**
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

⚠️ **NEVER** commit `.env.local` to git
⚠️ **NEVER** use `SUPABASE_SERVICE_ROLE_KEY` in client-side code
⚠️ **NEVER** prefix it with `NEXT_PUBLIC_` (that exposes it to the browser)

The service role key should **only** be used in:
- Server-side API routes (`app/api/**`)
- Server Components (when using RSC)
- Backend services (tRPC)

### Environment Variable Naming Convention

- `NEXT_PUBLIC_*` - Exposed to browser (safe for client-side)
- No prefix - Server-side only (never exposed to client)
