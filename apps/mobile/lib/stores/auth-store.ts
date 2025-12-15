import { supabase } from "@/lib/supabase/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface AuthState {
  session: Session | null;
  user: User | null;
  profile: any | null; // Profile data from tRPC (synced from useAuth hook)
  loading: boolean;
  ready: boolean; // Replaces hydrated && initialized
  error: Error | null;
  _listenerRegistered: boolean; // Internal flag, not persisted

  setSession: (session: Session | null) => void;
  setUser: (user: User | null) => void;
  setProfile: (profile: any | null) => void;
  setLoading: (loading: boolean) => void;
  setReady: (ready: boolean) => void;
  setError: (error: Error | null) => void;

  initialize: () => Promise<void>;
  clearSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null as Session | null,
      user: null as User | null,
      profile: null as any | null,
      loading: true as boolean,
      ready: false as boolean,
      error: null as Error | null,
      _listenerRegistered: false as boolean,

      setSession: (session: Session | null) => {
        console.log("🔄 Auth Store: setSession called", {
          hasSession: !!session,
          hasUser: !!session?.user,
          email: session?.user?.email,
        });
        set({
          session,
          user: session?.user || null,
        });
      },

      setUser: (user: User | null) => set({ user }),
      setProfile: (profile: any | null) => set({ profile }),
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
          set({ session, user: session?.user || null });

          // Set up auth listener once per store instance
          if (!currentState._listenerRegistered) {
            console.log("🔄 Setting up auth state change listener");

            supabase.auth.onAuthStateChange((event, session) => {
              console.log("🔄 Auth state changed:", event, !!session);
              const state = get();
              state.setSession(session);
            });

            set({ _listenerRegistered: true });
          } else {
            console.log("✅ Auth listener already set up, skipping");
          }

          console.log(
            "✅ Auth store session loaded, finishing initialization...",
          );
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
