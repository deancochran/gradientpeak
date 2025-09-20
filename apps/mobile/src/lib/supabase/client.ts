import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
// Supabase client with authentication
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

export const getAuthHeaders = async () => {
  const baseHeaders = {
    "x-trpc-source": "expo",
    "x-client-type": "mobile",
  };

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.warn("Auth session error:", error);
      return baseHeaders;
    }

    const token = data.session?.access_token;

    return {
      ...baseHeaders,
      ...(token && { authorization: `Bearer ${token}` }),
    };
  } catch (error) {
    console.error("Failed to get auth session:", error);
    return baseHeaders;
  }
};
