import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthSession, AuthUser } from "@repo/auth";
import { normalizeGradientPeakAuthClientSession } from "@repo/auth";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { initializeServerConfig } from "@/lib/server-config";
import { supabase } from "@/lib/supabase/client";

export interface AuthState {
  session: AuthSession | null;
  user: AuthUser | null;
  profile: any | null; // Profile data from API (synced from useAuth hook)
  userStatus: "verified" | "unverified" | null;
  onboardingStatus: boolean | null;
  loading: boolean;
  ready: boolean; // Replaces hydrated && initialized
  error: Error | null;
  _listenerRegistered: boolean; // Internal flag, not persisted

  setSession: (session: AuthSession | null) => void;
  setUser: (user: AuthUser | null) => void;
  setProfile: (profile: any | null) => void;
  setUserStatus: (status: "verified" | "unverified" | null) => void;
  setOnboardingStatus: (status: boolean | null) => void;
  setLoading: (loading: boolean) => void;
  setReady: (ready: boolean) => void;
  setError: (error: Error | null) => void;

  initialize: () => Promise<void>;
  clearSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null as AuthSession | null,
      user: null as AuthUser | null,
      profile: null as any | null,
      userStatus: null as "verified" | "unverified" | null,
      onboardingStatus: null as boolean | null,
      loading: true as boolean,
      ready: false as boolean,
      error: null as Error | null,
      _listenerRegistered: false as boolean,

      setSession: (session: AuthSession | null) => {
        console.log("🔄 Auth Store: setSession called", {
          hasSession: !!session,
          hasUser: !!session?.user,
          email: session?.user?.email,
        });
        set((state) => {
          const nextUser = session?.user || null;
          const previousUserId = state.user?.id || null;
          const nextUserId = nextUser?.id || null;
          const isUserSwitch = previousUserId !== nextUserId;

          return {
            session,
            user: nextUser,
            // Prevent stale profile/onboarding data from previous account
            profile: isUserSwitch ? null : state.profile,
            userStatus: isUserSwitch ? null : state.userStatus,
            onboardingStatus: isUserSwitch ? null : state.onboardingStatus,
          };
        });
      },

      setUser: (user: AuthUser | null) => set({ user }),
      setProfile: (profile: any | null) => set({ profile }),
      setUserStatus: (userStatus) => set({ userStatus }),
      setOnboardingStatus: (onboardingStatus) => set({ onboardingStatus }),
      setLoading: (loading: boolean) => set({ loading }),
      setReady: (ready: boolean) => set({ ready }),
      setError: (error: Error | null) => set({ error }),

      initialize: async () => {
        console.log("🔄 Initializing auth store...");
        const currentState = get();

        if (currentState.ready) {
          console.log("✅ Already initialized, skipping");
          return;
        }

        try {
          await initializeServerConfig();
          set({ loading: true, error: null });

          console.log("🔄 Calling supabase.auth.getSession()");
          const {
            data: { session },
            error,
          } = await supabase.auth.getSession();

          console.log("✅ Got session response:", {
            session: !!session,
            error: !!error,
          });

          if (error) {
            // Check for invalid refresh token error
            // Supabase returns this when the refresh token is expired or invalid
            const isRefreshTokenError =
              error.message &&
              (error.message.includes("Invalid Refresh Token") ||
                error.message.includes("refresh_token_not_found"));

            if (isRefreshTokenError) {
              console.warn("⚠️ Invalid refresh token, clearing session to force re-login");
              // Clear session and return ready state without error
              set({
                session: null,
                user: null,
                loading: false,
                ready: true,
                error: null,
              });
              // Also make sure to sign out from supabase to clean up
              await supabase.auth.signOut().catch(() => {});
              return;
            }

            console.error("❌ Auth Store init error:", error);
            // Still mark as ready even on error so the app doesn't hang
            set({
              error,
              loading: false,
              ready: true,
              session: null,
              user: null,
            });
            return;
          }

          console.log("🔄 Setting session", { hasSession: !!session });
          get().setSession(normalizeGradientPeakAuthClientSession(session));

          // Set up auth listener once per store instance
          if (!currentState._listenerRegistered) {
            console.log("🔄 Setting up auth state change listener");

            supabase.auth.onAuthStateChange((event, session) => {
              console.log("🔄 Auth state changed:", event, !!session);
              const state = get();
              state.setSession(normalizeGradientPeakAuthClientSession(session));
            });

            set({ _listenerRegistered: true });
          } else {
            console.log("✅ Auth listener already set up, skipping");
          }

          console.log("✅ Auth store session loaded, finishing initialization...");
        } catch (err) {
          console.error("❌ Auth Store unexpected init error:", err);
          // Mark as ready even on error so the app doesn't hang waiting for auth
          set({
            error: err instanceof Error ? err : new Error(String(err)),
            loading: false,
            ready: true,
            session: null,
            user: null,
          });
        } finally {
          console.log("🔄 Finally block: setting loading=false, ready=true");
          set({ loading: false, ready: true });
          console.log("✅ Auth store initialization complete");
        }
      },

      clearSession: async () => {
        console.log("🔄 Clearing session...");
        try {
          // Sign out from Supabase
          await supabase.auth.signOut();

          // Clear local state
          set({
            session: null,
            user: null,
            profile: null,
            userStatus: null,
            onboardingStatus: null,
            error: null,
            loading: false,
          });

          console.log("✅ Session cleared successfully");
        } catch (error) {
          console.error("❌ Error clearing session:", error);
          // Force clear local state even if Supabase signOut fails
          set({
            session: null,
            user: null,
            profile: null,
            userStatus: null,
            onboardingStatus: null,
            error: null,
            loading: false,
          });
        }
      },
    }),
    {
      name: "gradientpeak-auth-store-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        session: state.session,
        user: state.user,
        profile: state.profile,
        userStatus: state.userStatus,
        onboardingStatus: state.onboardingStatus,
        // Don't persist: loading, ready, error, _listenerRegistered
        // These should always start fresh on app startup
      }),
      onRehydrateStorage: () => async (state, error) => {
        if (error) {
          console.error("❌ Auth Store rehydrate error:", error);
          return;
        }

        if (state) {
          console.log("🔄 Store rehydrated, initializing auth...");

          // Initialize auth immediately after rehydration
          // This prevents race conditions where components read stale data
          await state.initialize();

          console.log("✅ Rehydration and initialization complete");
        } else {
          console.error("❌ Auth Store rehydrate failed - no state available");
        }
      },
    },
  ),
);
