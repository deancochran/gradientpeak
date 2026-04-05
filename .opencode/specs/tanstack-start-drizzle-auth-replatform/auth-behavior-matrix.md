# Auth Behavior Matrix

## Purpose

Map current auth behavior to its Better Auth-era owner and migration outcome.

## Current To Future Behavior Map

| Current behavior | Current owner | Future owner | Outcome | Notes |
| --- | --- | --- | --- | --- |
| Get session | `trpc.auth.getSession` + Supabase session lookup | `packages/auth` session helpers + API context | move | tRPC should consume session, not define auth runtime |
| Get user | `trpc.auth.getUser` | `packages/auth` session helper or API-adjacent helper | move/reduce | keep only if still useful as API surface |
| Sign up | `trpc.auth.signUp` | Better Auth in `packages/auth` | move | web/mobile flows should use Better Auth-owned path |
| Sign in with password | `trpc.auth.signInWithPassword` | Better Auth in `packages/auth` | move | same |
| Sign out | `trpc.auth.signOut` | Better Auth in `packages/auth` | move | session invalidation should be auth-owned |
| Send password reset email | `trpc.auth.sendPasswordResetEmail` | Better Auth in `packages/auth` | move | callback/redirect rules must be redefined |
| Update password | `trpc.auth.updatePassword` | Better Auth in `packages/auth` | move | depends on final Better Auth flow design |
| Update email | `trpc.auth.updateEmail` | Better Auth in `packages/auth` | move | verify redirect/callback semantics |
| Resend verification email | `trpc.auth.resendVerificationEmail` | Better Auth in `packages/auth` | move | same |
| Verify OTP | `trpc.auth.verifyOtp` | Better Auth verification/callback route | move/replace | likely route-driven rather than tRPC-driven |
| Delete account | `trpc.auth.deleteAccount` | Better Auth + app DB policy | move/redefine | needs explicit product/data-deletion rules |

## Session And Runtime Map

| Current behavior | Current owner | Future owner | Outcome |
| --- | --- | --- | --- |
| Cookie-backed web session lookup | Supabase SSR helpers + tRPC context | Better Auth web session helpers | replace |
| Bearer token lookup in API context | Supabase auth lookup in `packages/trpc/src/context.ts` | Better Auth-compatible cookie/session lookup, with bearer support kept only as a temporary bridge if needed | replace |
| Mobile auth bootstrap | Supabase-aligned mobile flow | Better Auth Expo integration with SecureStore-backed session/cookie caching | replace |
| Auth redirect URL building | `packages/trpc/src/routers/auth.ts` helpers | `packages/auth` + web route integration | move |

## Caller Migration Groups

| Caller group | Current dependency | Future dependency |
| --- | --- | --- |
| Web auth pages/forms | `trpc.auth.*` | Better Auth routes/actions/helpers |
| Web auth provider/guards | `trpc.auth.getSession` | Better Auth session provider/helpers |
| API context | Supabase session lookup | Better Auth session lookup + `packages/db` |
| Mobile auth flows | Supabase-auth-oriented behavior | Better Auth-compatible behavior |

## Decisions Still Required

- whether any auth-adjacent reads remain exposed through tRPC after Better Auth is live
- exact Better Auth runtime/plugin wiring once the package moves beyond the contract slice

## Initial Package Boundary Landed

- `packages/auth` is now the home for normalized auth session contracts, callback/deep-link contracts, account deletion orchestration contracts, and auth runtime env parsing.
- Web should resolve first-party auth through cookie-based Better Auth sessions.
- Mobile should move to the Better Auth Expo integration with SecureStore-backed cookie/session caching and manual `Cookie` header injection for authenticated tRPC/fetch calls.
- Verification and password reset links should land on a web callback first, then redirect safely to either the web login path or an allowlisted mobile callback target.

## Locked Constraints

- Better Auth fully replaces Supabase Auth for first-party identity on web and mobile.
- First-party auth scope is email/password first, including verification and password reset.
- Provider integrations such as Strava, Wahoo, Garmin, TrainingPeaks, and Zwift remain separate app integrations and are not login identity providers.
- Account deletion removes auth identity and triggers app-specific cleanup; it is not a blind hard-delete policy.

## Locked Mobile Session Shape

- Use the Better Auth Expo integration and `expoClient` for the mobile auth client.
- Cache session cookies in Expo SecureStore and treat that as the primary mobile auth state source.
- Send authenticated API/tRPC requests with a manual `Cookie` header from the Better Auth client cookie cache, following the Better Auth Expo guidance for fetch and tRPC usage.
- Keep the Better Auth bearer plugin as an optional bridge only if a remaining caller truly cannot move off `Authorization` yet.
- Preserve environment-specific Expo schemes, but funnel verification and reset through a trusted callback first instead of parsing Supabase access/refresh tokens directly in-app.
- The first mobile sign-in, sign-up, callback, forgot-password, reset-password, and verification flows now call the Better Auth Expo client directly; remaining Supabase auth code is no longer the primary path.

## Current Mobile Scaffold Landed

- `apps/mobile/lib/auth/request-auth.ts` now prefers a SecureStore-backed cookie header cache for authenticated request headers and only falls back to the Supabase bearer token bridge when no cookie cache exists.
- `apps/mobile/lib/hooks/useAuth.ts` no longer gates auth user refreshes on a Supabase access token being present, which keeps the caller compatible with cookie-backed session transport.
- `apps/mobile/app/(external)/callback.tsx` and `apps/mobile/app/(external)/reset-password.tsx` now route Supabase deep-link token parsing through `apps/mobile/lib/auth/legacy-supabase-bridge.ts` so the old callback-token model is isolated as bridge behavior instead of remaining the default shape.
- `apps/mobile/app/(external)/sign-up.tsx` now uses `authClient.signUp.email(...)`, and `apps/mobile/app/(external)/verify.tsx` now treats email verification as a Better Auth link-first flow with session refresh plus resend-email behavior instead of Supabase OTP entry.
- `apps/mobile/app/(internal)/(standard)/user/[userId].tsx` now uses a mobile deep link callback for Better Auth email-change verification and no longer asks for a password in a stale Supabase-style client step.

## Completion Condition For This Artifact

- every current `trpc.auth` behavior has a final Better Auth-era owner, replacement, or retirement decision
- every caller group has a target dependency path
