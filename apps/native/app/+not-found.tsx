import { Link, Stack } from "expo-router";
import React from "react";
import { Animated, StyleSheet, TouchableOpacity, View } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useColorScheme } from "@/lib/useColorScheme";

export default function NotFoundScreen() {
  const { isDarkColorScheme } = useColorScheme();
  
  // Animation refs
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(30)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.9)).current;
  const bounceAnim = React.useRef(new Animated.Value(0)).current;
  const buttonPressAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    // Entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
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

    // Subtle bounce animation for the 404 number
    const bounceAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    
    setTimeout(() => bounceAnimation.start(), 1000);
    
    return () => bounceAnimation.stop();
  }, []);

  const handleHomePress = () => {
    Animated.sequence([
      Animated.timing(buttonPressAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonPressAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const backgroundColor = isDarkColorScheme ? '#000000' : '#ffffff';
  const textColor = isDarkColorScheme ? '#ffffff' : '#000000';
  const subtleColor = isDarkColorScheme ? '#666666' : '#999999';
  const accentColor = isDarkColorScheme ? '#ffffff' : '#000000';

  const bounceTransform = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -5],
  });

  return (
    <>
      <Stack.Screen 
        options={{ 
          title: "Page Not Found",
          headerStyle: {
            backgroundColor: backgroundColor,
          },
          headerTintColor: textColor,
          headerTitleStyle: {
            fontWeight: '600',
          },
        }} 
      />
      <ThemedView 
        style={[styles.container, { backgroundColor }]}
        testID="not-found-screen"
      >
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [
                { translateY: slideAnim },
                { scale: scaleAnim }
              ],
            }
          ]}
          testID="not-found-content"
        >
          {/* 404 Visual */}
          <Animated.View 
            style={[
              styles.errorContainer,
              {
                transform: [{ translateY: bounceTransform }]
              }
            ]}
            testID="error-visual"
          >
            <View 
              style={[
                styles.errorNumber,
                { 
                  borderColor: subtleColor,
                }
              ]}
              testID="error-number"
            >
              <ThemedText 
                style={[
                  styles.fourZeroFour,
                  { color: textColor }
                ]}
                testID="404-text"
              >
                404
              </ThemedText>
            </View>
          </Animated.View>

          {/* Error Message */}
          <View style={styles.messageContainer} testID="message-container">
            <ThemedText 
              style={[styles.title, { color: textColor }]}
              testID="error-title"
            >
              Page Not Found
            </ThemedText>
            <ThemedText 
              style={[styles.subtitle, { color: subtleColor }]}
              testID="error-subtitle"
            >
              The page you're looking for doesn't exist.{'\n'}
              Let's get you back on track.
            </ThemedText>
          </View>

          {/* Home Button */}
          <Animated.View
            style={[
              styles.buttonContainer,
              {
                transform: [{ scale: buttonPressAnim }]
              }
            ]}
            testID="home-button-container"
          >
            <Link 
              href="/" 
              asChild
              testID="home-link"
            >
              <TouchableOpacity
                onPress={handleHomePress}
                style={[
                  styles.homeButton,
                  { 
                    backgroundColor: accentColor,
                    shadowColor: accentColor,
                  }
                ]}
                activeOpacity={0.9}
                testID="home-button"
              >
                <ThemedText 
                  style={[
                    styles.homeButtonText,
                    { color: backgroundColor }
                  ]}
                  testID="home-button-text"
                >
                  Go Home
                </ThemedText>
              </TouchableOpacity>
            </Link>
          </Animated.View>
        </Animated.View>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  errorContainer: {
    marginBottom: 40,
  },
  errorNumber: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fourZeroFour: {
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: -2,
  },
  messageContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
    fontWeight: '400',
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 280,
  },
  homeButton: {
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  homeButtonText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});