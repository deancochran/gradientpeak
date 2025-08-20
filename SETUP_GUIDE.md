# TurboFit Mobile App Setup Guide

Complete setup guide for authentication, database, and analytics in your fitness tracking mobile app.

## 📋 Table of Contents

1. [Database Setup](#database-setup)
2. [Clerk Authentication Setup](#clerk-authentication-setup)
3. [Supabase Configuration](#supabase-configuration)
4. [Mobile App Configuration](#mobile-app-configuration)
5. [Testing the Setup](#testing-the-setup)
6. [Analytics & Metrics](#analytics--metrics)
7. [Development Helpers](#development-helpers)
8. [Troubleshooting](#troubleshooting)

---

## 🗄️ Database Setup

### Step 1: Create Database Schema

1. Go to your **Supabase Dashboard** → **SQL Editor**
2. Create a new query and paste the **complete schema** from the conversation above
3. **Execute the query** to create all tables, indexes, and functions

The schema includes:
- ✅ Users table with analytics support
- ✅ Activities table with comprehensive metrics
- ✅ Activity segments for detailed analysis
- ✅ User metrics for dashboard performance
- ✅ Achievements and gamification
- ✅ Sync management tables
- ✅ Analytics cache tables
- ✅ All necessary indexes and triggers

### Step 2: Verify Database Creation

Run this verification query:

```sql
-- Verify all tables were created
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Verify indexes
SELECT COUNT(*) as total_indexes FROM pg_indexes WHERE schemaname = 'public';
```

Expected tables:
- `users`
- `activities` 
- `activity_segments`
- `user_metrics`
- `user_achievements`
- `activity_analytics`
- `activity_sync_log`
- `device_sync_state`

---

## 🔐 Clerk Authentication Setup

### Step 1: Configure JWT Template

1. Go to your [**Clerk Dashboard**](https://dashboard.clerk.com)
2. Navigate to **Configure** → **JWT Templates**
3. Click **New template**
4. **Name**: `supabase`
5. **Template content**:

```json
{
  "iss": "{{org.slug}}",
  "sub": "{{user.id}}",
  "aud": "authenticated",
  "exp": {{exp}},
  "iat": {{iat}},
  "email": "{{user.primary_email_address.email_address}}",
  "app_metadata": {
    "provider": "clerk",
    "providers": ["clerk"]
  },
  "user_metadata": {
    "full_name": "{{user.full_name}}",
    "avatar_url": "{{user.image_url}}"
  }
}
```

6. **Save** the template

### Step 2: Get Your Clerk Keys

1. In Clerk Dashboard → **API Keys**
2. Copy your **Publishable Key** (starts with `pk_test_` or `pk_live_`)
3. Add to your `.env` file:

```env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here
```

---

## 🏗️ Supabase Configuration

### Step 1: Get Supabase Credentials

1. Go to your **Supabase Dashboard** → **Settings** → **API**
2. Copy the following values:
   - **Project URL**
   - **Anon/Public Key**

### Step 2: Configure Environment Variables

Update your `.env` file in `apps/native/`:

```env
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_KEY=your_supabase_anon_key

# Clerk Configuration  
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

### Step 3: Setup File Storage (Optional)

The schema automatically creates a `fit-files` storage bucket. To enable file uploads:

1. Go to **Supabase Dashboard** → **Storage**
2. Verify the `fit-files` bucket exists
3. Check that RLS policies are applied

---

## 📱 Mobile App Configuration

### Step 1: Verify Dependencies

Make sure your `apps/native/package.json` includes:

```json
{
  "dependencies": {
    "@clerk/clerk-expo": "^2.14.21",
    "@supabase/supabase-js": "^2.55.0",
    "@react-native-async-storage/async-storage": "2.1.2",
    "expo-secure-store": "^14.2.3"
  }
}
```

### Step 2: Verify App Configuration

The following files should be properly configured:

#### `apps/native/app/_layout.tsx`
- ✅ Clerk provider with publishable key
- ✅ Token cache configuration

#### `apps/native/lib/supabase.ts`  
- ✅ Authenticated client creation
- ✅ API functions for database operations
- ✅ JWT token integration

#### `apps/native/app/(tabs)/index.tsx`
- ✅ Real Supabase integration (not mock data)
- ✅ Proper error handling
- ✅ Loading states

---

## 🧪 Testing the Setup

### Step 1: Test Authentication Flow

1. **Start the development server**:
   ```bash
   cd apps/native
   npx expo start
   ```

2. **Test sign up/sign in**:
   - Go to sign-up screen
   - Create a new account
   - Verify you're redirected to the main app

3. **Check database user creation**:
   ```sql
   -- In Supabase SQL Editor
   SELECT * FROM users ORDER BY created_at DESC LIMIT 5;
   ```

### Step 2: Test Activity Creation

Create a test activity to verify the full flow:

```sql
-- Test inserting an activity (replace with your user_id)
INSERT INTO activities (
  user_id, 
  client_id, 
  device_id,
  name, 
  sport, 
  distance_meters, 
  duration_seconds,
  started_at,
  ended_at,
  recorded_at
) VALUES (
  'your-user-uuid-here',
  gen_random_uuid()::TEXT,
  'test-device',
  'Test Morning Run',
  'running',
  5000,
  1800,
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '30 minutes', 
  NOW() - INTERVAL '30 minutes'
);
```

### Step 3: Verify Dashboard Data

Check that your dashboard loads activity data properly by refreshing the app.

---

## 📊 Analytics & Metrics

### Step 1: Generate Sample Data (Development)

For testing analytics, generate sample activities:

```sql
-- Replace with your actual user ID from the users table
SELECT generate_sample_activities('your-user-uuid-here', 25);
```

### Step 2: Calculate Initial Metrics

```sql  
-- Calculate metrics for your user
SELECT recalculate_user_metrics('your-user-uuid-here');
```

### Step 3: Test Analytics Views

```sql
-- Test dashboard view
SELECT * FROM user_dashboard_complete WHERE clerk_user_id = 'your-clerk-user-id';

-- Test activity feed
SELECT * FROM activity_feed_enhanced LIMIT 10;

-- Test power analysis (if you have cycling activities)
SELECT * FROM power_analysis LIMIT 10;
```

---

## 🛠️ Development Helpers

### Background Jobs Setup

For production, you'll want to set up background jobs for:

1. **Metrics Calculation** - Run hourly:
   ```sql
   SELECT update_user_metrics(user_id, 'daily', NULL) FROM users;
   ```

2. **Analytics Processing** - Run every 15 minutes:
   ```sql
   SELECT id FROM activities WHERE analytics_processed = FALSE AND status = 'completed' LIMIT 10;
   ```

3. **Achievement Checking** - Run after metrics updates:
   ```sql
   -- Custom logic to check and award achievements
   ```

### Development Utilities

**Reset user data**:
```sql
-- WARNING: This deletes all data for a user
DELETE FROM activities WHERE user_id = 'user-uuid-here';
DELETE FROM user_metrics WHERE user_id = 'user-uuid-here';  
DELETE FROM user_achievements WHERE user_id = 'user-uuid-here';
```

**Check sync status**:
```sql
SELECT 
  sync_status, 
  COUNT(*) 
FROM activities 
WHERE user_id = 'user-uuid-here' 
GROUP BY sync_status;
```

---

## 🐛 Troubleshooting

### Common Issues

#### ❌ "PGRST301: No suitable key or wrong key type"

**Cause**: JWT template not configured or RLS policies missing

**Solution**:
1. Verify Clerk JWT template is named `supabase`
2. Check RLS policies are created: `SELECT * FROM pg_policies WHERE schemaname = 'public';`
3. Ensure JWT template includes `"sub": "{{user.id}}"`

#### ❌ "Failed to load user data: Network request failed"

**Cause**: Environment variables not configured

**Solution**:
1. Check `.env` file exists in `apps/native/`
2. Verify all required environment variables are set
3. Restart Expo development server

#### ❌ Activities not syncing

**Cause**: Sync status or client configuration issues

**Solution**:
1. Check activity sync status: 
   ```sql
   SELECT sync_status, COUNT(*) FROM activities GROUP BY sync_status;
   ```
2. Verify device sync state:
   ```sql
   SELECT * FROM device_sync_state ORDER BY last_seen_at DESC;
   ```

#### ❌ Slow dashboard loading

**Cause**: Metrics not pre-calculated

**Solution**:
1. Run metrics calculation:
   ```sql
   SELECT recalculate_user_metrics('your-user-id');
   ```
2. Set up background job for regular metrics updates

### Performance Monitoring

**Check index usage**:
```sql
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats 
WHERE schemaname = 'public' 
ORDER BY tablename, attname;
```

**Monitor query performance**:
```sql
-- Enable in development only
SELECT pg_stat_statements_reset(); -- Reset query stats
-- Run your app for a while, then:
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY total_time DESC 
LIMIT 10;
```

---

## 🚀 Next Steps

### Production Considerations

1. **Environment Variables**: Set up production environment variables
2. **Background Jobs**: Implement metric calculation and sync jobs  
3. **Monitoring**: Set up error tracking and performance monitoring
4. **Analytics**: Implement advanced analytics processing
5. **Push Notifications**: Add notifications for achievements and sync status
6. **File Upload**: Implement FIT file upload to Supabase Storage

### Feature Enhancements

1. **Social Features**: Add friends, following, activity comments
2. **Advanced Analytics**: Power curves, training peaks, recovery metrics
3. **Route Matching**: GPS route matching and segment detection
4. **Training Plans**: Structured workout plans and coaching features
5. **Integrations**: Connect with other fitness platforms and devices

---

## 📄 Configuration Files Summary

### Required Files Modified:
- ✅ `apps/native/.env` - Environment variables
- ✅ `apps/native/app/_layout.tsx` - Clerk configuration  
- ✅ `apps/native/lib/supabase.ts` - Database client
- ✅ `apps/native/app/(tabs)/index.tsx` - Dashboard implementation

### Database Schema Applied:
- ✅ Complete table structure with RLS policies
- ✅ Analytics and metrics tables  
- ✅ Sync management system
- ✅ Achievement and gamification system

### Authentication Configured:
- ✅ Clerk JWT template for Supabase integration
- ✅ Row Level Security policies
- ✅ Token-based API authentication

---

**🎉 Your TurboFit app is now ready for local-first fitness tracking with cloud sync and comprehensive analytics!**

For questions or issues, refer to the troubleshooting section above or check the individual configuration files.