# Clerk + Supabase Authentication Setup

## 1. Configure Clerk JWT Template

1. Go to your [Clerk Dashboard](https://dashboard.clerk.com)
2. Navigate to **JWT Templates**
3. Create a new template named `supabase`
4. Set the template content to:

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

## 2. Configure Supabase RLS Policies

### Enable RLS on all tables

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
```

### Users Table Policies

```sql
-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT USING (auth.jwt()->>'sub' = clerk_user_id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (auth.jwt()->>'sub' = clerk_user_id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.jwt()->>'sub' = clerk_user_id);
```

### Activities Table Policies

```sql
-- Users can read their own activities
CREATE POLICY "Users can read own activities" ON activities
  FOR SELECT USING (
    auth.jwt()->>'sub' = (
      SELECT clerk_user_id FROM users WHERE id = activities.user_id
    )
  );

-- Users can insert their own activities
CREATE POLICY "Users can insert own activities" ON activities
  FOR INSERT WITH CHECK (
    auth.jwt()->>'sub' = (
      SELECT clerk_user_id FROM users WHERE id = activities.user_id
    )
  );

-- Users can update their own activities
CREATE POLICY "Users can update own activities" ON activities
  FOR UPDATE USING (
    auth.jwt()->>'sub' = (
      SELECT clerk_user_id FROM users WHERE id = activities.user_id
    )
  );

-- Users can delete their own activities
CREATE POLICY "Users can delete own activities" ON activities
  FOR DELETE USING (
    auth.jwt()->>'sub' = (
      SELECT clerk_user_id FROM users WHERE id = activities.user_id
    )
  );
```

### User Settings Table Policies

```sql
-- Users can read their own settings
CREATE POLICY "Users can read own settings" ON user_settings
  FOR SELECT USING (
    auth.jwt()->>'sub' = (
      SELECT clerk_user_id FROM users WHERE id = user_settings.user_id
    )
  );

-- Users can insert their own settings
CREATE POLICY "Users can insert own settings" ON user_settings
  FOR INSERT WITH CHECK (
    auth.jwt()->>'sub' = (
      SELECT clerk_user_id FROM users WHERE id = user_settings.user_id
    )
  );

-- Users can update their own settings
CREATE POLICY "Users can update own settings" ON user_settings
  FOR UPDATE USING (
    auth.jwt()->>'sub' = (
      SELECT clerk_user_id FROM users WHERE id = user_settings.user_id
    )
  );
```

## 3. Test the Setup

After configuring the JWT template and RLS policies, test your authentication:

1. Sign in through your app
2. Check that user data loads properly
3. Verify that database operations work without RLS errors

## Troubleshooting

### PGRST301 Error
- Ensure JWT template is correctly configured
- Verify RLS policies use the correct `auth.jwt()->>'sub'` syntax
- Check that the `clerk_user_id` column exists and is populated

### Token Issues
- Make sure you're using the `supabase` template name when calling `getToken()`
- Verify environment variables are set correctly
- Check that Clerk publishable key is configured

## Environment Variables Required

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_KEY=your_supabase_anon_key
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```