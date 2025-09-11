import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "@lib/providers/ThemeProvider";
import { useAuth } from "@lib/stores";
import { router, Tabs } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Animated,
  TouchableOpacity,
  View,
} from "react-native";

import { useRecordingSession } from "@lib/hooks/useRecordingSession";

// Animated icon component with enhanced styling
function AnimatedIcon({ focused, name }: { focused: boolean; name: string }) {
  const scaleAnim = React.useRef(new Animated.Value(focused ? 1 : 0.9)).current;
  const opacityAnim = React.useRef(
    new Animated.Value(focused ? 1 : 0.7),
  ).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: focused ? 1.1 : 0.9,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: focused ? 1 : 0.7,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused, scaleAnim, opacityAnim]);

  const { isDarkColorScheme } = useColorScheme();
  const activeColor = isDarkColorScheme ? "#3b82f6" : "#3b82f6";
  const inactiveColor = isDarkColorScheme ? "#666666" : "#9ca3af";

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        opacity: opacityAnim,
      }}
    >
      <Ionicons
        name={name as any}
        size={focused ? 28 : 24}
        color={focused ? activeColor : inactiveColor}
      />
    </Animated.View>
  );
}

// Special Record button component for center position
function RecordButton() {
  const handleRecordPress = () => {
    router.push("/(session)/record");
  };

  return (
    <TouchableOpacity
      onPress={handleRecordPress}
      style={{
        backgroundColor: "#3b82f6",
        borderRadius: 28,
        width: 56,
        height: 56,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#3b82f6",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        marginBottom: 20,
      }}
      activeOpacity={0.8}
    >
      <Ionicons name="add" size={32} color="#ffffff" />
    </TouchableOpacity>
  );
}

export default function InternalLayout() {
  const { isDarkColorScheme } = useColorScheme();
  const { loading, initialized, isAuthenticated, hydrated } = useAuth();
  const { hasActiveSession, isCheckingSession } = useRecordingSession();

  // Direct navigation effect
  React.useEffect(() => {
    if (initialized && hydrated && !loading) {
      if (!isAuthenticated) {
        router.replace("/(external)/welcome");
      }
    }
  }, [loading, initialized, isAuthenticated, hydrated]);

  // If there's an active recording session, force navigation to record screen and hide everything else
  React.useEffect(() => {
    if (hasActiveSession && !isCheckingSession) {
      console.log(
        "🔒 Active recording session detected - forcing navigation to record screen",
      );
      router.replace("/(session)/record");
    }
  }, [hasActiveSession, isCheckingSession, router]);

  // Show loading while determining auth state
  if (!initialized || !hydrated || loading || isCheckingSession) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: isDarkColorScheme ? "#000000" : "#ffffff",
        }}
      >
        <ActivityIndicator
          size="large"
          color={isDarkColorScheme ? "#ffffff" : "#000000"}
        />
      </View>
    );
  }

  // If not authenticated, let navigation effect handle redirect
  if (!isAuthenticated) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: isDarkColorScheme ? "#000000" : "#ffffff",
        }}
      >
        <ActivityIndicator
          size="large"
          color={isDarkColorScheme ? "#ffffff" : "#000000"}
        />
      </View>
    );
  }

  const backgroundColor = isDarkColorScheme ? "#000000" : "#ffffff";
  const borderColor = isDarkColorScheme ? "#333333" : "#e5e5e5";

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#3b82f6",
          tabBarInactiveTintColor: isDarkColorScheme ? "#9ca3af" : "#6b7280",
          tabBarStyle: {
            backgroundColor,
            borderTopWidth: 1,
            borderTopColor: borderColor,
            height: 80,
            paddingBottom: 20,
            paddingTop: 10,
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 8,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "500",
            marginTop: 4,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ focused }) => (
              <AnimatedIcon
                focused={focused}
                name={focused ? "home" : "home-outline"}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="plan"
          options={{
            title: "Plan",
            tabBarIcon: ({ focused }) => (
              <AnimatedIcon
                focused={focused}
                name={focused ? "calendar" : "calendar-outline"}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="trends"
          options={{
            title: "Trends",
            tabBarIcon: ({ focused }) => (
              <AnimatedIcon
                focused={focused}
                name={focused ? "trending-up" : "trending-up-outline"}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ focused }) => (
              <AnimatedIcon
                focused={focused}
                name={focused ? "person" : "person-outline"}
              />
            ),
          }}
        />
      </Tabs>

      {/* Floating Action Button for Recording */}
      <View
        style={{
          position: "absolute",
          bottom: 90,
          alignSelf: "center",
          zIndex: 1000,
        }}
      >
        <RecordButton />
      </View>
    </View>
  );
}
