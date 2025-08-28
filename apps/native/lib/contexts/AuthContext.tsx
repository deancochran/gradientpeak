import { Session } from "@supabase/supabase-js";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../supabase";

interface AuthContextType {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
});

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("🔧 AuthProvider: Setting up auth listeners");

    let isMounted = true;

    // Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          console.error("🔧 AuthProvider: Error getting session:", error);
        } else {
          console.log("🔧 AuthProvider: Initial session loaded", {
            hasSession: !!session,
            userEmail: session?.user?.email,
          });
        }

        if (isMounted) {
          setSession(session);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error("🔧 AuthProvider: Unexpected error:", error);
        if (isMounted) {
          setLoading(false);
        }
      });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("🔧 AuthProvider: Auth state changed", {
        event,
        hasSession: !!session,
        userEmail: session?.user?.email,
      });

      if (isMounted) {
        setSession(session);
        setLoading(false);
      }
    });

    return () => {
      console.log("🔧 AuthProvider: Cleaning up auth subscription");
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading }}>
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
