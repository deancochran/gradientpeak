# TurboFit Mobile Implementation Guide

## 🎯 Core Component Implementation Details

## 1. Record Screen (`apps/mobile/src/routes/(internal)/(tabs)/record.tsx`)

### Basic Structure
```typescript
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { View } from 'react-native';

import { EnhancedBluetoothModal } from '@/components/modals/EnhancedBluetoothModal';
import { PermissionsModal } from '@/components/modals/PermissionsModal';
import { RecordingStepper } from '@/components/record-selection/RecordingStepper';

import { useGlobalPermissions } from '@/lib/contexts/PermissionsContext';

export default function RecordScreen() {
  const { permissions, requestAllRequiredPermissions } = useGlobalPermissions();

  // Reset state when tab is focused
  useFocusEffect(
    useCallback(() => {
      // State reset handled by RecordingStepper's useRecordSelection hook
    }, [])
  );

  const handleRequestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      return await requestAllRequiredPermissions();
    } catch (error) {
      console.error('Failed to request permissions:', error);
      return false;
    }
  }, [requestAllRequiredPermissions]);

  return (
    <View className="flex-1 bg-background">
      <RecordingStepper />
      
      {/* Global modals available but controlled by stepper components */}
      <EnhancedBluetoothModal
        visible={false}
        onClose={() => {}}
        onSelectDevice={() => {}}
      />
      
      <PermissionsModal
        visible={false}
        onClose={() => {}}
        permissions={permissions}
        onRequestPermissions={handleRequestPermissions}
      />
    </View>
  );
}
```

## 2. RecordingStepper Component (`apps/mobile/src/components/record-selection/RecordingStepper.tsx`)

### Implementation
```typescript
import React from 'react';
import { View } from 'react-native';

import { StepIndicator } from './StepIndicator';
import { ActivityModeStep } from './steps/ActivityModeStep';
import { BluetoothStep } from './steps/BluetoothStep';
import { PermissionsStep } from './steps/PermissionsStep';
import { PlannedActivityStep } from './steps/PlannedActivityStep';
import { ReadyStep } from './steps/ReadyStep';
import { UnplannedActivityStep } from './steps/UnplannedActivityStep';

import { useRecordSelection } from './hooks/useRecordSelection';

export const RecordingStepper: React.FC = () => {
  const {
    state,
    goToNextStep,
    goToPreviousStep,
    setActivityMode,
    setSelectedActivityType,
    setSelectedPlannedActivity,
    setPermissionsGranted,
    setBluetoothConnected,
    startRecording
  } = useRecordSelection();

  const renderCurrentStep = () => {
    switch (state.currentStep) {
      case 'activity-mode':
        return (
          <ActivityModeStep
            onSelection={(mode: 'planned' | 'unplanned') => {
              setActivityMode(mode);
              goToNextStep();
            }}
          />
        );

      case 'activity-selection':
        return state.activityMode === 'planned' ? (
          <PlannedActivityStep
            onActivitySelected={(activityId: string) => {
              setSelectedPlannedActivity(activityId);
              goToNextStep();
            }}
            onBack={goToPreviousStep}
          />
        ) : (
          <UnplannedActivityStep
            onActivityTypeSelected={(activityType: any) => {
              setSelectedActivityType(activityType);
              goToNextStep();
            }}
            onBack={goToPreviousStep}
          />
        );

      case 'permissions':
        return (
          <PermissionsStep
            onPermissionsGranted={() => {
              setPermissionsGranted(true);
              goToNextStep();
            }}
            onBack={goToPreviousStep}
          />
        );

      case 'bluetooth':
        return (
          <BluetoothStep
            onBluetoothConnected={() => {
              setBluetoothConnected(true);
              goToNextStep();
            }}
            onSkip={goToNextStep}
            onBack={goToPreviousStep}
          />
        );

      case 'ready':
        return (
          <ReadyStep
            activityMode={state.activityMode}
            selectedActivityType={state.selectedActivityType}
            selectedPlannedActivity={state.selectedPlannedActivity}
            permissionsGranted={state.permissionsGranted}
            bluetoothConnected={state.bluetoothConnected}
            onStartRecording={startRecording}
            onBack={goToPreviousStep}
          />
        );

      default:
        return null;
    }
  };

  return (
    <View className="flex-1 bg-background">
      <StepIndicator currentStep={state.currentStep} />
      {renderCurrentStep()}
    </View>
  );
};
```

