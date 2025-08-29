// apps/native/app/(internal)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { ActivityIndicator, Animated, View } from "react-native";

import { useAuth } from "@/lib/contexts";
import { useColorScheme } from "@/lib/useColorScheme";

// Animated icon component
function AnimatedIcon({ focused, name }: { focused: boolean; name: string }) {
  const scaleAnim = React.useRef(new Animated.Value(focused ? 1 : 0.9)).current;

  React.useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1 : 0.9,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [focused, scaleAnim]);

  const { isDarkColorScheme } = useColorScheme();
  const activeColor = isDarkColorScheme ? "#ffffff" : "#000000";
  const inactiveColor = isDarkColorScheme ? "#666666" : "#999999";

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Ionicons
        name={name as any}
        size={focused ? 30 : 26}
        color={focused ? activeColor : inactiveColor}
      />
    </Animated.View>
  );
}

export default function InternalLayout() {
  const { isDarkColorScheme } = useColorScheme();
  const { loading, isAuthenticated, session } = useAuth();

  // Debug logging to see what's happening
  React.useEffect(() => {
    console.log("🛡️ Internal Layout Auth State:", {
      loading,
      isAuthenticated,
      hasSession: !!session,
      userEmail: session?.user?.email,
      emailConfirmed: !!session?.user?.email_confirmed_at,
    });
  }, [loading, isAuthenticated, session]);

  // Show loading spinner while auth is loading
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: isDarkColorScheme ? "#000000" : "#ffffff",
        }}
        testID="protected-route-loading"
      >
        <ActivityIndicator
          size="large"
          color={isDarkColorScheme ? "#ffffff" : "#0066cc"}
        />
      </View>
    );
  }

  // Redirect to external if not authenticated
  if (!isAuthenticated) {
    return <Redirect href="/(external)/welcome" />;
  }

  const backgroundColor = isDarkColorScheme ? "#000000" : "#ffffff";
  const borderColor = isDarkColorScheme ? "#222222" : "#e5e5e5";
  const activeColor = isDarkColorScheme ? "#ffffff" : "#000000";
  const inactiveColor = isDarkColorScheme ? "#666666" : "#999999";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle: {
          backgroundColor,
          borderTopWidth: 1,
          borderTopColor: borderColor,
          height: 50,
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingBottom: 4,
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
        name="record"
        options={{
          title: "Record",
          tabBarIcon: ({ focused }) => (
            <AnimatedIcon
              focused={focused}
              name={focused ? "add-circle" : "add-circle-outline"}
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
