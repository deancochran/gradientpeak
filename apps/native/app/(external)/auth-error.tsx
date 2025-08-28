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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'

export default function AuthErrorScreen() {
  const router = useRouter()
  const { isDarkColorScheme } = useColorScheme()
  const params = useLocalSearchParams<{ error?: string }>()

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

  const handleTryAgainPress = () => {
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

  const handleGoBackPress = () => {
    router.replace('/welcome')
  }

  const backgroundColor = isDarkColorScheme ? '#000000' : '#ffffff'
  const textColor = isDarkColorScheme ? '#ffffff' : '#000000'
  const subtleColor = isDarkColorScheme ? '#666666' : '#999999'
  const errorColor = isDarkColorScheme ? '#ff6b6b' : '#dc3545'
  const borderColor = isDarkColorScheme ? '#333333' : '#e5e5e5'

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
        testID="auth-error-screen"
      >
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }
          ]}
          testID="auth-error-content"
        >
          {/* Error Icon */}
          <View style={styles.iconContainer} testID="error-icon-container">
            <View
              style={[
                styles.errorIcon,
                {
                  borderColor: errorColor,
                  backgroundColor: 'transparent',
                }
              ]}
              testID="error-icon"
            >
              <Text
                style={[styles.errorSymbol, { color: errorColor }]}
                testID="error-symbol"
              >
                !
              </Text>
            </View>
          </View>

          {/* Error Message */}
          <View style={styles.messageContainer} testID="message-container">
            <Text
              style={[styles.title, { color: textColor }]}
              testID="error-title"
            >
              Sorry, something went wrong.
            </Text>

            {params?.error ? (
              <View style={styles.errorDetailsContainer} testID="error-details">
                <Text
                  style={[styles.errorLabel, { color: subtleColor }]}
                  testID="error-label"
                >
                  Error details:
                </Text>
                <View
                  style={[styles.errorBox, { borderColor: borderColor, backgroundColor: isDarkColorScheme ? '#1a1a1a' : '#f8f9fa' }]}
                  testID="error-box"
                >
                  <Text
                    style={[styles.errorText, { color: errorColor }]}
                    testID="error-message"
                  >
                    {params.error}
                  </Text>
                </View>
              </View>
            ) : (
              <Text
                style={[styles.description, { color: subtleColor }]}
                testID="generic-error-description"
              >
                An unspecified error occurred. Please try again.
              </Text>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonsContainer} testID="buttons-container">
            <Animated.View
              style={[
                styles.buttonContainer,
                { transform: [{ scale: buttonScaleAnim }] }
              ]}
              testID="try-again-button-container"
            >
              <TouchableOpacity
                onPress={handleTryAgainPress}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: textColor,
                    shadowColor: textColor,
                  }
                ]}
                testID="try-again-button"
              >
                <Text
                  style={[styles.primaryButtonText, { color: backgroundColor }]}
                  testID="try-again-button-text"
                >
                  Try Again
                </Text>
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity
              onPress={handleGoBackPress}
              style={[
                styles.secondaryButton,
                { borderColor }
              ]}
              testID="go-back-button"
            >
              <Text
                style={[styles.secondaryButtonText, { color: textColor }]}
                testID="go-back-button-text"
              >
                Go Back to Welcome
              </Text>
            </TouchableOpacity>
          </View>
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
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorSymbol: {
    fontSize: 36,
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
    marginBottom: 20,
    letterSpacing: -1,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400',
  },
  errorDetailsContainer: {
    width: '100%',
    alignItems: 'flex-start',
  },
  errorLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorBox: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  buttonsContainer: {
    width: '100%',
    gap: 16,
  },
  buttonContainer: {
    width: '100%',
  },
  primaryButton: {
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
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  secondaryButton: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
})
