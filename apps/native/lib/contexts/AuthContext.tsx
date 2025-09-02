import { Session } from "@supabase/supabase-js";
import { router } from "expo-router";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState } from "react-native";
import { supabase } from "../supabase";

// Custom hook for navigation readiness
function useNavigationReady() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait for next tick to ensure navigation is mounted
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return isReady;
}

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  isAuthenticated: false,
  signOut: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const navigationReady = useNavigationReady();

  // Simple authentication check - user exists and email is confirmed
  const isAuthenticated = !!session?.user?.email_confirmed_at;

  const signOut = async (): Promise<void> => {
    try {
      setLoading(true);

      // Immediately clear local session state
      setSession(null);
      console.log("📝 Sign out: Cleared local session state");

      // Check if there's an active session before attempting sign out
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) {
        console.log("📝 Sign out: No active session to sign out");
        return;
      }

      const { error } = await supabase.auth.signOut();
      if (error) {
        // Handle AuthSessionMissingError gracefully - user is already signed out
        if (error.message?.includes("Auth session missing")) {
          console.log("📝 Sign out: Session already cleared");
        } else {
          console.error("Sign out error:", error);
          // Even on error, keep local session cleared since we already cleared it
        }
      } else {
        console.log("📝 Sign out: Successfully signed out");
      }
    } catch (err: any) {
      // Handle AuthSessionMissingError gracefully - user is already signed out
      if (err.message?.includes("Auth session missing")) {
        console.log("📝 Sign out: Session already cleared");
      } else {
        console.error("Sign out error:", err);
        // Even on error, keep local session cleared since we already cleared it
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Get initial session
    const getInitialSession = async () => {
      try {
        console.log("🔐 Initializing auth state...");

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("🔧 Auth: Error getting session:", error);
        }

        if (isMounted) {
          setSession(session);
          setInitialized(true);
          setLoading(false);
          console.log("✅ Auth initialized:", {
            hasSession: !!session,
            userEmail: session?.user?.email,
            isVerified: !!session?.user?.email_confirmed_at,
          });
        }
      } catch (error) {
        console.error("🔧 Auth: Unexpected error:", error);
        if (isMounted) {
          setInitialized(true);
          setLoading(false);
        }
      }
    };

    getInitialSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for auth changes
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("🔧 Auth: State changed", {
        event,
        hasSession: !!session,
        userEmail: session?.user?.email,
        isVerified: !!session?.user?.email_confirmed_at,
      });

      setSession(session);
      setLoading(false);

      // Handle specific auth events for better UX
      switch (event) {
        case "SIGNED_OUT":
          console.log("🚪 User signed out - session cleared");
          // Ensure session is fully cleared
          setSession(null);
          break;
        case "SIGNED_IN":
          console.log("🚪 User signed in", {
            verified: !!session?.user?.email_confirmed_at,
          });
          break;
        case "TOKEN_REFRESHED":
          console.log("🔄 Token refreshed");
          break;
        case "USER_UPDATED":
          console.log("👤 User updated");
          break;
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Handle navigation after auth state changes
  useEffect(() => {
    if (!initialized || !navigationReady || loading) {
      console.log("🚦 Navigation blocked:", {
        initialized,
        navigationReady,
        loading,
      });
      return;
    }

    const handleAuthNavigation = () => {
      try {
        if (isAuthenticated) {
          console.log("🏠 Navigating to internal (authenticated)");
          router.replace("/(internal)");
        } else {
          console.log("🔓 Navigating to external (not authenticated)");
          router.replace("/(external)/welcome");
        }
      } catch (error) {
        console.error("❌ Navigation error:", error);
        // Fallback navigation with retry
        setTimeout(() => {
          try {
            if (isAuthenticated) {
              router.push("/(internal)");
            } else {
              router.push("/(external)/welcome");
            }
          } catch (retryError) {
            console.error("❌ Navigation retry failed:", retryError);
          }
        }, 500);
      }
    };

    // Small delay to ensure navigation is fully ready
    const navigationTimer = setTimeout(handleAuthNavigation, 50);

    return () => clearTimeout(navigationTimer);
  }, [isAuthenticated, initialized, navigationReady, loading]);

  // Handle app state changes (for deep linking)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === "active") {
        console.log("📱 App became active - refreshing session");
        // Refresh session when app becomes active
        supabase.auth.getSession();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription?.remove();
  }, []);

  // Debug logging for auth state
  React.useEffect(() => {
    console.log("🔍 Auth Context State:", {
      hasSession: !!session,
      isAuthenticated,
      loading,
      initialized,
      navigationReady,
      userEmail: session?.user?.email,
      emailConfirmed: !!session?.user?.email_confirmed_at,
    });
  }, [session, isAuthenticated, loading, initialized, navigationReady]);

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        isAuthenticated,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Helper hooks for convenience
export function useSession() {
  const { session } = useAuth();
  return session;
}

export function useUser() {
  const { session } = useAuth();
  return session?.user ?? null;
}
