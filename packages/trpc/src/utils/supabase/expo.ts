import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database } from "@repo/supabase";
import { createClient } from "@supabase/supabase-js";

export function createExpoSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    },
  );
}
