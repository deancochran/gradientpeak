import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";
import { getServerConfig, subscribeServerConfig } from "@/lib/server-config";

const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

if (!supabaseAnonKey) {
  throw new Error("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required");
}

const buildClient = (supabaseUrl: string) =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

let activeSupabaseUrl = getServerConfig().supabaseUrl;

export let supabase = buildClient(activeSupabaseUrl);

subscribeServerConfig(() => {
  const nextConfig = getServerConfig();
  if (nextConfig.supabaseUrl === activeSupabaseUrl) {
    return;
  }

  activeSupabaseUrl = nextConfig.supabaseUrl;
  supabase = buildClient(activeSupabaseUrl);
});
