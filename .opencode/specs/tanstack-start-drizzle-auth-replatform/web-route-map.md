# Web Route And Surface Map

## Purpose

Map the current Next.js web surfaces to their TanStack Start-era target ownership.

## App Shell

| Current surface | Current path | Target surface | Action |
| --- | --- | --- | --- |
| Root layout | `apps/web/src/app/layout.tsx` | TanStack Start root/app shell | migrate |
| Internal layout | `apps/web/src/app/(internal)/layout.tsx` | authenticated route layout/provider layer | migrate |
| External layout | `apps/web/src/app/(external)/layout.tsx` | public/auth route layout/provider layer | migrate |
| Middleware | `apps/web/src/middleware.ts` | TanStack Start request/auth handling | replace |

## Core Pages

| Current surface | Current path | Target category | Action |
| --- | --- | --- | --- |
| Home/protected landing | `apps/web/src/app/(internal)/page.tsx` | authenticated route | migrate |
| Messages | `apps/web/src/app/(internal)/messages/page.tsx` | authenticated route | migrate |
| Notifications | `apps/web/src/app/(internal)/notifications/page.tsx` | authenticated route | migrate |
| Settings | `apps/web/src/app/(internal)/settings/page.tsx` | authenticated route | migrate |
| Coaching | `apps/web/src/app/(internal)/coaching/page.tsx` | authenticated route | migrate |
| User profile | `apps/web/src/app/(internal)/user/[userId]/page.tsx` | authenticated route | migrate |
| User followers | `apps/web/src/app/(internal)/user/[userId]/followers/page.tsx` | authenticated route | migrate |
| User following | `apps/web/src/app/(internal)/user/[userId]/following/page.tsx` | authenticated route | migrate |
| UI preview | `apps/web/src/app/dev/ui-preview/page.tsx` | dev-only route | migrate or isolate |

## Auth Pages

| Current surface | Current path | Target category | Action |
| --- | --- | --- | --- |
| Login | `apps/web/src/app/(external)/auth/login/page.tsx` | public auth route | migrate |
| Sign up | `apps/web/src/app/(external)/auth/sign-up/page.tsx` | public auth route | migrate |
| Forgot password | `apps/web/src/app/(external)/auth/forgot-password/page.tsx` | public auth route | migrate |
| Update password | `apps/web/src/app/(external)/auth/update-password/page.tsx` | public auth route | migrate |
| Sign-up success | `apps/web/src/app/(external)/auth/sign-up-success/page.tsx` | public auth route | migrate |
| Auth open target | `apps/web/src/app/(external)/auth/open/page.tsx` | public auth/deep-link helper | migrate |
| Auth error | `apps/web/src/app/(external)/auth/error/page.tsx` | public auth route | migrate |
| Auth confirm callback | `apps/web/src/app/(external)/auth/confirm/route.ts` | Better Auth-compatible callback/verification route | replace |

## API Surfaces

| Current surface | Current path | Target category | Action |
| --- | --- | --- | --- |
| tRPC handler | `apps/web/src/app/api/trpc/[trpc]/route.ts` | TanStack Start `/api/trpc` endpoint | replace |
| Health check | `apps/web/src/app/api/health/route.ts` | TanStack Start server route | migrate |
| Provider callback | `apps/web/src/app/api/integrations/callback/[provider]/route.ts` | TanStack Start server route | migrate |
| Wahoo webhook | `apps/web/src/app/api/webhooks/wahoo/route.ts` | TanStack Start server route | migrate |
| Better Auth endpoint | none today | TanStack Start `/api/auth` endpoint | add |

## Provider And Auth Surfaces

| Current surface | Current path | Target category | Action |
| --- | --- | --- | --- |
| Auth provider | `apps/web/src/components/providers/auth-provider.tsx` | Better Auth-backed app auth provider | rewrite |
| Auth guard | `apps/web/src/components/auth-guard.tsx` | TanStack Start route/auth guard pattern | replace or shrink |
| User nav auth usage | `apps/web/src/components/user-nav.tsx` | Better Auth session consumer | adapt |
| Nav bar auth usage | `apps/web/src/components/nav-bar.tsx` | Better Auth session consumer | adapt |
| Login form auth usage | `apps/web/src/components/login-form.tsx` | Better Auth form/action consumer | adapt |

## Supabase-Specific Web Helpers To Remove From Final Path

| Current helper | Current path | Target outcome |
| --- | --- | --- |
| Browser Supabase client | `apps/web/src/lib/supabase/client.ts` | retire from primary web auth flow |
| Server Supabase SSR client | `apps/web/src/lib/supabase/server.ts` | retire from primary web auth flow |
| Supabase middleware helper | `apps/web/src/lib/supabase/middlewear.ts` | retire or reduce to infra-only behavior |

## Completion Condition For This Artifact

- every current Next.js route or web surface has a TanStack Start-era target owner
- every auth-related web surface has a Better Auth-era replacement or retirement decision
- every current web API route has a target server-route owner
