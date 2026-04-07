import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let apiStorageServiceSingleton: SupabaseClient | null = null;

function resolveApiStorageServiceConfig() {
  const url = process.env.NEXT_PRIVATE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "API storage service requires NEXT_PRIVATE_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and NEXT_PRIVATE_SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return { serviceRoleKey, url };
}

/**
 * Backend-owned storage provider for API file flows.
 * This is intentionally a storage concern, not a relational query client.
 */
export function getApiStorageService() {
  if (!apiStorageServiceSingleton) {
    const { serviceRoleKey, url } = resolveApiStorageServiceConfig();
    apiStorageServiceSingleton = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return apiStorageServiceSingleton as any;
}
