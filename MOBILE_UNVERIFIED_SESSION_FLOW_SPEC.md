# Mobile Unverified Session Flow

## Goal

Allow a user to remain authenticated on mobile even when their email is not yet verified.

This should make the mobile app behave like a staged auth system instead of treating
"unverified" as effectively signed out.

Desired outcome:

1. a user signs up once
2. the app keeps their session
3. if they close and reopen the app before verifying, they return to the verify flow
4. once verification completes, the app routes them into the normal signed-in experience

## Current Problem

Today the app derives routing too closely from whether the user can fully use the product.

That creates confusing behavior:

1. user signs up
2. user is redirected into verify flow
3. user closes app
4. app reopens and can land on sign-in again instead of verify
5. email verification deep link can reopen the app, but if the session is missing or not refreshed
   the user can still land on sign-in

This is a poor user experience and makes debugging auth state harder.

## Proposed State Model

Use three explicit mobile auth states:

1. `anonymous`
2. `authenticated-unverified`
3. `authenticated-verified`

Definitions:

1. `anonymous`
   no session or no authenticated user
2. `authenticated-unverified`
   session exists and `session.user.emailVerified === false`
3. `authenticated-verified`
   session exists and `session.user.emailVerified === true`

Important principle:

Email verification status is an authorization or routing gate, not a session gate.

## Source Of Truth

### Session persistence

Persistent session storage should remain owned by Better Auth + SecureStore.

Do not introduce a second persisted session source in Zustand.

### Runtime auth state

Zustand should remain the runtime mirror of the resolved auth session for UI and routing.

### Derived routing state

Expose one derived enum from the auth layer:

```ts
type AuthState = "anonymous" | "authenticated-unverified" | "authenticated-verified";
```

This should be the canonical value used by routing and gate components.

## Routing Rules

### Anonymous

Allowed routes:

1. sign-in
2. sign-up
3. forgot-password
4. reset-password
5. callback

Redirect target for protected areas:

1. sign-in

### Authenticated-unverified

Allowed routes:

1. verify
2. callback
3. sign-out or account-exit actions if exposed

Blocked routes:

1. internal app tabs
2. onboarding
3. profile-dependent screens

Redirect target for app entry:

1. verify

### Authenticated-verified

Allowed routes:

1. internal app routes
2. onboarding if required
3. callback

Redirect target for external auth screens:

1. home or onboarding depending on product logic

## Expected Mobile Flows

### Sign up

1. user signs up
2. app stores authenticated session if Better Auth provides one
3. app routes to verify screen
4. verify screen becomes the stable holding area until verification completes

### Reopen app before verification

1. app boots
2. auth store restores session from Better Auth storage
3. auth state resolves to `authenticated-unverified`
4. app routes to verify screen automatically

### Verify via email deep link

1. user taps verification email
2. web callback confirms email
3. web deep-link trampoline attempts to open mobile app
4. mobile callback screen refreshes auth session
5. auth state resolves to `authenticated-verified`
6. app routes to home or onboarding

### Verify via web fallback

1. user does not have mobile app available or deep link fails
2. web fallback completes verification on web
3. next time mobile refreshes session, user transitions to verified state

## Data Fetching Rules

For `authenticated-unverified` users:

1. do not fetch full profile-dependent product data
2. do not fetch `profiles.get` if the API expects verified users only
3. allow lightweight session refresh only

For `authenticated-verified` users:

1. enable normal profile and onboarding fetch behavior

## Implementation Plan

### 1. Centralize auth state derivation

Update the mobile auth layer to expose a canonical derived auth state instead of scattering:

1. `isAuthenticated`
2. `isEmailVerified`
3. `userStatus`

through multiple routing decisions.

### 2. Update bootstrap and root routing

Update the mobile root gate so it routes based on the derived auth state:

1. anonymous -> external sign-in flow
2. authenticated-unverified -> verify screen
3. authenticated-verified -> internal app

### 3. Update callback handling

Handle `email-verification` explicitly in the mobile callback screen:

1. refresh auth session
2. if session becomes verified -> route to internal app
3. if session still missing -> route to sign-in with a verified-success hint

### 4. Keep verify screen as a true holding route

The verify screen should:

1. remain accessible while authenticated-unverified
2. redirect to internal app once the session flips to verified
3. show accurate resend messaging

### 5. Keep session clearing behavior narrow

Do not clear session solely because the user is unverified.

Only clear session on:

1. explicit sign-out
2. invalid session
3. unrecoverable auth failure

## Suggested Code Targets

Primary files likely involved:

1. `apps/mobile/lib/stores/auth-store.ts`
2. `apps/mobile/lib/hooks/useAuth.ts`
3. `apps/mobile/app/_layout.tsx`
4. `apps/mobile/app/(external)/_layout.tsx`
5. `apps/mobile/app/(external)/verify.tsx`
6. `apps/mobile/app/(external)/callback.tsx`
7. any existing bootstrap gate components under `apps/mobile/components/auth/**`

## Logging Expectations

To improve debugging, logs should make the derived auth state visible.

Recommended additions:

1. mobile auth bootstrap log with `authState`
2. callback log with `intent`, `hadSession`, `verifiedAfterRefresh`
3. verify screen log when user is routed away because verification completed

## Acceptance Criteria

1. sign-up can result in an authenticated-unverified mobile state
2. closing and reopening the app before verification returns the user to verify screen
3. verification deep link routes user into the app without forcing a fresh manual sign-in when a
   session exists
4. verified users can proceed into home or onboarding normally
5. unverified users cannot enter the normal internal app
6. `profiles.get` is not queried for authenticated-unverified users
7. routing is driven by one canonical derived auth state

## Non-Goals

1. changing Better Auth server semantics unless necessary
2. introducing a second persisted session store
3. broad redesign of unrelated onboarding or profile flows

## Recommendation

Implement this as a routing and state-model enhancement, not as a workaround inside individual
screens.

The right long-term design is:

1. Better Auth and SecureStore persist the session
2. Zustand mirrors resolved auth state at runtime
3. one derived `AuthState` enum drives all mobile routing
