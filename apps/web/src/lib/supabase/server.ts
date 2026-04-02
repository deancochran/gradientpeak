import type { DbSupabaseDatabase } from "@repo/db";
import { createServerClient } from "@supabase/ssr";

const serverSupabaseUrl =
  process.env.NEXT_PRIVATE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey = process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY;

type SupabaseClientOptions = NonNullable<
  Parameters<typeof createServerClient<DbSupabaseDatabase>>[2]
>;

function createServerSupabaseClient(key: string, options: SupabaseClientOptions) {
  return createServerClient<DbSupabaseDatabase>(serverSupabaseUrl!, key, options);
}

export function createServiceRoleClient(options: SupabaseClientOptions) {
  return createServerSupabaseClient(serviceRoleKey!, options);
}
