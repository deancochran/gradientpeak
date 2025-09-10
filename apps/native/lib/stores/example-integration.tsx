import React, { useEffect } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import {
    useActiveModal,
    useActiveWorkout,
    useAuth,
    useIsAuthenticated,
    useIsRecording,
    useLoading,
    useSettingsStore,
    useTheme,
    useUIStore,
    useUnits,
    useWorkoutStore,
    type WorkoutType,
} from './index';

/**
 * Example component demonstrating how to integrate the new Zustand stores
 * into your React Native components.
 */
export const ExampleIntegration: React.FC = () => {
  // Auth Store Usage
  const { signOut, loading: authLoading } = useAuth();
  const isAuthenticated = useIsAuthenticated();

  // Workout Store Usage
  const activeWorkout = useActiveWorkout();
  const isRecording = useIsRecording();
  const { startWorkout, pauseWorkout, resumeWorkout, stopWorkout } = useWorkoutStore();

  // Settings Store Usage
  const theme = useTheme();
  const units = useUnits();
  const { updateDisplaySettings } = useSettingsStore();

  // UI Store Usage
  const activeModal = useActiveModal();
  const loading = useLoading();
  const { openModal, showAlert, setLoading } = useUIStore();

  // Example: Initialize stores on component mount
  useEffect(() => {
    console.log('🏪 Example: Component mounted with stores');
  }, []);

  // Example: Handle workout actions
  const handleStartWorkout = async () => {
    try {
      setLoading('workout', true);
      await startWorkout('running', undefined, 'Morning Run');
      showAlert({
        type: 'success',
        title: 'Workout Started!',
        message: 'Your running workout has begun.',
        duration: 3000,
      });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Failed to Start Workout',
        message: 'Please try again.',
        duration: 5000,
      });
    } finally {
      setLoading('workout', false);
    }
  };

  const handlePauseResume = async () => {
    try {
      if (isRecording) {
        await pauseWorkout();
        showAlert({
          type: 'info',
          title: 'Workout Paused',
          message: 'Your workout has been paused.',
          duration: 2000,
        });
      } else {
        await resumeWorkout();
        showAlert({
          type: 'success',
          title: 'Workout Resumed',
          message: 'Your workout has been resumed.',
          duration: 2000,
        });
      }
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Action Failed',
        message: 'Unable to pause/resume workout.',
      });
    }
  };

  const handleStopWorkout = async () => {
    Alert.alert(
      'Stop Workout',
      'Are you sure you want to stop your workout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: async () => {
            try {
              await stopWorkout();
              showAlert({
                type: 'success',
                title: 'Workout Stopped',
                message: 'Your workout has been saved.',
                duration: 3000,
              });
            } catch (error) {
              showAlert({
                type: 'error',
                title: 'Failed to Stop Workout',
                message: 'Please try again.',
              });
            }
          },
        },
      ]
    );
  };

  // Example: Handle settings changes
  const handleToggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    updateDisplaySettings({ theme: newTheme });
    showAlert({
      type: 'info',
      title: 'Theme Changed',
      message: `Switched to ${newTheme} theme.`,
      duration: 2000,
    });
  };

  const handleToggleUnits = () => {
    const newUnits = units === 'metric' ? 'imperial' : 'metric';
    updateDisplaySettings({ units: newUnits });
    showAlert({
      type: 'info',
      title: 'Units Changed',
      message: `Switched to ${newUnits} units.`,
      duration: 2000,
    });
  };

  // Example: Handle authentication
  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (error) {
              showAlert({
                type: 'error',
                title: 'Sign Out Failed',
                message: 'Please try again.',
              });
            }
          },
        },
      ]
    );
  };

  // Example: Handle modal operations
  const handleOpenWorkoutSettings = () => {
    openModal('workout-settings', {
      currentWorkout: activeWorkout,
      settings: { autoLap: true, gpsAccuracy: 'high' },
    });
  };

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Please sign in to continue</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 20, backgroundColor: theme === 'dark' ? '#000' : '#fff' }}>
      <Text
        style={{
          fontSize: 24,
          fontWeight: 'bold',
          marginBottom: 20,
          color: theme === 'dark' ? '#fff' : '#000',
        }}
      >
        TurboFit Stores Example
      </Text>

      {/* Authentication Section */}
      <View style={{ marginBottom: 30 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 10, color: theme === 'dark' ? '#fff' : '#000' }}>
          🔐 Authentication
        </Text>
        <TouchableOpacity
          onPress={handleSignOut}
          disabled={authLoading}
          style={{
            backgroundColor: '#ff4444',
            padding: 15,
            borderRadius: 8,
            opacity: authLoading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
            {authLoading ? 'Signing Out...' : 'Sign Out'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Workout Section */}
      <View style={{ marginBottom: 30 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 10, color: theme === 'dark' ? '#fff' : '#000' }}>
          🏃 Workout Controls
        </Text>

        {activeWorkout ? (
          <View>
            <Text style={{ marginBottom: 10, color: theme === 'dark' ? '#ccc' : '#666' }}>
              Active: {activeWorkout.name} ({isRecording ? 'Recording' : 'Paused'})
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={handlePauseResume}
                disabled={loading.workout}
                style={{
                  backgroundColor: isRecording ? '#ff9500' : '#34c759',
                  padding: 15,
                  borderRadius: 8,
                  flex: 1,
                  opacity: loading.workout ? 0.6 : 1,
                }}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
                  {isRecording ? 'Pause' : 'Resume'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleStopWorkout}
                disabled={loading.workout}
                style={{
                  backgroundColor: '#ff3b30',
                  padding: 15,
                  borderRadius: 8,
                  flex: 1,
                  opacity: loading.workout ? 0.6 : 1,
                }}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
                  Stop
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleStartWorkout}
            disabled={loading.workout}
            style={{
              backgroundColor: '#34c759',
              padding: 15,
              borderRadius: 8,
              opacity: loading.workout ? 0.6 : 1,
            }}
          >
            <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
              {loading.workout ? 'Starting...' : 'Start Running Workout'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Settings Section */}
      <View style={{ marginBottom: 30 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 10, color: theme === 'dark' ? '#fff' : '#000' }}>
          ⚙️ Settings
        </Text>
        <Text style={{ marginBottom: 10, color: theme === 'dark' ? '#ccc' : '#666' }}>
          Current: {theme} theme, {units} units
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={handleToggleTheme}
            style={{
              backgroundColor: '#007aff',
              padding: 15,
              borderRadius: 8,
              flex: 1,
            }}
          >
            <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
              Toggle Theme
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleToggleUnits}
            style={{
              backgroundColor: '#5856d6',
              padding: 15,
              borderRadius: 8,
              flex: 1,
            }}
          >
            <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
              Toggle Units
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* UI Section */}
      <View style={{ marginBottom: 30 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 10, color: theme === 'dark' ? '#fff' : '#000' }}>
          🎨 UI Controls
        </Text>
        {activeModal && (
          <Text style={{ marginBottom: 10, color: theme === 'dark' ? '#ccc' : '#666' }}>
            Active Modal: {activeModal}
          </Text>
        )}
        <TouchableOpacity
          onPress={handleOpenWorkoutSettings}
          style={{
            backgroundColor: '#ff9500',
            padding: 15,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
            Open Workout Settings Modal
          </Text>
        </TouchableOpacity>
      </View>

      {/* Loading States */}
      {Object.entries(loading).some(([key, isLoading]) => isLoading) && (
        <View style={{ marginTop: 20 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 10, color: theme === 'dark' ? '#fff' : '#000' }}>
            ⏳ Loading States:
          </Text>
          {Object.entries(loading)
            .filter(([key, isLoading]) => isLoading)
            .map(([key, isLoading]) => (
              <Text key={key} style={{ color: theme === 'dark' ? '#ccc' : '#666' }}>
                • {key}: {isLoading ? 'Loading...' : 'Idle'}
              </Text>
            ))}
        </View>
      )}
    </View>
  );
};

/**
 * Alternative pattern: Using store actions outside of components
 * This is useful for utility functions, event handlers, or background tasks
 */
export const externalStoreActions = {
  // Quick workout start from notification or shortcut
  startQuickWorkout: async (type: WorkoutType) => {
    const { startWorkout } = useWorkoutStore.getState();
    const { showAlert } = useUIStore.getState();

    try {
      await startWorkout(type, undefined, `Quick ${type} workout`);
      showAlert({
        type: 'success',
        title: 'Quick Workout Started!',
        message: `Your ${type} workout has begun.`,
        duration: 3000,
      });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Failed to Start Workout',
        message: 'Please open the app to start your workout.',
        duration: 5000,
      });
    }
  },

  // Emergency sign out (e.g., from security screen)
  emergencySignOut: async () => {
    const { signOut } = useAuth.getState();
    const { clearActiveWorkout } = useWorkoutStore.getState();
    const { resetUIState } = useUIStore.getState();

    try {
      await signOut();
      clearActiveWorkout();
      resetUIState();
    } catch (error) {
      console.error('Emergency sign out failed:', error);
    }
  },

  // Background sync completion notification
  notifySyncComplete: (syncResult: { success: boolean; error?: string }) => {
    const { showAlert } = useUIStore.getState();
    const { setLastSyncTime } = useSettingsStore.getState();

    if (syncResult.success) {
      setLastSyncTime(new Date());
      showAlert({
        type: 'success',
        title: 'Sync Complete',
        message: 'Your data has been synchronized.',
        duration: 2000,
      });
    } else {
      showAlert({
        type: 'error',
        title: 'Sync Failed',
        message: syncResult.error || 'Unable to sync data.',
        duration: 5000,
      });
    }
  },
};
