import React from 'react'
import {
    Animated,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'

import { useColorScheme } from '@/lib/useColorScheme'
import { Stack, useRouter } from 'expo-router'

export default function VerificationSuccessScreen() {
  const router = useRouter()
  const { isDarkColorScheme } = useColorScheme()

  // Animation refs
  const fadeAnim = React.useRef(new Animated.Value(0)).current
  const slideAnim = React.useRef(new Animated.Value(30)).current
  const buttonScaleAnim = React.useRef(new Animated.Value(1)).current

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
    ]).start()
  }, [])

  const handleContinuePress = () => {
    Animated.sequence([
      Animated.timing(buttonScaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.replace('/(external)/sign-in')
    })
  }

  const backgroundColor = isDarkColorScheme ? '#000000' : '#ffffff'
  const textColor = isDarkColorScheme ? '#ffffff' : '#000000'
  const subtleColor = isDarkColorScheme ? '#666666' : '#999999'
  const successColor = isDarkColorScheme ? '#4ade80' : '#16a34a'

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerStyle: {
            backgroundColor,
          },
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor }]}
        testID="verification-success-screen"
      >
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }
          ]}
          testID="verification-success-content"
        >
          {/* Success Icon */}
          <View style={styles.iconContainer} testID="success-icon-container">
            <View
              style={[
                styles.successIcon,
                {
                  backgroundColor: successColor,
                  shadowColor: successColor,
                }
              ]}
              testID="success-icon"
            >
              <Text
                style={[styles.checkmark, { color: backgroundColor }]}
                testID="checkmark"
              >
                ✓
              </Text>
            </View>
          </View>

          {/* Success Message */}
          <View style={styles.messageContainer} testID="message-container">
            <Text
              style={[styles.title, { color: textColor }]}
              testID="success-title"
            >
              Account Verified!
            </Text>
            <Text
              style={[styles.subtitle, { color: subtleColor }]}
              testID="success-subtitle"
            >
              Welcome to TurboFit
            </Text>
            <Text
              style={[styles.description, { color: subtleColor }]}
              testID="success-description"
            >
              Your email has been verified successfully. You can now sign in to start your fitness journey.
            </Text>
          </View>

          {/* Continue Button */}
          <Animated.View
            style={[
              styles.buttonContainer,
              { transform: [{ scale: buttonScaleAnim }] }
            ]}
            testID="continue-button-container"
          >
            <TouchableOpacity
              onPress={handleContinuePress}
              style={[
                styles.continueButton,
                {
                  backgroundColor: textColor,
                  shadowColor: textColor,
                }
              ]}
              testID="continue-button"
            >
              <Text
                style={[styles.continueButtonText, { color: backgroundColor }]}
                testID="continue-button-text"
              >
                Sign In Now
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginBottom: 40,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  checkmark: {
    fontSize: 32,
    fontWeight: '900',
  },
  messageContainer: {
    alignItems: 'center',
    marginBottom: 60,
    maxWidth: 320,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400',
  },
  buttonContainer: {
    width: '100%',
  },
  continueButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
})
