# GradientPeak Monorepo Structure Rules

## Package Dependencies
- Core package (@repo/core) MUST remain database-independent
- Never import database clients or ORMs in core package
- Mobile and web can depend on core, but not vice versa
- tRPC package can depend on core and supabase, but core cannot depend on tRPC

## Shared Logic Placement
- **Calculations** → `packages/core/calculations/`
- **Validation schemas** → `packages/core/schemas/`
- **Type definitions** → `packages/core/types/` or inline with schemas
- **API layer** → `packages/trpc/src/routers/`
- **Database types** → `packages/supabase/types/`
- **Database migrations** → `packages/supabase/migrations/`

## Import Rules
- Use workspace protocol: `@repo/core`, `@repo/trpc`, `@repo/supabase`
- Never use relative imports across packages (`../../../packages/...`)
- Mobile aliases: `@/` for app root
- Web aliases: `@/` for src root
- Core package: Use relative imports within the package

## Directory Structure Standards

### Mobile App (`apps/mobile/`)
```
app/                    # Expo Router screens
├── (internal)/        # Protected routes
│   ├── (tabs)/       # Tab navigation
│   └── (standard)/   # Stack navigation
├── (auth)/           # Auth-related screens
└── record/           # Recording flow

components/            # React Native components
├── ui/               # Reusable UI components (React Native Reusables)
├── shared/           # Cross-domain shared components
├── activity/         # Activity-specific components
├── recording/        # Recording-specific components
└── training-plan/    # Training plan components

lib/                  # Business logic and utilities
├── hooks/            # Custom React hooks
├── services/         # Service classes (ActivityRecorder, etc.)
├── stores/           # Zustand stores
└── utils/            # Utility functions
```

### Web Dashboard (`apps/web/`)
```
app/                   # Next.js App Router
├── (marketing)/      # Public pages
├── (dashboard)/      # Protected dashboard
└── api/              # API routes (webhooks, OAuth callbacks)

components/           # React components
├── ui/              # Shadcn/ui components
├── shared/          # Shared components
└── [domain]/        # Domain-specific components

lib/                 # Client-side logic
├── actions/         # Server actions
└── utils/           # Utility functions
```

### Core Package (`packages/core/`)
```
calculations/        # Pure calculation functions
schemas/            # Zod validation schemas
types/              # TypeScript type definitions
utils/              # Pure utility functions
estimation/         # Training metrics estimation
```

## File Naming Conventions
- **Components**: PascalCase (e.g., `ActivityCard.tsx`)
- **Hooks**: camelCase starting with `use` (e.g., `useActivityRecorder.ts`)
- **Utilities**: camelCase (e.g., `formatDuration.ts`)
- **Types**: PascalCase (e.g., `Activity.ts`) or inline with implementation
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `MAX_HEART_RATE.ts`)

## Code Organization Principles
1. **Colocation**: Keep related code together (components with their styles/tests)
2. **Single Responsibility**: One component/function per file (exceptions: small utilities)
3. **Explicit Exports**: Use named exports, avoid default exports except for pages/screens
4. **Type Safety**: Define types close to usage, share via core package when needed

## Turborepo Task Dependencies
- `build` depends on `@repo/core#build`, `@repo/trpc#build`
- `dev` depends on `@repo/core#build` (needs types)
- `lint` runs independently for each package
- `check-types` runs independently for each package

## Cross-Package Communication
- **Mobile → Core**: Import calculations, schemas, utilities
- **Web → Core**: Import calculations, schemas, utilities
- **Mobile → tRPC**: Import React Query hooks
- **Web → tRPC**: Import React Query hooks and server-side callers
- **tRPC → Core**: Import schemas for validation, calculations for processing
- **tRPC → Supabase**: Import client and types

## Adding New Packages
1. Create package directory in `packages/`
2. Add `package.json` with workspace name (`@repo/package-name`)
3. Add to root `package.json` workspaces
4. Add build configuration if needed
5. Add to `turbo.json` pipeline
6. Update dependent packages' `package.json`

## Monorepo Commands
- **Root commands**: Affect all packages (`pnpm dev`, `pnpm build`)
- **Filter commands**: Target specific packages (`pnpm --filter @repo/core build`)
- **Workspace commands**: Run from package directory (`cd apps/mobile && pnpm dev`)

## Critical Don'ts
- ❌ Don't import from build outputs (`dist/`, `.next/`)
- ❌ Don't create circular dependencies between packages
- ❌ Don't duplicate logic across packages (extract to core)
- ❌ Don't import database code into core package
- ❌ Don't use relative imports across package boundaries
