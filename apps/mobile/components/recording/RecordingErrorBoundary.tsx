/**
 * RecordingErrorBoundary - Isolate zone failures to prevent full app crash
 *
 * Wraps each recording zone independently to catch and handle errors gracefully.
 * If a zone crashes, the error is isolated and recording continues uninterrupted.
 *
 * Features:
 * - Error isolation per zone
 * - User-friendly error message
 * - "Reload Zone" button to attempt recovery
 * - Recording continues even if zone fails
 * - Detailed error logging for debugging
 */

import React, { Component, ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";

export interface RecordingErrorBoundaryProps {
  children: ReactNode;
  componentName: string;
}

interface RecordingErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error boundary component for recording zones
 *
 * Usage:
 * ```tsx
 * <RecordingErrorBoundary componentName="Zone A">
 *   <ZoneA {...props} />
 * </RecordingErrorBoundary>
 * ```
 */
export class RecordingErrorBoundary extends Component<
  RecordingErrorBoundaryProps,
  RecordingErrorBoundaryState
> {
  constructor(props: RecordingErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(
    error: Error,
  ): Partial<RecordingErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error details for debugging
    console.error(
      `[RecordingErrorBoundary] ${this.props.componentName} crashed:`,
      error,
      errorInfo,
    );

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // TODO: Send error to error tracking service (e.g., Sentry)
    // Example: Sentry.captureException(error, { tags: { component: this.props.componentName } });
  }

  handleReload = (): void => {
    // Reset error state to attempt re-rendering the component
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    console.log(
      `[RecordingErrorBoundary] Reloading ${this.props.componentName}`,
    );
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Fallback UI when error occurs
      return (
        <View className="flex-1 bg-card rounded-lg border border-destructive p-6 items-center justify-center">
          <View className="mb-4">
            <Text className="text-lg font-semibold text-destructive mb-2">
              {this.props.componentName} Error
            </Text>
            <Text className="text-sm text-muted-foreground text-center mb-1">
              Something went wrong in {this.props.componentName}.
            </Text>
            <Text className="text-sm text-muted-foreground text-center">
              Your recording is still running.
            </Text>
          </View>

          {/* Error details (only in development) */}
          {__DEV__ && this.state.error && (
            <View className="bg-muted p-3 rounded mb-4 max-w-full">
              <Text className="text-xs font-mono text-destructive">
                {this.state.error.toString()}
              </Text>
              {this.state.errorInfo?.componentStack && (
                <Text className="text-xs font-mono text-muted-foreground mt-2">
                  {this.state.errorInfo.componentStack
                    .split("\n")
                    .slice(0, 3)
                    .join("\n")}
                </Text>
              )}
            </View>
          )}

          {/* Reload button */}
          <Button
            onPress={this.handleReload}
            variant="default"
            size="default"
            className="mt-2"
          >
            <Text>Reload {this.props.componentName}</Text>
          </Button>
        </View>
      );
    }

    // Normal render when no error
    return this.props.children;
  }
}

/**
 * Higher-order function to wrap components with error boundary
 *
 * @example
 * ```tsx
 * const SafeZoneA = withErrorBoundary(ZoneA, "Zone A");
 * ```
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string,
): React.ComponentType<P> {
  const WrappedComponent = (props: P) => (
    <RecordingErrorBoundary componentName={componentName}>
      <Component {...props} />
    </RecordingErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${componentName})`;
  return WrappedComponent;
}
