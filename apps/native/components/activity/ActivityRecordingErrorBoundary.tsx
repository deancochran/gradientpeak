import { Ionicons } from '@expo/vector-icons';
import { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onRecover?: () => void;
  fallbackComponent?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

export class ActivityRecordingErrorBoundary extends Component<Props, State> {
  private maxRetries = 3;
  private retryTimeout: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🚨 ActivityRecordingErrorBoundary caught error:', error);
    console.error('Error Info:', errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Call onError prop if provided
    this.props.onError?.(error, errorInfo);

    // Log error to crash reporting service
    this.logErrorToService(error, errorInfo);

    // Attempt automatic recovery for non-critical errors
    if (this.isRecoverableError(error) && this.state.retryCount < this.maxRetries) {
      this.attemptAutoRecovery();
    }
  }

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  private isRecoverableError = (error: Error): boolean => {
    const recoverablePatterns = [
      'Network request failed',
      'Location permission',
      'Bluetooth',
      'Sensor connection',
      'GPS timeout',
      'Permission denied',
    ];

    return recoverablePatterns.some(pattern =>
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  };

  private attemptAutoRecovery = () => {
    console.log('🔄 Attempting automatic recovery...');

    this.retryTimeout = setTimeout(() => {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prevState.retryCount + 1,
      }));

      this.props.onRecover?.();
    }, 2000); // 2-second delay before retry
  };

  private handleManualRetry = () => {
    console.log('🔄 Manual retry initiated');

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    });

    this.props.onRecover?.();
  };

  private handleReportError = () => {
    const { error, errorInfo } = this.state;

    Alert.alert(
      'Report Error',
      'Would you like to report this error to help improve the app?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          onPress: () => {
            console.log('📊 Error reported by user');
            // Here you would implement error reporting to your service
            Alert.alert('Thank you', 'Error report sent successfully.');
          },
        },
      ]
    );
  };

  private logErrorToService = (error: Error, errorInfo: ErrorInfo) => {
    // In a real app, you'd send this to a crash reporting service
    // like Crashlytics, Sentry, or Bugsnag
    console.log('📊 Logging error to service:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });
  };

  private getErrorSeverity = (error: Error): 'low' | 'medium' | 'high' => {
    if (error.message.includes('permission') || error.message.includes('bluetooth')) {
      return 'medium';
    }
    if (error.message.includes('crash') || error.message.includes('fatal')) {
      return 'high';
    }
    return 'low';
  };

  private getErrorMessage = (error: Error): string => {
    if (error.message.includes('permission')) {
      return 'Permission access needed to continue recording.';
    }
    if (error.message.includes('bluetooth') || error.message.includes('sensor')) {
      return 'Sensor connection lost. Check your device connections.';
    }
    if (error.message.includes('network') || error.message.includes('sync')) {
      return 'Network connection issue. Your data is saved locally.';
    }
    if (error.message.includes('gps') || error.message.includes('location')) {
      return 'GPS signal lost. Move to an area with better reception.';
    }
    return 'An unexpected error occurred during activity recording.';
  };

  private getErrorIcon = (error: Error): keyof typeof Ionicons.glyphMap => {
    if (error.message.includes('permission')) return 'lock-closed-outline';
    if (error.message.includes('bluetooth')) return 'bluetooth-outline';
    if (error.message.includes('network')) return 'wifi-outline';
    if (error.message.includes('gps')) return 'location-outline';
    return 'alert-circle-outline';
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Custom fallback component if provided
      if (this.props.fallbackComponent) {
        return this.props.fallbackComponent;
      }

      const severity = this.getErrorSeverity(this.state.error);
      const errorMessage = this.getErrorMessage(this.state.error);
      const errorIcon = this.getErrorIcon(this.state.error);

      return (
        <View style={[styles.container, styles[`${severity}Severity`]]}>
          <View style={styles.errorContent}>
            <View style={styles.iconContainer}>
              <Ionicons
                name={errorIcon}
                size={48}
                color={severity === 'high' ? '#ef4444' : '#f59e0b'}
              />
            </View>

            <Text style={styles.errorTitle}>
              {severity === 'high' ? 'Critical Error' : 'Recording Issue'}
            </Text>

            <Text style={styles.errorMessage}>
              {errorMessage}
            </Text>

            {severity === 'low' && (
              <Text style={styles.errorDetails}>
                Don't worry - your recording data is safe and will be automatically saved.
              </Text>
            )}

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.retryButton]}
                onPress={this.handleManualRetry}
              >
                <Ionicons name="refresh" size={20} color="#ffffff" />
                <Text style={styles.buttonText}>Try Again</Text>
              </TouchableOpacity>

              {this.state.retryCount < this.maxRetries && (
                <TouchableOpacity
                  style={[styles.button, styles.reportButton]}
                  onPress={this.handleReportError}
                >
                  <Ionicons name="bug-outline" size={20} color="#6b7280" />
                  <Text style={[styles.buttonText, { color: '#6b7280' }]}>
                    Report Issue
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {this.state.retryCount > 0 && (
              <Text style={styles.retryInfo}>
                Retry attempt {this.state.retryCount} of {this.maxRetries}
              </Text>
            )}

            {__DEV__ && (
              <View style={styles.debugInfo}>
                <Text style={styles.debugTitle}>Debug Info:</Text>
                <Text style={styles.debugText}>
                  {this.state.error.message}
                </Text>
                <Text style={styles.debugText} numberOfLines={3}>
                  {this.state.error.stack}
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8fafc',
  },
  lowSeverity: {
    backgroundColor: '#fef3c7',
  },
  mediumSeverity: {
    backgroundColor: '#fed7aa',
  },
  highSeverity: {
    backgroundColor: '#fecaca',
  },
  errorContent: {
    alignItems: 'center',
    maxWidth: 320,
  },
  iconContainer: {
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 24,
  },
  errorDetails: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
  },
  retryButton: {
    backgroundColor: '#3b82f6',
  },
  reportButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  retryInfo: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 12,
    textAlign: 'center',
  },
  debugInfo: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    width: '100%',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#6b7280',
    marginBottom: 4,
  },
});
