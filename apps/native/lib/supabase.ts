// apps/native/lib/supabase.ts
import { useAuth } from "@clerk/clerk-expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Database types matching actual Supabase schema
export interface User {
  id: string;
  clerk_user_id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  preferred_units?: string;
  timezone?: string;
  last_sync_at?: string;
  device_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  user_id: string;
  client_id: string;
  device_id?: string;
  name?: string;
  description?: string;
  sport: "running" | "cycling" | "walking" | "hiking" | "swimming" | "other";
  status: "recording" | "completed" | "cancelled";
  privacy: "private" | "friends" | "public";
  distance_meters?: number;
  duration_seconds?: number;
  elevation_gain_meters?: number;
  max_speed_mps?: number;
  average_speed_mps?: number;
  max_heart_rate?: number;
  average_heart_rate?: number;
  max_power?: number;
  average_power?: number;
  calories_burned?: number;
  average_cadence?: number;
  local_fit_file_path?: string;
  local_file_size_bytes?: number;
  fit_file_checksum?: string;
  cloud_storage_path?: string;
  started_at: string;
  ended_at?: string;
  recorded_at: string;
  start_latitude?: number;
  start_longitude?: number;
  end_latitude?: number;
  end_longitude?: number;
  sync_status: "local_only" | "pending_sync" | "syncing" | "synced" | "sync_failed";
  sync_priority?: number;
  last_sync_attempt?: string;
  sync_attempt_count?: number;
  sync_error_message?: string;
  created_at: string;
  updated_at: string;
  synced_at?: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  preferred_units: "metric" | "imperial";
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<User, "id" | "created_at" | "updated_at">>;
      };
      activities: {
        Row: Activity;
        Insert: Omit<Activity, "id" | "created_at" | "updated_at" | "synced_at">;
        Update: Partial<Omit<Activity, "id" | "created_at" | "updated_at">>;
      };
      user_settings: {
        Row: UserSettings;
        Insert: Omit<UserSettings, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<UserSettings, "id" | "created_at" | "updated_at">>;
      };
    };
  };
}

// Base Supabase client
export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  },
);

// Hook to create authenticated Supabase client
export const useSupabaseClient = () => {
  const { getToken } = useAuth();

  const getAuthenticatedClient = async (): Promise<
    SupabaseClient<Database>
  > => {
    const token = await getToken({ template: "supabase" });

    if (!token) {
      throw new Error("No authentication token available");
    }

    // DEBUG: Log token info (first/last 10 chars only for security)
    console.log('🔍 Debug: Got Clerk token:', token.substring(0, 10) + '...' + token.substring(token.length - 10));
    
    // DEBUG: Try to decode JWT payload (for debugging only)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      console.log('🔍 Debug: JWT payload user_id:', payload.user_id);
      console.log('🔍 Debug: JWT payload aud:', payload.aud);
      console.log('🔍 Debug: JWT payload email:', payload.email);
    } catch (e) {
      console.log('🚨 Debug: Failed to decode JWT:', e);
    }

    return createClient<Database>(
      process.env.EXPO_PUBLIC_SUPABASE_URL!,
      process.env.EXPO_PUBLIC_SUPABASE_KEY!,
      {
        global: {
          fetch: async (url, options = {}) => {
            // Get fresh token for each request
            const freshToken = await getToken({ template: "supabase" });
            
            const headers = new Headers(options?.headers);
            if (freshToken) {
              headers.set('Authorization', `Bearer ${freshToken}`);
              console.log('🔍 Debug: Added Authorization header to request');
            }

            return fetch(url, {
              ...options,
              headers,
            });
          },
        },
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );
  };

  return { getAuthenticatedClient };
};

// API functions that work with authenticated Supabase client
export const createAuthenticatedApi = (supabaseClient: SupabaseClient<Database>) => ({
  // User management
  async createUser(userData: Database["public"]["Tables"]["users"]["Insert"]) {
    const { data, error } = await supabaseClient
      .from("users")
      .insert(userData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getUser(clerkUserId: string) {
    const { data, error } = await supabaseClient
      .from("users")
      .select("*")
      .eq("clerk_user_id", clerkUserId)
      .single();

    if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows returned
    return data;
  },

  async updateUser(
    clerkUserId: string,
    updates: Database["public"]["Tables"]["users"]["Update"],
  ) {
    const { data, error } = await supabaseClient
      .from("users")
      .update(updates)
      .eq("clerk_user_id", clerkUserId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Activity management
  async createActivity(
    activityData: Database["public"]["Tables"]["activities"]["Insert"],
  ) {
    const { data, error } = await supabaseClient
      .from("activities")
      .insert(activityData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getActivities(userId: string, limit = 20, offset = 0) {
    const { data, error } = await supabaseClient
      .from("activities")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  },

  async getActivityStats(userId: string) {
    const { data, error } = await supabaseClient
      .from("activities")
      .select("distance, duration, activity_type")
      .eq("user_id", userId);

    if (error) throw error;

    const stats = {
      totalActivities: data.length,
      totalDistance: data.reduce(
        (sum, activity) => sum + (activity.distance || 0),
        0,
      ),
      totalDuration: data.reduce(
        (sum, activity) => sum + (activity.duration || 0),
        0,
      ),
      activitiesByType: data.reduce(
        (acc, activity) => {
          acc[activity.activity_type] = (acc[activity.activity_type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };

    return stats;
  },

  // Settings management
  async getUserSettings(userId: string) {
    const { data, error } = await supabaseClient
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) throw error;
    return data;
  },

  async updateUserSettings(
    userId: string,
    settings: Database["public"]["Tables"]["user_settings"]["Update"],
  ) {
    const { data, error } = await supabaseClient
      .from("user_settings")
      .update(settings)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
});

// Legacy API for backward compatibility (using base client without auth)
export const api = createAuthenticatedApi(supabase);

// Utility functions
export const formatDistance = (
  meters: number,
  units: "metric" | "imperial" = "metric",
): string => {
  if (units === "imperial") {
    const miles = meters * 0.000621371;
    return `${miles.toFixed(2)} mi`;
  }

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }

  return `${meters.toFixed(0)} m`;
};

export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

export const formatPace = (
  secondsPerKm: number,
  units: "metric" | "imperial" = "metric",
): string => {
  if (units === "imperial") {
    const secondsPerMile = secondsPerKm * 1.60934;
    const minutes = Math.floor(secondsPerMile / 60);
    const seconds = Math.floor(secondsPerMile % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}/mi`;
  }

  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.floor(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}/km`;
};
