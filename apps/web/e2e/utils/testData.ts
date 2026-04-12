import type { User } from "@supabase/supabase-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn("Missing Supabase credentials for web E2E test-user setup.");
}

const supabaseAdmin: SupabaseClient | null =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export const TEST_USERS = {
  coach: {
    email: "coach@test.com",
    firstName: "Coach",
    lastName: "User",
    password: "TestPass123!",
  },
  athlete: {
    email: "athlete@test.com",
    firstName: "Athlete",
    lastName: "User",
    password: "TestPass123!",
  },
};

type TestUserRole = keyof typeof TEST_USERS;

export async function createTestUser(role: TestUserRole): Promise<User | null> {
  if (!supabaseAdmin) {
    console.warn("Supabase admin not initialized, skipping web E2E user creation.");
    return null;
  }

  const userData = TEST_USERS[role];
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = existingUsers?.users.find((user) => user.email === userData.email);

  if (existingUser) {
    return existingUser;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: userData.email,
    password: userData.password,
    email_confirm: true,
    user_metadata: {
      first_name: userData.firstName,
      last_name: userData.lastName,
    },
  });

  if (error) {
    throw error;
  }

  return data.user;
}

export async function setupTestUsers(): Promise<TestUserRole[]> {
  const readyUsers: TestUserRole[] = [];

  for (const role of Object.keys(TEST_USERS) as TestUserRole[]) {
    try {
      const user = await createTestUser(role);
      if (user) {
        readyUsers.push(role);
      }
    } catch (error) {
      console.error(`Failed to prepare web E2E user ${role}:`, error);
    }
  }

  return readyUsers;
}