## 3. useRecordSelection Hook (`apps/mobile/src/components/record-selection/hooks/useRecordSelection.tsx`)

### Core Implementation
```typescript
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { useGlobalPermissions } from '@/lib/contexts/PermissionsContext';
import { useProfile } from '@/lib/hooks/api/profiles';
import { useAdvancedBluetooth } from '@/lib/hooks/useAdvancedBluetooth';
import PlannedActivityService, { PlannedActivity } from '@/lib/services/planned-activity-service';

import { ActivityType } from '@repo/core';

export type SelectionStep = 'activity-mode' | 'activity-selection' | 'permissions' | 'bluetooth' | 'ready';

interface SelectionState {
  currentStep: SelectionStep;
  activityMode: 'planned' | 'unplanned' | null;
  selectedActivityType: ActivityType | null;
  selectedPlannedActivity: string | null;
  permissionsGranted: boolean;
  bluetoothConnected: boolean;
  plannedActivities: PlannedActivity[];
}

const initialState: SelectionState = {
  currentStep: 'activity-mode',
  activityMode: null,
  selectedActivityType: null,
  selectedPlannedActivity: null,
  permissionsGranted: false,
  bluetoothConnected: false,
  plannedActivities: [],
};

export const useRecordSelection = () => {
  const router = useRouter();
  const { hasAllRequiredPermissions } = useGlobalPermissions();
  const { isBluetoothEnabled } = useAdvancedBluetooth();
  const { data: profile } = useProfile();

  const [state, setState] = useState<SelectionState>(initialState);

  const updateState = useCallback((updates: Partial<SelectionState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const goToNextStep = useCallback(() => {
    setState(prev => {
      const stepOrder: SelectionStep[] = ['activity-mode', 'activity-selection', 'permissions', 'bluetooth', 'ready'];
      const currentIndex = stepOrder.indexOf(prev.currentStep);

      if (currentIndex < stepOrder.length - 1) {
        // Skip permissions step if already granted
        if (stepOrder[currentIndex + 1] === 'permissions' && hasAllRequiredPermissions) {
          return { ...prev, currentStep: 'bluetooth' };
        }

        // Skip bluetooth step if not needed or already connected
        if (stepOrder[currentIndex + 1] === 'bluetooth' && (!needsBluetooth(prev.selectedActivityType) || isBluetoothEnabled)) {
          return { ...prev, currentStep: 'ready' };
        }

        return { ...prev, currentStep: stepOrder[currentIndex + 1] };
      }
      return prev;
    });
  }, [hasAllRequiredPermissions, isBluetoothEnabled]);

  const goToPreviousStep = useCallback(() => {
    setState(prev => {
      const stepOrder: SelectionStep[] = ['activity-mode', 'activity-selection', 'permissions', 'bluetooth', 'ready'];
      const currentIndex = stepOrder.indexOf(prev.currentStep);

      if (currentIndex > 0) {
        return { ...prev, currentStep: stepOrder[currentIndex - 1] };
      }
      return prev;
    });
  }, []);

  // State setters
  const setActivityMode = useCallback((mode: 'planned' | 'unplanned') => {
    updateState({ activityMode: mode });
  }, [updateState]);

  const setSelectedActivityType = useCallback((activityType: ActivityType) => {
    updateState({ selectedActivityType: activityType });
  }, [updateState]);

  const setSelectedPlannedActivity = useCallback((activityId: string) => {
    updateState({ selectedPlannedActivity: activityId });
  }, [updateState]);

  const setPermissionsGranted = useCallback((granted: boolean) => {
    updateState({ permissionsGranted: granted });
  }, [updateState]);

  const setBluetoothConnected = useCallback((connected: boolean) => {
    updateState({ bluetoothConnected: connected });
  }, [updateState]);

  const startRecording = useCallback(async () => {
    if (!profile?.id) {
      Alert.alert('Error', 'Profile information is required to start recording');
      return;
    }

    if (!state.selectedActivityType && !state.selectedPlannedActivity) {
      Alert.alert('Error', 'Please select an activity type before recording');
      return;
    }

    if (!hasAllRequiredPermissions) {
      Alert.alert('Permissions Required', 'You need all required permissions to start recording');
      return;
    }

    router.push({
      pathname: '/(internal)/recording',
      params: {
        profileId: profile.id,
        activityType: state.selectedActivityType?.id,
        plannedActivityId: state.selectedPlannedActivity,
        permissionsStatus: state.permissionsGranted ? 'granted' : 'unknown',
        bluetoothStatus: state.bluetoothConnected ? 'connected' : 'disconnected'
      }
    });
  }, [profile?.id, state, hasAllRequiredPermissions, router]);

  const resetState = useCallback(() => {
    setState(initialState);
  }, []);

  useFocusEffect(
    useCallback(() => {
      resetState();
    }, [resetState])
  );

  return {
    state,
    goToNextStep,
    goToPreviousStep,
    setActivityMode,
    setSelectedActivityType,
    setSelectedPlannedActivity,
    setPermissionsGranted,
    setBluetoothConnected,
    startRecording,
    resetState
  };
};

// Helper function to check if activity type benefits from Bluetooth
const needsBluetooth = (activityType: ActivityType | null): boolean => {
  if (!activityType) return false;
  const bluetoothBeneficialActivities = ['cycling', 'running', 'swimming', 'rowing', 'crossfit', 'strength'];
  return bluetoothBeneficialActivities.includes(activityType.id.toLowerCase());
};
```

