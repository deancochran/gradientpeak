# Implementation Plan: Mobile Authentication Autonomy

## 1. Database Implementation

- [ ] **Update Schema**: `packages/supabase/schemas/init.sql`
  - [ ] Append `get_user_status()` RPC function (Security Definer).
  - [ ] Append `delete_own_account()` RPC function (Security Definer).
  - [ ] **Verify Cascading Deletes**: Ensure all foreign keys referencing `auth.users` (profiles) use `ON DELETE CASCADE`.
    - [ ] **Ensure Profile Cascade**: Ensure all foreign keys referencing `profiles` table use `ON DELETE CASCADE`.
  - [ ] Add comments/documentation to the SQL file.
- [ ] **Configuration**:
  - [ ] **Email Templates**: Configure "Email Change" and "Password Changed" templates.
    - [ ] Reference `packages/supabase/templates` for template content.
    - [ ] Update Supabase Dashboard or Edge Functions as required.
  - [ ] **Security Settings**: Ensure "Secure Email Change" is enabled (requires confirmation on both old and new emails if supported, or at least new).
- [ ] **Note**: User will generate and apply migrations manually after this file is updated.

## 2. Mobile Logic (Auth Context & Protection)

- [ ] **Update `AuthProvider.tsx`**:
  - [ ] Add `userStatus` state ('verified' | 'unverified').
  - [ ] Add `onboardingStatus` state (boolean, from `profiles.onboarded`).
  - [ ] Implement `checkUserStatus()` function that calls `get_user_status` RPC.
  - [ ] Call `checkUserStatus()` on mount, after `updateUser` calls, and on app foregrounding.
  - [ ] Expose `deleteAccount()` method that calls `delete_own_account` RPC and then `signOut()`.
  - [ ] Expose `completeOnboarding()` method that updates `profiles.onboarded = true`.
- [ ] **Implement Layout Route Policy (Blocking)**:
  - [ ] Create a `VerificationGuard` component or hook in the Root Layout (`app/_layout.tsx`).
  - [ ] **Rule 1 (Verification)**: If `session` exists AND `userStatus === 'unverified'`:
    - [ ] Prevent navigation to `(tabs)` or `(authenticated)`.
    - [ ] Force redirect/render of a `verification-pending` screen.
  - [ ] **Rule 2 (Onboarding)**: If `session` exists AND `userStatus === 'verified'` AND `onboardingStatus === false`:
    - [ ] Prevent navigation to `(tabs)`.
    - [ ] Force redirect to `(onboarding)/index`.
- [ ] **Implement Force Sign-In Logic**:
  - [ ] Create a utility function `handlePasswordResetSuccess()`:
    - [ ] Call `signOut()`.
    - [ ] Redirect to Sign In.
    - [ ] Show "Password updated" toast.

## 3. Mobile Screens & UI

- [ ] **Reset Password Screen (`app/(auth)/reset-password.tsx`)**:
  - [ ] Handle deep link parameters (access token).
  - [ ] Create form for new password.
  - [ ] On submit: Call `updateUser`, then `handlePasswordResetSuccess`.
- [ ] **Profile/Settings Screen**:
  - [ ] Add "Delete Account" button (Red, with confirmation alert).
  - [ ] Add "Update Email" form.
- [ ] **Verification Pending Screen (`app/verification-pending.tsx`)**:
  - [ ] **Trigger**: Shown via Layout Policy when `userStatus === 'unverified'`.
  - [ ] **Content**:
    - [ ] Message: "Verify your new email address."
    - [ ] Action: "Resend Verification Email".
    - [ ] Action: "Cancel Change" (Revert to old email if possible, or just Sign Out).
    - [ ] Action: "Sign Out".
- [ ] **Onboarding Screens (`app/(onboarding)/`)**:
  - [ ] **Layout**: Create `app/(onboarding)/_layout.tsx` (stack).
  - [ ] **Index (`index.tsx`)**: Welcome / Initial Survey.
  - [ ] **Features**:
    - [ ] "Skip" button (visible on all screens).
    - [ ] "Next" / "Finish" buttons.
    - [ ] **Completion Logic**: Call `completeOnboarding()` -> redirects to `(tabs)/index`.
- [ ] **Deep Link Configuration**:
  - [ ] Verify `app.json` scheme is `gradientpeak`.
  - [ ] Test `gradientpeak://reset-password` opens the app correctly.

## 4. Testing & Verification

- [ ] **Test Account Creation**: Sign up a new user.
  - [ ] **Verify**: New user is redirected to `(onboarding)` initially.
  - [ ] **Verify**: Completing/Skipping onboarding redirects to `(tabs)`.
- [ ] **Test Email Update & Blocking**:
  - [ ] Change email in settings.
  - [ ] **Verify**: App immediately redirects to "Verification Pending" screen.
  - [ ] **Verify**: Cannot navigate to Home/Profile tabs (blocked by layout).
  - [ ] Click email link (simulated or real).
  - [ ] **Verify**: Status updates to 'verified' and access is restored.
- [ ] **Test Password Reset & Notification**:
  - [ ] Request reset.
  - [ ] Click link -> App opens.
  - [ ] Update password.
  - [ ] **Verify**: Immediate sign-out.
  - [ ] **Verify**: "Password Changed" email is received (if configured).
  - [ ] Sign in with new password.
- [ ] **Test Account Deletion**:
  - [ ] Delete account.
  - [ ] Verify user is signed out.
  - [ ] Verify user is removed from `auth.users`.

## 5. Documentation

- [ ] Update `README.md` with new auth flows and deep link info.
