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
  const { user, initializing } = useAuth();

  // Show loading spinner while initializing auth
  if (initializing) {
    return (
      fallback || (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#ffffff",
          }}
        >
          <ActivityIndicator size="large" color="#0066cc" />
        </View>
      )
    );
  }

  // Redirect to welcome/auth if not authenticated
  if (!user) {
    return <Redirect href={redirectTo} />;
  }

  // If user exists but email is not verified and verification is required
  if (requireVerification && user && !user.email_confirmed_at) {
    return <Redirect href="/(external)/verify" />;
  }

  // Render protected content
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