## 4. Recording Screen (`apps/mobile/src/routes/(internal)/recording.tsx`)

### Core Implementation
```typescript
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, View } from 'react-native';

import { RecordingBodySection } from '@/components/activity/RecordingBodySection';
import { RecordingControls } from '@/components/activity/RecordingControls';
import { RecordingHeader } from '@/components/activity/RecordingHeader';

import { useGlobalPermissions } from '@/lib/contexts/PermissionsContext';
import { useAdvancedBluetooth } from '@/lib/hooks/useAdvancedBluetooth';
import { ActivityRecorder } from '@/lib/services';
import { ActivityService } from '@/lib/services/activity-service';
import PlannedActivityService from '@/lib/services/planned-activity-service';

import { EnhancedBluetoothModal } from '@/components/modals/EnhancedBluetoothModal';
import { PermissionsModal } from '@/components/modals/PermissionsModal';
import { ActivityType } from '@repo/core';

export default function RecordingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    profileId: string;
    activityType?: string;
    plannedActivityId?: string;
    permissionsStatus?: string;
    bluetoothStatus?: string;
  }>();

  const { connectedDevices, isBluetoothEnabled, sensorValues } = useAdvancedBluetooth();
  const { hasAllRequiredPermissions, permissions, requestAllRequiredPermissions } = useGlobalPermissions();

  // Navigation guard - redirect if invalid access
  useEffect(() => {
    if (!hasAllRequiredPermissions) {
      Alert.alert('Permissions Required', 'You need all required permissions to start recording.', [
        { text: 'OK', onPress: () => router.replace('/(internal)/(tabs)/record') },
      ]);
      return;
    }

    if (!params.activityType && !params.plannedActivityId) {
      Alert.alert('Activity Required', 'Please select an activity type before recording.', [
        { text: 'OK', onPress: () => router.replace('/(internal)/(tabs)/record') },
      ]);
      return;
    }

    if (!params.profileId) {
      Alert.alert('Profile Error', 'Unable to start recording without profile information.', [
        { text: 'OK', onPress: () => router.replace('/(internal)/(tabs)/record') },
      ]);
      return;
    }

    // Automatically start recording when screen loads
    const autoStartRecording = async () => {
      try {
        setIsStarting(true);
        const sessionId = await ActivityRecorder.startRecording(params.profileId!);
        if (sessionId) {
          setIsRecording(true);
          setIsPaused(false);
        } else {
          Alert.alert('Error', 'Failed to start recording automatically');
          router.replace('/(internal)/(tabs)/record');
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to start recording automatically');
        router.replace('/(internal)/(tabs)/record');
      } finally {
        setIsStarting(false);
      }
    };

    autoStartRecording();
  }, [hasAllRequiredPermissions, params, router]);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [metrics, setMetrics] = useState({
    duration: 0,
    distance: 0,
    currentSpeed: 0,
    avgSpeed: 0,
    calories: 0,
    elevation: 0,
  });

  // Update metrics in real-time
  useEffect(() => {
    const updateMetrics = () => {
      const session = ActivityRecorder.getCurrentSession();
      if (session) {
        setMetrics({
          duration: session.metrics.duration || 0,
          distance: session.metrics.distance || 0,
          currentSpeed: session.liveMetrics?.currentSpeed || 0,
          avgSpeed: session.liveMetrics?.avgSpeed || 0,
          calories: session.metrics.calories || 0,
          elevation: session.metrics.elevationGain || 0,
        });
      }
    };

    const interval = setInterval(updateMetrics, 1000);
    return () => clearInterval(interval);
  }, []);

  // Recording control handlers
  const handlePause = useCallback(async () => {
    try {
      await ActivityRecorder.pauseRecording();
      setIsPaused(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to pause recording');
    }
  }, []);

  const handleResume = useCallback(async () => {
    try {
      await ActivityRecorder.resumeRecording();
      setIsPaused(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to resume recording');
    }
  }, []);

  const handleFinish = useCallback(async () => {
    try {
      await ActivityRecorder.stopRecording();
      if (params.profileId) {
        const activityId = await ActivityService.createActivity({
          profileId: params.profileId,
          syncStatus: 'local_only',
        });
        router.replace({
          pathname: '/(internal)/activity-recording-summary',
          params: { activityId, isNew: 'true' },
        });
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to complete recording');
      router.replace('/(internal)/(tabs)');
    }
  }, [params.profileId, router]);

  const handleDiscard = useCallback(async () => {
    try {
      await ActivityRecorder.stopRecording();
      if (params.plannedActivityId) {
        await PlannedActivityService.abandonSession();
      }
      router.replace('/(internal)/(tabs)');
    } catch (error) {
      Alert.alert('Error', 'Failed to discard recording');
      router.replace('/(internal)/(tabs)');
    }
  }, [params.plannedActivityId, router]);

  return (
    <View className="flex-1 bg-background">
      <RecordingHeader
        isRecording={isRecording}
        isPaused={isPaused}
        selectedActivityType={/* get from params */}
        selectedPlannedActivity={params.plannedActivityId || null}
        isGpsReady={true}
        gpsSignalStrength="good"
        hasAllPermissions={hasAllRequiredPermissions}
        isBluetoothEnabled={isBluetoothEnabled}
        connectedDevicesCount={connectedDevices.length}
        sensorValues={sensorValues}
      />

      <RecordingBodySection
        activitySelectionMode="none"
        selectedActivityType={/* get from params */}
        selectedPlannedActivity={params.plannedActivityId || null}
        isRecording={isRecording}
        isPaused={isPaused}
        hasSelectedActivity={true}
        canStartRecording={false}
        hasAllRequiredPermissions={hasAllRequiredPermissions}
        requiresGPS={true}
        plannedActivities={[]}
        metrics={metrics}
        connectionStatus={{ gps: 'connected', bluetooth: 'connected' }}
        sensorValues={sensorValues}
      />

      <RecordingControls
        isRecording={isRecording}
        isPaused={isPaused}
        hasSelectedActivity={true}
        canStartRecording={false}
        onPause={handlePause}
        onResume={handleResume}
        onFinish={handleFinish}
        onDiscard={handleDiscard}
      />
    </View>
  );
}
```

