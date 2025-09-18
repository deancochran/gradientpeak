import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { ActivityService } from "@/lib/services/activity-service";

/**
 * Global hook to manage recording session persistence across app lifecycle
 * This ensures that if a user has an active recording session, they're always
 * redirected to the recording modal until they complete or stop the activity.
 */
export const useRecordingSession = () => {
  const router = useRouter();
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Check for active session on mount and periodically
  useEffect(() => {
    const checkForActiveSession = async () => {
      try {
        await ActivityService.initialize();
        const session = ActivityService.getCurrentSession();
        const hasSession =
          session &&
          (session.status === "recording" || session.status === "paused");

        console.log("🔍 Recording Session Check:", {
          hasSession: !!hasSession,
          sessionStatus: session?.status,
          sessionId: session?.id,
        });

        setHasActiveSession(!!hasSession);
        setIsCheckingSession(false);

        // If we have an active session and we're not already on the record screen,
        // navigate to it immediately
        if (hasSession) {
          console.log(
            "🎯 Active recording session detected - navigating to record screen",
          );
          router.replace("/(internal)/record");
        }
      } catch (error) {
        console.error("❌ Error checking for active recording session:", error);
        setIsCheckingSession(false);
      }
    };

    // Check immediately
    checkForActiveSession();

    // Set up periodic checking every 5 seconds when app is active
    const interval = setInterval(checkForActiveSession, 5000);

    return () => clearInterval(interval);
  }, [router]);

  // Listen for app state changes to check session when app becomes active
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      if (nextAppState === "active") {
        console.log("📱 App became active - checking for recording session");

        try {
          await ActivityService.initialize();
          const session = ActivityService.getCurrentSession();
          const hasSession =
            session &&
            (session.status === "recording" || session.status === "paused");

          console.log("📱 Session check on app resume:", {
            hasSession: !!hasSession,
            sessionStatus: session?.status,
            sessionId: session?.id,
          });

          if (hasSession) {
            console.log(
              "🎯 Active session detected on app resume - navigating to record screen",
            );
            setHasActiveSession(true);
            router.replace("/(internal)/record");
          } else {
            setHasActiveSession(false);
          }
        } catch (error) {
          console.error("❌ Error checking session on app resume:", error);
        }
      }
    };

    // Subscribe to app state changes
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription?.remove();
    };
  }, [router]);

  return {
    hasActiveSession,
    isCheckingSession,
  };
};
