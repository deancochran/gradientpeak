# Mobile Authentication Autonomy & MVP Architecture

## 1. Overview

This specification outlines the design for a fully autonomous mobile authentication system for the GradientPeak application. The goal is to enable users to manage their accounts (create, delete, recover, update) entirely from the mobile app without reliance on the web interface.

**Key Constraints:**

- **Bare MVP Minimum:** Avoid overengineering.
- **Minimal Database Footprint:** No new tables; rely on dynamic computation and Supabase Auth metadata.
- **Security First:** Enforce re-authentication on sensitive changes.

## 2. Core Architecture

### 2.1 Authentication Provider

- **Service:** Supabase Auth (GoTrue).
- **Method:** Email/Password.
- **Session Management:** handled by `@supabase/supabase-js` with `AsyncStorage` persistence.

### 2.2 Database Strategy (No New Tables)

Instead of creating a `profiles` table with `is_verified` or `status` columns, we will derive user state dynamically from the `auth.users` table using Postgres Security Definer functions.

#### Computed User Status

A Postgres RPC function `get_user_status` will be used to determine if a user is "verified" or "unverified" (e.g., pending email change).

```sql
-- migration: create_get_user_status_function
create or replace function public.get_user_status()
returns text
security definer
language plpgsql
as $$
begin
  -- Check if there is a pending email change
  if exists (
    select 1
    from auth.users
    where id = auth.uid()
    and email_change is not null
  ) then
    return 'unverified';
  else
    return 'verified';
  end if;
end;
$$;
```

#### Account Deletion

Since client-side deletion of `auth.users` is restricted, we will use a secure RPC function. This function must ensure all related user data is removed to comply with data privacy requirements.

```sql
-- migration: create_delete_own_account_function
create or replace function public.delete_own_account()
returns void
security definer
language plpgsql
as $$
begin
  -- Delete the user from auth.users
  -- Postgres ON DELETE CASCADE constraints on related tables (profiles, activities, etc.)
  -- will automatically remove all associated user data.
  delete from auth.users where id = auth.uid();
end;
$$;
```

**Data Cascading Strategy:**
All tables referencing `auth.users` (e.g., `public.profiles`, `public.activities`) MUST have foreign keys defined with `ON DELETE CASCADE`. This ensures that when the user record is deleted from `auth.users`, all downstream data is automatically cleaned up by the database engine without requiring manual deletion logic.

## 3. Authentication Flows

### 3.1 Account Creation & Deletion

- **Creation:** Standard `supabase.auth.signUp()`.
- **Deletion:** User triggers "Delete Account" -> App calls `rpc('delete_own_account')` -> User is signed out and data is removed (cascading deletes recommended for user data).

### 3.2 Password Reset (Force Sign-In)

To ensure security, resetting a password must invalidate the current session and force a fresh login.

1.  **Request:** User enters email -> `supabase.auth.resetPasswordForEmail(email, { redirectTo: 'gradientpeak://reset-password' })`.
2.  **Deep Link:** User clicks email link -> App opens via `gradientpeak://reset-password`.
3.  **Session:** Supabase client detects recovery token and establishes a temporary session.
4.  **Update:** User submits new password -> `supabase.auth.updateUser({ password: newPassword })`.
5.  **Enforcement:** On success, App **immediately** calls `supabase.auth.signOut()`.
6.  **UX:** Redirect to Sign In screen with toast: "Password updated. Please sign in with your new credentials."

### 3.3 Email Update (Unverify Trigger)

Updating an email address should treat the user as unverified until they confirm the new address.

1.  **Request:** User updates email -> `supabase.auth.updateUser({ email: newEmail })`.
2.  **State Change:** Supabase sets `email_change` column in `auth.users`.
3.  **Notifications:**
    - Supabase sends a "Confirm Email Change" link to the **new** email.
    - Supabase sends a "Email Change Requested" notification to the **old** email (security alert).
    - _Configuration_: Email templates are managed in `packages/supabase/templates` (if using custom SMTP/trigger) or Supabase Dashboard.
4.  **Detection:** App calls `rpc('get_user_status')` or checks session user metadata.
5.  **Access Control (Blocking Policy):**
    - If status is 'unverified' (pending email change), the **Root Layout** intercepts navigation.
    - The user is **blocked** from accessing the internal application (tabs, recording, history).
    - A specific "Verification Required" screen is shown, allowing only:
      - Resending the verification email.
      - Canceling the change (reverting to old email).
      - Signing out.
6.  **Completion:** User clicks link in new email -> `email_change` is cleared -> Status reverts to 'verified' -> App restores full access.

### 3.4 Onboarding Flow (Post-Verification)

To ensure users complete the setup process, an onboarding check is enforced **after** verification but **before** app access.

1.  **Check:** After passing the `VerificationGuard` (user is 'verified'), the app checks the `onboarded` boolean in the `public.profiles` table.
2.  **Routing:**
    - If `onboarded === false`: Redirect to `(onboarding)/index`.
    - If `onboarded === true`: Redirect to `(tabs)/index`.
3.  **Onboarding Experience:**
    - A series of skippable survey screens (goals, biometrics, etc.).
    - **Completion/Skip:** Both actions trigger an update to set `onboarded = true` in the profile.
    - **Transition:** Upon setting the flag, the user is automatically routed to the main app.
4.  **State Management:** The `AuthProvider` or a dedicated `OnboardingGuard` should manage this state check to prevent manual navigation to tabs until onboarded.

### 3.5 Password Change Notifications

To enhance security, password changes must trigger notifications:

1.  **Event:** User successfully updates password (via reset or profile settings).
2.  **Notification:** System sends a "Your password has been changed" email to the user's registered email address.
    - _Implementation:_ Configured via Supabase Auth email templates or Database Trigger calling an Edge Function (if built-in template is unavailable).

## 4. Mobile Integration

### 4.1 Deep Linking

- **Scheme:** `gradientpeak://`
- **Configuration:**
  - Supabase Console: Add `gradientpeak://*` to Redirect URLs.
  - Expo Config (`app.json`): Ensure `scheme` is set.
- **Handling:** Use `expo-linking` to capture URLs. The Supabase client automatically parses hash fragments (`#access_token=...`) for session recovery.

### 4.2 Time-Sensitive Security

- **Link Expiry:** Configured in Supabase Dashboard (default 1 hour, recommend tightening to 10-15 mins for recovery links).
- **Token Handling:** Mobile app must handle expired links gracefully (show "Link Expired" screen).

## 5. Implementation Plan (Summary)

1.  **Database:** Update `packages/supabase/schemas/init.sql` with `get_user_status` and `delete_own_account` functions. (User will generate migrations).
2.  **Mobile Logic:** Implement `useAuth` hook extensions for status checking.
3.  **Screens:** Update `ResetPassword` and `Profile` screens to handle the new flows.
4.  **Config:** Verify Deep Link setup in Supabase and Expo.
