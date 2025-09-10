import { router } from "expo-router";
import { useEffect, useState } from "react";
import { useAuthStore } from "../stores";

/**
 * Hook to handle navigation based on authentication state
 * This replaces the navigation logic that was previously in AuthContext
 */
export function useAuthNavigation() {
  const { isAuthenticated, loading, initialized, hydrated } = useAuthStore();
  const [navigationReady, setNavigationReady] = useState(false);

  // Wait for navigation to be ready (similar to original AuthContext)
  useEffect(() => {
    const timer = setTimeout(() => {
      setNavigationReady(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Handle navigation after auth state changes
  useEffect(() => {
    console.log("🚦 Navigation useEffect triggered:", {
      initialized,
      navigationReady,
      loading,
      hydrated,
      isAuthenticated,
    });

    if (!initialized || !navigationReady || loading || !hydrated) {
      console.log("🚦 Navigation blocked:", {
        initialized,
        navigationReady,
        loading,
        hydrated,
      });
      return;
    }

    console.log("🚦 Navigation conditions met, proceeding...");

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
  }, [isAuthenticated, initialized, navigationReady, loading, hydrated]);

  const isReady = initialized && navigationReady && !loading && hydrated;

  console.log("🚦 Navigation hook state:", {
    isReady,
    isAuthenticated,
    loading,
    initialized,
    navigationReady,
    hydrated,
  });

  return {
    isReady,
    isAuthenticated,
    loading,
  };
}
