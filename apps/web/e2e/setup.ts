/**
 * Global setup for Playwright E2E tests
 * Runs once before any tests - creates test users in the database
 */
import { setupTestUsers } from "./utils/testData";

export default async function globalSetup() {
  // Only run if we have Supabase credentials
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY)
  ) {
    await setupTestUsers();
  } else {
    // eslint-disable-next-line no-console
    console.log("⚠️  Skipping test user setup - missing SUPABASE_SERVICE_ROLE_KEY");
    // eslint-disable-next-line no-console
    console.log("   Set SUPABASE_SERVICE_ROLE_KEY in your environment to enable");
  }
}
