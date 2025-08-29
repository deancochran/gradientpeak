// apps/native/lib/contexts/ProtectedRoute.tsx
import { Redirect } from "expo-router";
import { ReactNode } from "react";
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
  const { session, loading } = useAuth();

  console.log("🛡️ ProtectedRoute check:", {
    loading,
    hasSession: !!session,
    hasUser: !!session?.user,
    emailConfirmed: !!session?.user?.email_confirmed_at,
    requireVerification,
    redirectTo,
  });

  // Show loading spinner while auth is loading
  if (loading) {
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

  // Redirect if not authenticated
  if (!session?.user) {
    console.log("🚫 ProtectedRoute: No user, redirecting to:", redirectTo);
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
