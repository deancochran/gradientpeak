# Protected Routes in TurboFit

This document outlines the implementation of protected routes in the TurboFit app using Expo Router's built-in protection mechanism.

## Overview

We've migrated from a custom `ProtectedRoute` component to Expo Router's built-in protected routes feature. This provides better integration with the router and more reliable authentication protection.

## Key Components

### 1. Authentication Context

The `AuthContext` provides authentication state management with the following features:

- Session tracking
- Loading states
- Session validation
- Authentication status

The `isAuthenticated` flag is computed based on:
- Having a valid session
- Having a user object
- Email confirmation status (when required)

### 2. Protected Routes Hook

The `useProtectedAuth` hook simplifies authentication checks in components:

```typescript
const { 
  isAuthenticated,  // Is the user logged in
  isVerified,       // Is the user's email verified
  canAccessProtectedRoutes, // Can access protected areas
  authState,        // Full auth state object for debugging
  validateSession,  // Function to validate session
} = useProtectedAuth();
```

### 3. Layout Structure

The app uses two primary layout structures:

- `(external)/_layout.tsx`: Auth flows (login, signup, verification)
- `(internal)/_layout.tsx`: Protected app content

### 4. Route Protection

Routes are protected using Expo Router's `Protected` component:

```typescript
// For Tab navigation
<Tabs>
  <Tabs.Protected guard={isAuthenticated} redirect="/(external)/welcome">
    <Tabs.Screen name="index" />
    <Tabs.Screen name="settings" />
  </Tabs.Protected>
</Tabs>

// For Stack navigation
<Stack>
  <Stack.Protected guard={isAuthenticated}>
    <Stack.Screen name="profile" />
  </Stack.Protected>
</Stack>
```

## Authentication Flow

1. User loads the app -> Root layout checks auth state
2. If authenticated and verified -> Redirected to internal routes
3. If not authenticated -> Redirected to external routes
4. If authenticated but not verified -> Redirected to verification

## Background Session Changes

When auth state changes in the background:

1. `AuthContext` listens for Supabase auth state changes
2. Updates the session and authentication flags
3. Expo Router's protected routes automatically redirect based on new auth state

## Debugging

Auth state changes are logged with the following prefixes:

- `🔧 AuthProvider`: Auth provider setup and changes
- `🛡️ Internal layout`: Protected layout auth checks
- `🔍 useProtectedAuth`: Auth hook state updates
- `📊 Loading user data`: Data loading with auth state

## Best Practices

1. Use `useProtectedAuth()` hook for auth checks
2. Rely on Expo Router's `Protected` component for route protection
3. Avoid manual redirects except for explicit user actions
4. Use the `initialSegment` prop to set the initial route