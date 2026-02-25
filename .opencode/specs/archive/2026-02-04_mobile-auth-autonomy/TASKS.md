# Tasks: Mobile Authentication Autonomy

- **Status**: in_progress
- **Owner**: coordinator
- **Complexity**: high

## 1. Database Implementation

- [x] Update `packages/supabase/schemas/init.sql` with `get_user_status()` RPC function
- [x] Update `packages/supabase/schemas/init.sql` with `delete_own_account()` RPC function
- [x] Verify `ON DELETE CASCADE` for `profiles` table foreign keys in `init.sql`
- [x] Add comments/documentation to `init.sql`
- [x] Configure "Email Change" and "Password Changed" templates (Configured in `packages/supabase/config.toml` and templates created)
- [x] Enable "Secure Email Change" (Verified `double_confirm_changes = true` in `config.toml`)

## 2. Mobile Logic (Auth Context & Protection)

- [x] Update `apps/mobile/lib/providers/AuthProvider.tsx`:
  - [x] Add `userStatus` state ('verified' | 'unverified')
  - [x] Add `onboardingStatus` state (boolean)
  - [x] Implement `checkUserStatus()` using `get_user_status` RPC
  - [x] Implement `deleteAccount()` using `delete_own_account` RPC
  - [x] Implement `completeOnboarding()`
- [x] Create `VerificationGuard` in `apps/mobile/app/_layout.tsx`
- [x] Implement blocking logic for 'unverified' status
- [x] Implement redirection logic for 'onboarding' status
- [x] Create `handlePasswordResetSuccess` utility (Implemented in `reset-password.tsx`)

## 3. Mobile Screens & UI

- [x] Update `apps/mobile/app/(external)/reset-password.tsx`:
  - [x] Handle deep link parameters
  - [x] Implement password update form
  - [x] Implement success handling (sign out & redirect)
- [x] Update Profile/Settings Screen (`apps/mobile/app/(internal)/(standard)/settings.tsx`):
  - [x] Add "Delete Account" button with confirmation
  - [x] Add "Update Email" form
- [x] Create `apps/mobile/app/verification-pending.tsx`:
  - [x] Add message and actions (Resend, Cancel, Sign Out)
- [x] Create `apps/mobile/app/(onboarding)/_layout.tsx`
- [x] Create `apps/mobile/app/(onboarding)/index.tsx`:
  - [x] Implement welcome/survey UI
  - [x] Implement "Skip" and "Finish" actions calling `completeOnboarding()`

## 4. Configuration & Testing

- [x] Verify `scheme` in `apps/mobile/app.config.ts` is `gradientpeak`
- [ ] Test Account Creation (redirects to onboarding)
- [ ] Test Email Update (blocks access until verified)
- [ ] Test Password Reset (forces sign-in)
- [ ] Test Account Deletion (removes user and data)

## 5. Documentation

- [x] Update `README.md` with new auth flows and deep link info