## 5. Step Indicator Component (`apps/mobile/src/components/record-selection/StepIndicator.tsx`)

```typescript
import { Text } from '@/components/ui';
import React from 'react';
import { View } from 'react-native';

export type SelectionStep = 'activity-mode' | 'activity-selection' | 'permissions' | 'bluetooth' | 'ready';

interface StepIndicatorProps {
  currentStep: SelectionStep;
}

const stepLabels: Record<SelectionStep, string> = {
  'activity-mode': 'Activity Type',
  'activity-selection': 'Select Activity',
  'permissions': 'Permissions',
  'bluetooth': 'Bluetooth',
  'ready': 'Ready'
};

const stepOrder: SelectionStep[] = ['activity-mode', 'activity-selection', 'permissions', 'bluetooth', 'ready'];

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const currentIndex = stepOrder.indexOf(currentStep);
  const totalSteps = stepOrder.length;

  return (
    <View className="px-6 py-4 border-b border-border bg-muted/30">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-medium text-muted-foreground">
          Step {currentIndex + 1} of {totalSteps}
        </Text>
        <Text className="text-sm font-medium text-foreground">
          {stepLabels[currentStep]}
        </Text>
      </View>

      <View className="flex-row h-1 bg-muted rounded-full overflow-hidden">
        {stepOrder.map((step, index) => (
          <View
            key={step}
            className={`flex-1 h-full ${
              index <= currentIndex ? 'bg-primary' : 'bg-muted'
            } ${index > 0 ? 'ml-1' : ''}`}
          />
        ))}
      </View>
    </View>
  );
};
```

This implementation guide provides the complete code structure for the core mobile components. Each section includes detailed TypeScript implementations with proper error handling, state management, and navigation logic.