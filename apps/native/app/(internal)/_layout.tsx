import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Animated } from "react-native";

import { ProtectedRoute } from "@/lib/contexts";
import { useColorScheme } from "@/lib/useColorScheme";

export default function TabLayout() {
  const { isDarkColorScheme } = useColorScheme();

  const backgroundColor = isDarkColorScheme ? "#000000" : "#ffffff";
  const borderColor = isDarkColorScheme ? "#222222" : "#e5e5e5";
  const activeColor = isDarkColorScheme ? "#ffffff" : "#000000";
  const inactiveColor = isDarkColorScheme ? "#666666" : "#999999";

  // Animated icon that reacts to focus
  function AnimatedIcon({ focused, name }: { focused: boolean; name: string }) {
    const scaleAnim = React.useRef(
      new Animated.Value(focused ? 1 : 0.9),
    ).current;

    React.useEffect(() => {
      Animated.spring(scaleAnim, {
        toValue: focused ? 1 : 0.9,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }).start();
    }, [focused]);

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

  return (
    <ProtectedRoute redirectTo="/welcome">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: activeColor,
          tabBarInactiveTintColor: inactiveColor,
          tabBarStyle: {
            backgroundColor,
            borderTopWidth: 1,
            borderTopColor: borderColor,
            height: 50, // shrink the tab bar
            position: "absolute", // make it hug bottom
            bottom: 0,
            left: 0,
            right: 0,
            paddingBottom: 4, // small padding for iPhone home indicator
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
    </ProtectedRoute>
  );
}
