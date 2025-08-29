// apps/native/lib/contexts/ProtectedRoute.tsx
import { Redirect } from "expo-router";
import { ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "./AuthContext";

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
  requireVerification?: boolean;
}

export function ProtectedRoute({
  children,
  fallback,
  redirectTo = "/(external)/welcome",
  requireVerification = true,
}: ProtectedRouteProps) {
  const { session, loading, isValidSession, refreshSession } = useAuth();
  const [isValidating, setIsValidating] = useState(false);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);

  // Validate session when component mounts
  useEffect(() => {
    const validateSession = async () => {
      if (!session) {
        setSessionValid(false);
        return;
      }

      setIsValidating(true);
      try {
        const isValid = await refreshSession();
        setSessionValid(isValid);
      } catch (err) {
        console.error("Session validation error:", err);
        setSessionValid(false);
      } finally {
        setIsValidating(false);
      }
    };

    validateSession();
  }, [session]);

  console.log("🛡️ ProtectedRoute check:", {
    loading,
    isValidating,
    sessionValid,
    hasSession: !!session,
    hasUser: !!session?.user,
    emailConfirmed: !!session?.user?.email_confirmed_at,
    requireVerification,
    redirectTo,
  });

  // Show loading spinner while auth is loading or validating
  if (loading || isValidating) {
    return (
      fallback || (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#ffffff",
          }}
          testID="protected-route-loading"
        >
          <ActivityIndicator size="large" color="#0066cc" />
        </View>
      )
    );
  }

  // Redirect if not authenticated or session is invalid
  if (!session?.user || sessionValid === false) {
    console.log(
      "🚫 ProtectedRoute: No valid user session, redirecting to:",
      redirectTo,
    );
    return <Redirect href={redirectTo} />;
  }

  // If verification is required but user is not verified
  if (requireVerification && !session.user.email_confirmed_at) {
    console.log("📧 ProtectedRoute: User not verified, redirecting to verify");
    return <Redirect href="/(external)/verify" />;
  }

  // All checks passed, render protected content
  console.log("✅ ProtectedRoute: Access granted");
  return <>{children}</>;
}

// Higher-order component version
export function withProtectedRoute<P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    fallback?: ReactNode;
    redirectTo?: string;
    requireVerification?: boolean;
  },
) {
  return function ProtectedComponent(props: P) {
    return (
      <ProtectedRoute
        fallback={options?.fallback}
        redirectTo={options?.redirectTo}
        requireVerification={options?.requireVerification}
      >
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}
