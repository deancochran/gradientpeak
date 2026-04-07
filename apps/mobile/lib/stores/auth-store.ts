import type { AuthSession, AuthUser } from "@repo/auth/session";
import { create } from "zustand";
import {
  getMobileAuthSession,
  refreshMobileAuthSession,
  signOutMobileAuth,
  subscribeToMobileAuthSession,
} from "@/lib/auth/client";

let authUnsubscribe: (() => void) | null = null;
let initializePromise: Promise<void> | null = null;

export interface AuthState {
  session: AuthSession | null;
  user: AuthUser | null;
  profile: any | null; // Profile data from API (synced from useAuth hook)
  userStatus: "verified" | "unverified" | null;
  onboardingStatus: boolean | null;
  loading: boolean;
  ready: boolean; // Replaces hydrated && initialized
  error: Error | null;
  setSession: (session: AuthSession | null) => void;
  setUser: (user: AuthUser | null) => void;
  setProfile: (profile: any | null) => void;
  setUserStatus: (status: "verified" | "unverified" | null) => void;
  setOnboardingStatus: (status: boolean | null) => void;
  setLoading: (loading: boolean) => void;
  setReady: (ready: boolean) => void;
  setError: (error: Error | null) => void;

  initialize: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  session: null,
  user: null,
  profile: null,
  userStatus: null,
  onboardingStatus: null,
  loading: true,
  ready: false,
  error: null,
  setSession: (session: AuthSession | null) => {
    set((state) => {
      const nextUser = session?.user || null;
      const previousUserId = state.user?.id || null;
      const nextUserId = nextUser?.id || null;
      const isUserSwitch = previousUserId !== nextUserId;

      return {
        session,
        user: nextUser,
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
    if (get().ready) {
      return;
    }

    if (initializePromise) {
      return initializePromise;
    }

    initializePromise = (async () => {
      try {
        set({ loading: true, error: null });

        const session = await getMobileAuthSession();
        get().setSession(session);

        if (!authUnsubscribe) {
          authUnsubscribe = subscribeToMobileAuthSession((nextSession) => {
            get().setSession(nextSession);
          });
        }
      } catch (err) {
        set({
          error: err instanceof Error ? err : new Error(String(err)),
          session: null,
          user: null,
        });
      } finally {
        set({ loading: false, ready: true });
        initializePromise = null;
      }
    })();

    return initializePromise;
  },
  refreshSession: async () => {
    const session = await refreshMobileAuthSession();
    get().setSession(session);
  },
  clearSession: async () => {
    try {
      await signOutMobileAuth().catch(() => {});
    } finally {
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
}));
