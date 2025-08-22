import { useColorScheme } from "@/lib/useColorScheme";
import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";
import React from "react";
import { Animated, View } from "react-native";

function AuthLoadingScreen() {
  const { isDarkColorScheme } = useColorScheme();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.9)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const backgroundColor = isDarkColorScheme ? '#000000' : '#ffffff';

  return (
    <View 
      style={{
        flex: 1,
        backgroundColor,
        justifyContent: 'center',
        alignItems: 'center',
      }}
      testID="auth-loading-screen"
    >
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        }}
        testID="auth-loading-indicator"
      >
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 16,
            backgroundColor: isDarkColorScheme ? '#ffffff' : '#000000',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              backgroundColor: backgroundColor,
            }}
          />
        </View>
      </Animated.View>
    </View>
  );
}

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const { isDarkColorScheme } = useColorScheme();

  // Show loading screen while auth state is being determined
  if (!isLoaded) {
    return <AuthLoadingScreen />;
  }

  // Redirect to home if already signed in
  if (isSignedIn) {
    return <Redirect href={"/"} />;
  }

  const backgroundColor = isDarkColorScheme ? '#000000' : '#ffffff';
  const textColor = isDarkColorScheme ? '#ffffff' : '#000000';

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor,
        },
        headerTintColor: textColor,
        headerTitleStyle: {
          fontWeight: '600',
        },
        // headerBackTitleVisible: false,
        headerShadowVisible: false,
        animation: 'slide_from_right',
      }}
    />
  );
}