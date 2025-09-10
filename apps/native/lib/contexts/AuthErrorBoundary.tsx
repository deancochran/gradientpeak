import { useColorScheme } from '@lib/useColorScheme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface AuthErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface AuthErrorBoundaryProps {
  children: React.ReactNode;
  onRetry?: () => void;
}

export class AuthErrorBoundary extends React.Component<
  AuthErrorBoundaryProps,
  AuthErrorBoundaryState
> {
  constructor(props: AuthErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): AuthErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🚨 Auth Error Boundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return <AuthErrorFallback onRetry={this.handleRetry} error={this.state.error} />;
    }

    return this.props.children;
  }
}

function AuthErrorFallback({ onRetry, error }: { onRetry: () => void; error: Error | null }) {
  const { isDarkColorScheme } = useColorScheme();

  const backgroundColor = isDarkColorScheme ? '#000000' : '#ffffff';
  const textColor = isDarkColorScheme ? '#ffffff' : '#000000';
  const buttonColor = isDarkColorScheme ? '#ffffff' : '#000000';
  const buttonTextColor = isDarkColorScheme ? '#000000' : '#ffffff';

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Ionicons name="warning-outline" size={64} color={textColor} />
      <Text style={[styles.title, { color: textColor }]}>Authentication Error</Text>
      <Text style={[styles.message, { color: textColor }]}>
        Something went wrong with authentication. Please try again.
      </Text>
      {__DEV__ && error && (
        <Text style={[styles.errorText, { color: textColor }]}>{error.message}</Text>
      )}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: buttonColor }]}
        onPress={onRetry}
      >
        <Text style={[styles.buttonText, { color: buttonTextColor }]}>Retry</Text>
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
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 16,
    opacity: 0.7,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
