# Decision Log

## Purpose

Record the key architecture choices that must be settled for the replatform.

## Open Decisions

| Decision | Options | Recommended direction | Status |
| --- | --- | --- | --- |
| Better Auth web session model | route/cookie model variants | choose one TanStack Start-native approach early | open |

## Locked Decisions

| Decision | Outcome |
| --- | --- |
| Web framework | TanStack Start |
| API framework | tRPC |
| DB ORM | Drizzle ORM |
| DB platform | Supabase Postgres |
| Auth framework | Better Auth |
| Shared domain package | keep `packages/core` |
| Shared UI package | keep `packages/ui` |
| Shared tooling | `tooling/typescript` and `tooling/tailwind` |
| Tailwind tooling scope | `tooling/tailwind` owns shared Tailwind presets plus theme tokens used by web and shared UI |
| Lint/format | Biome only |
| Package manifest philosophy | keep `package.json` files lean; prefer Turbo tasks and tool-native defaults over wrapper scripts except where explicit entrypoints are required |
| Exclusions | no ESLint package, no Prettier package, no long-term Next.js target |
| API package final name | steady-state `packages/api`, with temporary `@repo/trpc` bridge during migration |
| API package convergence | `packages/api` is the only long-term tRPC package home; `@repo/trpc` is compatibility-only and should be emptied then removed |
| Supabase package final home during migration | keep `packages/supabase` in place for now as infra-only |
| Drizzle migration strategy | create a fresh Drizzle baseline from the current schema; do not preserve legacy Supabase SQL as the executable migration chain |
| DB validation strategy | expose Drizzle-derived Zod schemas from `packages/db` |
| Better Auth auth scope | full replacement for first-party auth on web and mobile |
| First-party auth methods in scope | email/password first, with verification and password reset |
| Provider identity policy | keep Strava/Wahoo/Garmin/TrainingPeaks/Zwift as app integrations, not login identity providers |
| Account deletion policy | auth removal plus app-specific cleanup policy; no blind hard-delete |
| Migration priority | lowest-risk migration first, cleanup and package relocation later |
| Better Auth mobile auth model | use the Better Auth Expo integration with cookie/session caching in SecureStore, trusted app schemes for deep links, and manual `Cookie` header injection for authenticated API/tRPC calls; keep bearer transport only as a temporary bridge if needed |
| Initial mobile auth scaffold | mobile request auth now prefers a SecureStore-backed cookie header cache, auth-user refresh no longer requires a Supabase access token, and Supabase callback token parsing is isolated as a temporary bridge helper |
| Mobile verification UX | use Better Auth link-based verification on Expo, with app-side resend plus session refresh/polling instead of a Supabase OTP entry screen |
| Initial API migration boundary | create `packages/api` now for shared context and boundary ownership, keep `@repo/trpc` as the compatibility package while routers and clients migrate incrementally |
| Generated artifact policy | ignore generated test, report, cache, build, and machine-local runtime outputs repo-wide; only keep intentional source config and reviewable fixtures/manifests tracked |

## Completion Condition

- every open decision is either locked or explicitly deferred with a temporary bridge and retirement plan
