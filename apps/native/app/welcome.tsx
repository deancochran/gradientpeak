import { useRouter } from 'expo-router';
import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/ThemedView';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Marketing Hero Section */}
      <View style={styles.heroSection}>
        <View style={styles.heroContainer}>
          <View style={styles.logoContainer}>
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoText}>TurboFit</Text>
            </View>
          </View>
          
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>
              Track Your Fitness Journey
            </Text>
            <Text style={styles.heroSubtitle}>
              Record workouts, monitor progress, and achieve your fitness goals with our comprehensive tracking app.
            </Text>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionSection}>
        <View style={styles.buttonContainer}>
          <Button 
            variant="default" 
            size="lg" 
            style={styles.primaryButton}
            onPress={() => router.replace("/(auth)/sign-in")}
          >
            <Text style={styles.primaryButtonText}>Login</Text>
          </Button>
          
          <Button 
            variant="outline" 
            size="lg" 
            style={styles.secondaryButton}
            onPress={() => router.replace("/(auth)/sign-up")}
          >
            <Text style={styles.secondaryButtonText}>Sign Up</Text>
          </Button>
        </View>
        
        <View style={styles.footerText}>
          <Text style={styles.termsText}>
            By continuing, you agree to our Terms of Service and Privacy Policy
          </Text>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  heroSection: {
    flex: 3,
    position: 'relative',
  },
  heroContainer: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 32,
    justifyContent: 'space-between',
    paddingBottom: 40,
    backgroundColor: '#667eea',
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  logoText: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
    textAlign: 'center',
  },
  heroContent: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: 'white',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 38,
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 280,
  },
  actionSection: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 40,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  buttonContainer: {
    gap: 16,
  },
  primaryButton: {
    height: 56,
    backgroundColor: '#667eea',
    borderRadius: 16,
    shadowColor: '#667eea',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
  },
  secondaryButton: {
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#667eea',
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#667eea',
  },
  footerText: {
    alignItems: 'center',
  },
  termsText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
});