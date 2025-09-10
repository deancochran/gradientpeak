import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { getDynamicAppConfig } from "../app.config";

// Supabase client with authentication
export const supabase = createClient(
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

// Get the current app scheme based on environment
const getAppScheme = () => {
  const environment =
    (process.env.APP_ENV as "development" | "preview" | "production") ||
    "development";
  const config = getDynamicAppConfig(environment);
  const scheme = `${config.scheme}://`;

  console.log("🔧 Deep link configuration:", {
    APP_ENV: process.env.APP_ENV,
    environment,
    scheme,
    configScheme: config.scheme,
  });

  return scheme;
};

// Authentication API functions
export const auth = {
  // Sign up with email verification
  async signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${getAppScheme()}auth/callback`,
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
      redirectTo: `${getAppScheme()}auth/reset-password`,
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
