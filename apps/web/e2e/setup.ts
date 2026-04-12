import { setupTestUsers } from "./utils/testData";

export default async function globalSetup() {
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY)
  ) {
    await setupTestUsers();
    return;
  }

  console.log("Skipping test user setup for web E2E; missing service-role credentials.");
}
