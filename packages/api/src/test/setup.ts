const TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const TEST_SUPABASE_URL = "https://example.supabase.co";
const TEST_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

process.env.DATABASE_URL ??= TEST_DATABASE_URL;
process.env.NEXT_PRIVATE_SUPABASE_URL ??= TEST_SUPABASE_URL;
process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY ??= TEST_SUPABASE_SERVICE_ROLE_KEY;
