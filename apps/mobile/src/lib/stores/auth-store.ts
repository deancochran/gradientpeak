import { supabase } from "@/lib/supabase/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  hydrated: boolean;
  error: Error | null;

  setSession: (session: Session | null) => void;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
  setError: (error: Error | null) => void;

  initialize: () => Promise<void>;
}

// Track if auth listener has been set up to prevent duplicates
let authListenerSetup = false;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null as Session | null,
      user: null as User | null,
      loading: true as boolean,
      initialized: false as boolean,
      hydrated: false as boolean,
      error: null as Error | null,

      setSession: (session: Session | null) => {
        set({
          session,
          user: session?.user || null,
        });
      },

      setUser: (user: User | null) => set({ user }),
      setLoading: (loading: boolean) => set({ loading }),
      setInitialized: (initialized: boolean) => set({ initialized }),
      setHydrated: (hydrated: boolean) => set({ hydrated }),
      setError: (error: Error | null) => set({ error }),

      initialize: async () => {
        console.log("🔄 Initializing auth store...");
        const currentState = get();

        if (currentState.initialized) {
          console.log("✅ Already initialized, skipping");
          return;
        }

        try {
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
            set({ error });
          }

          console.log("🔄 Setting session");
          get().setSession(session);

          // Only set up auth listener once globally
          if (!authListenerSetup) {
            console.log("🔄 Setting up auth state change listener");
            authListenerSetup = true;

            supabase.auth.onAuthStateChange((event, session) => {
              console.log("🔄 Auth state changed:", event, !!session);
              get().setSession(session);
            });
          } else {
            console.log("✅ Auth listener already set up, skipping");
          }

          console.log(
            "✅ Auth store session loaded, finishing initialization...",
          );
        } catch (err) {
          console.error("❌ Auth Store unexpected init error:", err);
          set({ error: err instanceof Error ? err : new Error(String(err)) });
        } finally {
          console.log(
            "🔄 Finally block: setting loading=false, initialized=true",
          );
          set({ loading: false, initialized: true });
          console.log("✅ Auth store initialization complete");
        }
      },
    }),
    {
      name: "turbofit-auth-store-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        session: state.session,
        user: state.user,
        // Don't persist loading, initialized, hydrated, or error states
        // These should always start fresh on app startup
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error("❌ Auth Store rehydrate error:", error);
        }

        if (state) {
          console.log("🔄 Store rehydrated successfully");
          state.setHydrated(true);

          // Don't call initialize here - let the useAuth hook handle it
          // This prevents the circular dependency issue
          console.log(
            "✅ Rehydration complete, waiting for useAuth hook to initialize",
          );
        } else {
          console.error("❌ Auth Store rehydrate failed - no state available");
        }
      },
    },
  ),
);
