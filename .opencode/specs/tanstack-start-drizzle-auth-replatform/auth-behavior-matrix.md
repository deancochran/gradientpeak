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
| Bearer token lookup in API context | Supabase auth lookup in `packages/trpc/src/context.ts` | Better Auth-compatible session/token strategy | replace |
| Mobile auth bootstrap | Supabase-aligned mobile flow | Better Auth-compatible mobile flow | replace |
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
- exact Better Auth cookie/session model for web
- exact Better Auth mobile bootstrap/deep-link model for Expo
- exact account deletion behavior across auth + app data

## Completion Condition For This Artifact

- every current `trpc.auth` behavior has a final Better Auth-era owner, replacement, or retirement decision
- every caller group has a target dependency path
