// providers/AppProviders.tsx - All providers in one place
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import * as React from "react";
import { Alert } from "react-native";
import { queryClient } from "../services/queryClient";
import { createTRPCClient } from "../services/trpcClient";
import { setupFocusManager, setupNetworkListener } from "../services/reactQuerySetup";
import { trpc } from "../trpc";
import { ErrorFallback } from "../components/ErrorFallback";
import { logError } from "../services/errorTracking";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [trpcClient] = React.useState(createTRPCClient);

  React.useEffect(() => {
    const cleanupNetwork = setupNetworkListener();
    const cleanupFocus = setupFocusManager();

    // Global error handlers for React Query
    queryClient.getQueryCache().config.onError = (error) => {
      logError(error as Error, 'Query');
    };

    queryClient.getMutationCache().config.onError = (error) => {
      logError(error as Error, 'Mutation');
      if (error instanceof Error) {
        Alert.alert('Error', error.message);
      }
    };

    return () => {
      cleanupNetwork?.();
      cleanupFocus?.();
    };
  }, []);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        logError(error, 'React Error Boundary');
        console.error('Error Info:', errorInfo);
      }}
    >
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </trpc.Provider>
    </ErrorBoundary>
  );
}

// components/ErrorFallback.tsx - Global error UI
import { router } from 'expo-router';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FallbackProps } from 'react-error-boundary';

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const handleRestart = () => {
    Alert.alert(
      'Restart App',
      'This will restart the app. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restart',
          style: 'destructive',
          onPress: () => {
            resetErrorBoundary();
            router.replace('/');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.subtitle}>
        We're sorry, but something unexpected happened.
      </Text>

      {__DEV__ && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Error Details (Dev Mode):</Text>
          <Text style={styles.errorText}>{error.message}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.button} onPress={resetErrorBoundary}>
        <Text style={styles.buttonText}>Try Again</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.secondaryButton]}
        onPress={handleRestart}
      >
        <Text style={styles.secondaryButtonText}>Restart App</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 30,
  },
  errorContainer: {
    backgroundColor: '#fff3cd',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 5,
  },
  errorText: {
    fontSize: 12,
    color: '#856404',
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#2196f3',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666',
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 16,
  },
});

// services/errorTracking.ts - Centralized error logging
export const logError = (error: Error, context?: string) => {
  const errorMessage = `${context ? `[${context}] ` : ''}${error.message}`;

  if (__DEV__) {
    console.error('🚨 Error:', errorMessage);
    console.error('Stack:', error.stack);
  } else {
    // In production, send to your error tracking service
    // Examples:
    // Sentry.captureException(error, { tags: { context } });
    // crashlytics().recordError(error);
    // Bugsnag.notify(error);
    console.error('Production Error:', errorMessage);
  }
};

// hooks/useErrorHandler.ts - Reusable error handling logic
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { logError } from '../services/errorTracking';

export const useErrorHandler = () => {
  const handleError = useCallback((error: Error, context?: string) => {
    logError(error, context);

    // Handle specific error types
    if (error.message.includes('UNAUTHORIZED') || error.message.includes('401')) {
      Alert.alert(
        'Session Expired',
        'Please log in again.',
        [{ text: 'OK', onPress: () => router.push('/login') }]
      );
      return;
    }

    if (error.message.includes('NETWORK') || error.message.includes('Failed to fetch')) {
      Alert.alert(
        'Network Error',
        'Please check your connection and try again.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (error.message.includes('FORBIDDEN') || error.message.includes('403')) {
      Alert.alert(
        'Access Denied',
        'You don\'t have permission to perform this action.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Generic error fallback
    Alert.alert(
      'Error',
      error.message || 'Something went wrong. Please try again.',
      [{ text: 'OK' }]
    );
  }, []);

  const handleAsyncError = useCallback(async <T>(
    asyncFn: () => Promise<T>,
    context?: string
  ): Promise<T | null> => {
    try {
      return await asyncFn();
    } catch (error) {
      handleError(error as Error, context);
      return null;
    }
  }, [handleError]);

  return { handleError, handleAsyncError };
};

// app/_layout.tsx - Root layout implementation
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppProviders } from '../providers/AppProviders';

// Keep splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    // Hide splash screen after providers are ready
    const timer = setTimeout(() => {
      SplashScreen.hideAsync();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <AppProviders>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ title: "Profile" }} />
        <Stack.Screen name="login" options={{ title: "Login" }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </AppProviders>
  );
}

// app/+not-found.tsx - 404 handler
import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: '#2e78b7',
  },
});

// Example usage in a screen component
// app/profile.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { trpc } from '../trpc';
import { useErrorHandler } from '../hooks/useErrorHandler';

export default function ProfileScreen() {
  const { handleError, handleAsyncError } = useErrorHandler();
  const { data: user, isLoading, error } = trpc.user.getProfile.useQuery();
  const updateProfile = trpc.user.updateProfile.useMutation();

  // Handle query errors
  React.useEffect(() => {
    if (error) {
      handleError(error, 'Profile Query');
    }
  }, [error, handleError]);

  const handleUpdateProfile = async () => {
    await handleAsyncError(async () => {
      await updateProfile.mutateAsync({ name: 'New Name' });
      Alert.alert('Success', 'Profile updated!');
    }, 'Update Profile');
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {user?.name}!</Text>
      <TouchableOpacity style={styles.button} onPress={handleUpdateProfile}>
        <Text style={styles.buttonText}>Update Profile</Text>
      </TouchableOpacity>
    </View>
  );
}
