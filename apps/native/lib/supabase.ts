import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database } from "@repo/supabase";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

// Re-export types for convenience
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Activity = Database["public"]["Tables"]["activities"]["Row"];
// Type aliases for insert and update operations
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
export type ActivityInsert =
  Database["public"]["Tables"]["activities"]["Insert"];
export type ActivityUpdate =
  Database["public"]["Tables"]["activities"]["Update"];

// Enum type aliases
export type SyncStatus = Database["public"]["Enums"]["sync_status"];

// Supabase client with authentication
export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Auto refresh handling like in official tutorial
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

// Authentication API functions
export const auth = {
  // Sign up with email verification
  async signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.EXPO_PUBLIC_APP_URL || "turbofit://"}auth/callback`,
      },
    });
    return { data, error };
  },

  // Sign in with email and password
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  // Reset password
  async resetPassword(email: string) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.EXPO_PUBLIC_APP_URL || "turbofit://"}auth/reset-password`,
    });
    return { data, error };
  },

  // Update password
  async updatePassword(password: string) {
    const { data, error } = await supabase.auth.updateUser({
      password,
    });
    return { data, error };
  },

  // Get current session
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    return { data, error };
  },

  // Get current user
  async getUser() {
    const { data, error } = await supabase.auth.getUser();
    return { data, error };
  },

  // Listen to auth state changes
  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback);
  },
};

// Profile management
export const profiles = {
  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    return { data, error };
  },

  async updateProfile(userId: string, updates: ProfileUpdate) {
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    return { data, error };
  },

  async upsertProfile(profile: ProfileInsert & { id: string }) {
    const { data, error } = await supabase
      .from("profiles")
      .upsert(profile)
      .select()
      .single();

    return { data, error };
  },
};

// Activity management
export const activities = {
  async createActivity(activityData: ActivityInsert) {
    const { data, error } = await supabase
      .from("activities")
      .insert(activityData)
      .select()
      .single();

    return { data, error };
  },

  async getActivities(userId: string, limit = 20, offset = 0) {
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);

    return { data, error };
  },

  async getActivity(id: string) {
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .eq("id", id)
      .single();

    return { data, error };
  },

  async updateActivity(id: string, updates: ActivityUpdate) {
    const { data, error } = await supabase
      .from("activities")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    return { data, error };
  },

  async deleteActivity(id: string) {
    const { error } = await supabase.from("activities").delete().eq("id", id);

    return { error };
  },

  async getActivityStats(userId: string) {
    const { data, error } = await supabase
      .from("activities")
      .select("distance_meters, duration_seconds, sport")
      .eq("user_id", userId)
      .eq("status", "completed");

    if (error) return { data: null, error };

    // const stats = {
    //   totalActivities: data.length,
    //   totalDistance: data.reduce(
    //     (sum, activity) => sum + (activity.distance_meters || 0),
    //     0,
    //   ),
    //   totalDuration: data.reduce(
    //     (sum, activity) => sum + (activity.duration_seconds || 0),
    //     0,
    //   ),
    //   activitiesBySport: data.reduce(
    //     (acc, activity) => {
    //       acc[activity.sport] = (acc[activity.sport] || 0) + 1;
    //       return acc;
    //     },
    //     {} as Record<string, number>,
    //   ),
    // };

    return { data: {}, error: null };
  },
};

// Storage for file uploads
export const storage = {
  async uploadAvatar(
    userId: string,
    file: ArrayBuffer,
    contentType: string = "image/jpeg",
  ) {
    const fileExt = contentType.split("/")[1];
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { data, error } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, {
        contentType,
        upsert: true,
      });

    return { data, error };
  },

  async downloadAvatar(path: string) {
    const { data, error } = await supabase.storage
      .from("avatars")
      .download(path);

    return { data, error };
  },

  async getAvatarUrl(path: string) {
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);

    return data.publicUrl;
  },

  async deleteAvatar(path: string) {
    const { error } = await supabase.storage.from("avatars").remove([path]);

    return { error };
  },
};

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

export default supabase;
