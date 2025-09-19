import { ActivityIndicator, Button, Text, View } from "react-native";
import { useAuth, useAuthError, useIsAuthenticated, useUser } from "./useAuth";
import { useRedirectIfAuthenticated, useRequireAuth } from "./useAuthNavigation";

/**
 * Example component demonstrating the simplified auth hook usage
 * Shows how to use the unified auth system in different scenarios
 */

// Example 1: Basic auth state usage
export function AuthStatusExample() {
  const { user, isLoading, isAuthenticated, refreshSession } = useAuth();

  if (isLoading) {
    return (
      <View style={{ padding: 20 }}>
        <ActivityIndicator size="large" />
        <Text>Loading authentication status...</Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: "bold" }}>
        Authentication Status:
      </Text>
      <Text>{isAuthenticated ? "Authenticated" : "Not Authenticated"}</Text>
      {user && (
        <View style={{ marginTop: 10 }}>
          <Text>Email: {user.email}</Text>
          <Text>User ID: {user.id}</Text>
        </View>
      )}
      <Button title="Refresh Session" onPress={refreshSession} />
    </View>
  );
}

// Example 2: Individual hook usage
export function UserInfoExample() {
  const user = useUser();
  const isAuthenticated = useIsAuthenticated();

  if (!isAuthenticated) {
    return (
      <View style={{ padding: 20 }}>
        <Text>Please sign in to see user information</Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: "bold" }}>
        User Information:
      </Text>
      <Text>Email: {user?.email}</Text>
      <Text>User ID: {user?.id}</Text>
    </View>
  );
}

// Example 3: Protected route component (automatically redirects if not authenticated)
export function ProtectedContentExample() {
  const { user, isLoading } = useRequireAuth();

  if (isLoading) {
    return (
      <View style={{ padding: 20 }}>
        <ActivityIndicator size="large" />
        <Text>Verifying authentication...</Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold" }}>
        Protected Content
      </Text>
      <Text>Welcome back, {user?.email}!</Text>
      <Text>This content is only visible to authenticated users.</Text>
    </View>
  );
}

// Example 4: Public route that redirects authenticated users
export function PublicPageExample() {
  const { isLoading } = useRedirectIfAuthenticated();

  if (isLoading) {
    return (
      <View style={{ padding: 20 }}>
        <ActivityIndicator size="large" />
        <Text>Checking authentication status...</Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold" }}>Public Page</Text>
      <Text>
        This is a public page that authenticated users are redirected from.
      </Text>
    </View>
  );
}

// Example 5: Error handling
export function AuthErrorExample() {
  const { error, hasError, clearError } = useAuthError();

  if (!hasError) {
    return (
      <View style={{ padding: 20 }}>
        <Text>No authentication errors</Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 20, backgroundColor: "#ffebee" }}>
      <Text style={{ fontSize: 16, fontWeight: "bold", color: "#d32f2f" }}>
        Authentication Error:
      </Text>
      <Text style={{ color: "#d32f2f", marginVertical: 10 }}>
        {error?.message || "Unknown error occurred"}
      </Text>
      <Button title="Clear Error" onPress={clearError} color="#d32f2f" />
    </View>
  );
}

// Example 6: Complete auth workflow
export function CompleteAuthExample() {
  const { user, isAuthenticated, isLoading, signOut, refreshSession } =
    useAuth();

  if (isLoading) {
    return (
      <View style={{ padding: 20 }}>
        <ActivityIndicator size="large" />
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 20 }}>
        Complete Auth Example
      </Text>

      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontWeight: "bold" }}>Status:</Text>
        <Text>
          {isAuthenticated ? "✅ Authenticated" : "❌ Not Authenticated"}
        </Text>
      </View>

      {isAuthenticated && user && (
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontWeight: "bold" }}>User Info:</Text>
          <Text>Email: {user.email}</Text>
          <Text>ID: {user.id}</Text>
        </View>
      )}

      <View style={{ gap: 10 }}>
        <Button
          title="Refresh Session"
          onPress={refreshSession}
          disabled={!isAuthenticated}
        />

        {isAuthenticated && (
          <Button title="Sign Out" onPress={signOut} color="#d32f2f" />
        )}
      </View>
    </View>
  );
}
