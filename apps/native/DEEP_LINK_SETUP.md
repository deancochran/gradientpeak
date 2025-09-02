# Deep Link Setup Guide

This guide explains how to configure deep links for authentication in your Turbo Fit mobile app.

## Overview

Deep links allow users to complete authentication flows (email verification, password reset) directly in your mobile app instead of being redirected to a web browser.

## Current Implementation

✅ **Email verification links** - Users can verify their email directly in the app  
✅ **Password reset links** - Users can set new passwords directly in the app  
✅ **Dynamic URL schemes** - Different schemes for dev/preview/production  

## Required Supabase Configuration

### 1. Get Your App Schemes

Your app uses different URL schemes based on the environment:

- **Development**: `app-scheme-dev://`
- **Preview**: `app-scheme-prev://` 
- **Production**: `app-scheme://`

### 2. Configure Supabase Dashboard

Go to your Supabase project dashboard:

1. Navigate to **Authentication > URL Configuration**
2. Add these URLs to **Redirect URLs**:

```
app-scheme-dev://auth/callback
app-scheme-dev://auth/reset-password
app-scheme-prev://auth/callback
app-scheme-prev://auth/reset-password
app-scheme://auth/callback
app-scheme://auth/reset-password
```

### 3. Optional: Add Wildcard Patterns

For more flexibility, you can also add:

```
app-scheme-dev://**
app-scheme-prev://**
app-scheme://**
```

## Environment Setup

### 1. Create `.env.local` file

```bash
# Copy the example file
cp .env.example .env.local
```

### 2. Configure your environment variables

```bash
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=your-anon-key

# App Configuration
EXPO_PUBLIC_APP_URL=app-scheme-dev://
APP_ENV=development
```

## Testing Deep Links

### iOS Simulator

```bash
# Test email verification
xcrun simctl openurl booted "app-scheme-dev://auth/callback?access_token=test&refresh_token=test"

# Test password reset
xcrun simctl openurl booted "app-scheme-dev://auth/reset-password?access_token=test&refresh_token=test"
```

### Android Emulator

```bash
# Test email verification
adb shell am start -W -a android.intent.action.VIEW \
  -d "app-scheme-dev://auth/callback?access_token=test&refresh_token=test" \
  com.company.turbofit.dev

# Test password reset  
adb shell am start -W -a android.intent.action.VIEW \
  -d "app-scheme-dev://auth/reset-password?access_token=test&refresh_token=test" \
  com.company.turbofit.dev
```

### Using Expo CLI

```bash
# Test with npx uri-scheme
npx uri-scheme open "app-scheme-dev://auth/callback?access_token=test&refresh_token=test" --ios
npx uri-scheme open "app-scheme-dev://auth/reset-password?access_token=test&refresh_token=test" --ios
```

## How It Works

### Email Verification Flow

1. User signs up with email/password
2. Supabase sends verification email with link: `app-scheme-dev://auth/callback?access_token=...&refresh_token=...`
3. User taps link in email app
4. Mobile app opens and handles the callback
5. App extracts tokens and calls `supabase.auth.setSession()`
6. User is now verified and signed in

### Password Reset Flow

1. User requests password reset
2. Supabase sends reset email with link: `app-scheme-dev://auth/reset-password?access_token=...&refresh_token=...`  
3. User taps link in email app
4. Mobile app opens to password reset screen
5. App sets temporary session from tokens
6. User enters new password
7. App calls `supabase.auth.updateUser()` with new password
8. User is signed in with new password

## Route Handlers

The following routes handle deep link authentication:

- **`/auth/callback`** - Handles email verification links
- **`/auth/reset-password`** - Handles password reset links

## Debugging

### Enable Debug Logging

Deep link events are logged with prefixes:
- `🔗` - Deep link received
- `🔑` - Setting session from tokens  
- `✅` - Success operations
- `❌` - Errors
- `⚠️` - Warnings

### Common Issues

**Deep links not working:**
- Ensure URLs are added to Supabase dashboard
- Check that `APP_ENV` matches your build environment
- Verify app scheme in `app.config.ts`

**Session not setting:**
- Check that tokens are present in URL parameters
- Verify Supabase project URL and keys are correct
- Ensure network connectivity

**Redirect after auth:**
- Check that protected routes are configured correctly
- Verify `AuthContext` is receiving auth state changes

## Production Considerations

### Universal Links (Recommended)

For production apps, consider implementing Universal Links (iOS) and App Links (Android) instead of custom URL schemes:

**Benefits:**
- Work even if app isn't installed (fallback to web)
- More secure and seamless user experience
- No "Open in app?" dialog

**Setup required:**
- Host `apple-app-site-association` file on your web domain
- Configure associated domains in app config
- Use web URLs instead of custom schemes

### Security

- Deep link URLs contain sensitive tokens
- Tokens are automatically consumed and invalidated after use
- Consider implementing additional security measures for production

## Support

If you encounter issues:

1. Check the console logs for error messages
2. Verify all URLs are correctly configured in Supabase
3. Test with the provided commands above
4. Ensure environment variables are properly set