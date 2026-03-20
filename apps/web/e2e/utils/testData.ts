import type { User } from "@supabase/supabase-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service role client has admin privileges to create users
// Uses the project's configured service role key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  // eslint-disable-next-line no-console
  console.warn("⚠️  Missing Supabase credentials - test user creation will be skipped");
}

const supabaseAdmin: SupabaseClient | null =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

/**
 * Test user roles and their data
 */
export const TEST_USERS = {
  admin: {
    email: "admin@test.com",
    password: "TestPass123!",
    firstName: "Admin",
    lastName: "User",
  },
  coach: {
    email: "coach@test.com",
    password: "TestPass123!",
    firstName: "Coach",
    lastName: "User",
  },
  athlete: {
    email: "athlete@test.com",
    password: "TestPass123!",
    firstName: "Athlete",
    lastName: "User",
  },
};

type TestUserRole = keyof typeof TEST_USERS;

/**
 * Creates a test user in the database
 * Uses Supabase admin client to bypass email verification
 */
export async function createTestUser(role: TestUserRole): Promise<User | null> {
  if (!supabaseAdmin) {
    // eslint-disable-next-line no-console
    console.warn("⚠️  Supabase admin not initialized, skipping user creation");
    return null;
  }

  const userData = TEST_USERS[role];

  // Check if user already exists
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();

  const existingUser = existingUsers?.users.find((u) => u.email === userData.email);

  if (existingUser) {
    // eslint-disable-next-line no-console
    console.log(`User ${userData.email} already exists, skipping creation`);
    return existingUser;
  }

  // Create new user with admin privileges
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: userData.email,
    password: userData.password,
    email_confirm: true, // Auto-confirm email
    user_metadata: {
      first_name: userData.firstName,
      last_name: userData.lastName,
    },
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error(`Failed to create user ${userData.email}:`, error.message);
    throw error;
  }

  // eslint-disable-next-line no-console
  console.log(`Created test user: ${userData.email}`);
  return data.user;
}

/**
 * Creates all test users defined in TEST_USERS
 * Safe to call multiple times - will skip existing users
 */
export async function setupTestUsers(): Promise<TestUserRole[]> {
  // eslint-disable-next-line no-console
  console.log("Setting up test users...");
  const createdUsers: TestUserRole[] = [];

  for (const role of Object.keys(TEST_USERS) as TestUserRole[]) {
    try {
      const user = await createTestUser(role);
      if (user) {
        createdUsers.push(role);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to setup test user ${role}:`, error);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Test users ready: ${createdUsers.join(", ")}`);
  return createdUsers;
}

/**
 * Deletes a test user and all their data
 */
export async function deleteTestUser(email: string): Promise<void> {
  if (!supabaseAdmin) {
    // eslint-disable-next-line no-console
    console.warn("⚠️  Supabase admin not initialized, skipping user deletion");
    return;
  }

  const { data: users } = await supabaseAdmin.auth.admin.listUsers();
  const user = users?.users.find((u) => u.email === email);

  if (!user) {
    // eslint-disable-next-line no-console
    console.log(`User ${email} not found, skipping deletion`);
    return;
  }

  // Delete user (this cascades to related tables due to FK constraints)
  await supabaseAdmin.auth.admin.deleteUser(user.id);
  // eslint-disable-next-line no-console
  console.log(`Deleted test user: ${email}`);
}

/**
 * Deletes all test users
 */
export async function cleanupTestUsers(): Promise<void> {
  for (const userData of Object.values(TEST_USERS)) {
    await deleteTestUser(userData.email);
  }
  // eslint-disable-next-line no-console
  console.log("All test users cleaned up");
}
