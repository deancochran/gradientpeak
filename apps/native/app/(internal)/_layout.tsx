import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { ActivityIndicator, Animated, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useColorScheme } from "@/lib/useColorScheme";

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
function RecordButton({ focused }: { focused: boolean }) {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1.2 : 1,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [focused, scaleAnim]);

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
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
      }}
    >
      <Ionicons name="add" size={32} color="#ffffff" />
    </Animated.View>
  );
}

export default function InternalLayout() {
  const { isDarkColorScheme } = useColorScheme();
  const { loading, isAuthenticated, session } = useAuth();

  // Enhanced debug logging for navigation
  React.useEffect(() => {
    console.log("🧭 Navigation Layout - Auth State:", {
      loading,
      isAuthenticated,
      hasSession: !!session,
      userEmail: session?.user?.email,
    });
  }, [loading, isAuthenticated, session]);

  if (loading) {
    console.log("🧭 Navigation Layout - Loading state");
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: isDarkColorScheme ? "#000000" : "#ffffff",
        }}
        testID="navigation-loading"
      >
        <ActivityIndicator
          size="large"
          color={isDarkColorScheme ? "#3b82f6" : "#3b82f6"}
        />
      </View>
    );
  }

  const backgroundColor = isDarkColorScheme ? "#1f2937" : "#ffffff";
  const borderColor = isDarkColorScheme ? "#374151" : "#e5e7eb";

  console.log("🧭 Navigation Layout - Rendering tabs");

  return (
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
        name="record"
        options={{
          title: "Record",
          tabBarIcon: ({ focused }) => <RecordButton focused={focused} />,
          tabBarLabel: () => null, // Hide label for record button
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
  );
}
