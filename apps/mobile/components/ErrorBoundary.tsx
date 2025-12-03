// apps/mobile/components/ErrorBoundary.tsx
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { captureException } from "@/lib/services/sentry";
import { router } from "expo-router";
import * as React from "react";
import { ScrollView, View } from "react-native";

interface Props {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetKeys?: Array<string | number>;
}

export interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary component that catches JavaScript errors anywhere in the child
 * component tree and displays a fallback UI.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary fallback={ScreenErrorFallback}>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console in development
    if (__DEV__) {
      console.error("ErrorBoundary caught an error:", error);
      console.error("Error Info:", errorInfo);
    }

    // Send error to Sentry for production tracking
    captureException(error, {
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
    });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: Props) {
    // Reset error boundary when resetKeys change
    if (
      this.state.hasError &&
      this.props.resetKeys &&
      prevProps.resetKeys &&
      !areArraysEqual(this.props.resetKeys, prevProps.resetKeys)
    ) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return (
        <FallbackComponent error={this.state.error} resetError={this.reset} />
      );
    }

    return this.props.children;
  }
}

/**
 * Default error fallback component
 */
function DefaultErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <View className="flex-1 justify-center items-center p-5 bg-background">
      <Text className="text-destructive text-2xl font-bold mb-3 text-center">
        Something went wrong
      </Text>
      <Text className="text-muted-foreground text-base mb-8 text-center">
        We're sorry, but something unexpected happened.
      </Text>

      {__DEV__ && (
        <ScrollView className="bg-muted p-4 rounded-lg mb-5 w-full max-h-48">
          <Text className="text-muted-foreground text-sm font-semibold mb-2">
            Error Details (Dev Mode):
          </Text>
          <Text className="text-muted-foreground text-xs font-mono">
            {error.message}
          </Text>
          {error.stack && (
            <Text className="text-muted-foreground text-xs font-mono mt-2">
              {error.stack}
            </Text>
          )}
        </ScrollView>
      )}

      <Button onPress={resetError} className="mb-3 w-full max-w-xs">
        <Text className="text-primary-foreground font-semibold">Try Again</Text>
      </Button>

      <Button
        variant="outline"
        onPress={() => router.replace("/")}
        className="w-full max-w-xs"
      >
        <Text className="text-foreground">Go Home</Text>
      </Button>
    </View>
  );
}

/**
 * Screen-level error fallback with full-screen layout
 */
export function ScreenErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <View className="flex-1 justify-center items-center p-6 bg-background">
      <View className="items-center max-w-md">
        <Text className="text-destructive text-3xl font-bold mb-4 text-center">
          Oops!
        </Text>
        <Text className="text-foreground text-xl font-semibold mb-2 text-center">
          Something went wrong on this screen
        </Text>
        <Text className="text-muted-foreground text-base mb-8 text-center">
          Don't worry, the rest of the app should still work. Try refreshing or
          go back.
        </Text>

        {__DEV__ && (
          <ScrollView className="bg-muted p-4 rounded-lg mb-6 w-full max-h-40">
            <Text className="text-muted-foreground text-sm font-semibold mb-2">
              Error Details (Dev Mode):
            </Text>
            <Text className="text-muted-foreground text-xs font-mono">
              {error.message}
            </Text>
            {error.stack && (
              <Text className="text-muted-foreground text-xs font-mono mt-2 opacity-70">
                {error.stack.split("\n").slice(0, 5).join("\n")}
              </Text>
            )}
          </ScrollView>
        )}

        <Button onPress={resetError} className="mb-3 w-full">
          <Text className="text-primary-foreground font-semibold">
            Refresh Screen
          </Text>
        </Button>

        <Button
          variant="outline"
          onPress={() => router.back()}
          className="w-full"
        >
          <Text className="text-foreground">Go Back</Text>
        </Button>
      </View>
    </View>
  );
}

/**
 * Modal-level error fallback with compact layout
 */
export function ModalErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <View className="flex-1 justify-center items-center p-5 bg-background">
      <View className="items-center max-w-sm">
        <Text className="text-destructive text-xl font-bold mb-2 text-center">
          Error Loading Content
        </Text>
        <Text className="text-muted-foreground text-sm mb-6 text-center">
          This content couldn't be loaded. Try again or close this modal.
        </Text>

        {__DEV__ && (
          <View className="bg-muted p-3 rounded-lg mb-4 w-full">
            <Text className="text-muted-foreground text-xs font-semibold mb-1">
              Dev Mode Error:
            </Text>
            <Text className="text-muted-foreground text-xs font-mono">
              {error.message}
            </Text>
          </View>
        )}

        <Button onPress={resetError} size="sm" className="mb-2 w-full">
          <Text className="text-primary-foreground font-semibold">
            Try Again
          </Text>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onPress={() => router.back()}
          className="w-full"
        >
          <Text className="text-muted-foreground">Close</Text>
        </Button>
      </View>
    </View>
  );
}

/**
 * Inline error fallback for smaller UI sections
 */
export function InlineErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <View className="p-4 bg-muted rounded-lg">
      <Text className="text-destructive text-sm font-semibold mb-2">
        Failed to load
      </Text>
      <Text className="text-muted-foreground text-xs mb-3">
        {__DEV__ ? error.message : "Something went wrong. Please try again."}
      </Text>
      <Button onPress={resetError} size="sm" variant="outline">
        <Text className="text-foreground text-xs">Retry</Text>
      </Button>
    </View>
  );
}

/**
 * Utility function to compare arrays for resetKeys
 */
function areArraysEqual(
  arr1: Array<string | number>,
  arr2: Array<string | number>,
): boolean {
  if (arr1.length !== arr2.length) return false;
  return arr1.every((value, index) => value === arr2[index]);
}

/**
 * Hook to programmatically throw errors (useful for testing)
 */
export function useErrorHandler(givenError?: Error | null) {
  const [error, setError] = React.useState<Error | null>(null);

  if (error) {
    throw error;
  }

  if (givenError) {
    throw givenError;
  }

  return setError;
}
