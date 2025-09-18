# TurboFit Mobile Component Reference Guide

## 📱 Core Screen Structure

### Tab Navigation Layout
```typescript
// routes/(internal)/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { Icon } from '@/components/ui/icon';
import { Home, Activity, TrendingUp, Settings } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'hsl(var(--background))',
          borderTopColor: 'hsl(var(--border))',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Icon as={Home} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: 'Record',
          tabBarIcon: ({ color, size }) => <Icon as={Activity} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="activities"
        options={{
          title: 'Activities',
          tabBarIcon: ({ color, size }) => <Icon as={List} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="trends"
        options={{
          title: 'Trends',
          tabBarIcon: ({ color, size }) => <Icon as={TrendingUp} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Icon as={Settings} size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

### Home Screen Structure
```typescript
// routes/(internal)/(tabs)/index.tsx
import { View, ScrollView } from 'react-native';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Plus, Calendar, ChevronUp } from 'lucide-react-native';

export default function HomeScreen() {
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-5">
        {/* Welcome Header */}
        <View className="mb-6">
          <Text className="text-muted-foreground">Welcome back,</Text>
          <Text className="text-2xl font-bold text-foreground">User Name</Text>
        </View>

        {/* Quick Actions */}
        <View className="mb-6 gap-3">
          <Button variant="default" size="lg" onPress={() => {}}>
            <Icon as={Plus} />
            <Text className="text-lg font-semibold">Start Activity</Text>
          </Button>
          
          <View className="flex-row gap-3">
            <Button variant="outline" size="default" className="flex-1" onPress={() => {}}>
              <Icon as={Calendar} />
              <Text className="mt-1 text-sm font-medium">Plan</Text>
            </Button>
            <Button variant="outline" size="default" className="flex-1" onPress={() => {}}>
              <Icon as={ChevronUp} />
              <Text className="mt-1 text-sm font-medium">Trends</Text>
            </Button>
          </View>
        </View>

        {/* Recent Activities */}
        <Card className="p-4">
          <Text className="text-lg font-semibold mb-3">Recent Activities</Text>
          {/* Activity list items */}
        </Card>
      </View>
    </ScrollView>
  );
}
```

## 🎯 Record Screen Components

### Record Screen with Stepper
```typescript
// routes/(internal)/(tabs)/record.tsx
import { View } from 'react-native';
import { useRecordSelection } from '@/hooks/useRecordSelection';
import { StepIndicator } from '@/components/record-selection/StepIndicator';
import { ActivityModeStep } from '@/components/record-selection/steps/ActivityModeStep';
import { ActivitySelectionStep } from '@/components/record-selection/steps/ActivitySelectionStep';
import { PermissionsStep } from '@/components/record-selection/steps/PermissionsStep';
import { BluetoothStep } from '@/components/record-selection/steps/BluetoothStep';
import { ReadyStep } from '@/components/record-selection/steps/ReadyStep';

export default function RecordScreen() {
  const { state, goToNextStep, goToPreviousStep } = useRecordSelection();

  const renderCurrentStep = () => {
    switch (state.currentStep) {
      case 'activity-mode':
        return <ActivityModeStep onNext={goToNextStep} />;
      case 'activity-selection':
        return <ActivitySelectionStep onNext={goToNextStep} onBack={goToPreviousStep} />;
      case 'permissions':
        return <PermissionsStep onNext={goToNextStep} onBack={goToPreviousStep} />;
      case 'bluetooth':
        return <BluetoothStep onNext={goToNextStep} onBack={goToPreviousStep} />;
      case 'ready':
        return <ReadyStep onStartRecording={startRecording} onBack={goToPreviousStep} />;
    }
  };

  return (
    <View className="flex-1 bg-background">
      <StepIndicator currentStep={state.currentStep} />
      {renderCurrentStep()}
    </View>
  );
}
```

### useRecordSelection Hook
```typescript
// hooks/useRecordSelection.ts
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { ActivityType } from '@repo/core';

type SelectionStep = 'activity-mode' | 'activity-selection' | 'permissions' | 'bluetooth' | 'ready';

interface SelectionState {
  currentStep: SelectionStep;
  activityMode: 'planned' | 'unplanned' | null;
  selectedActivityType: ActivityType | null;
  selectedPlannedActivity: string | null;
  permissionsGranted: boolean;
  bluetoothConnected: boolean;
}

export const useRecordSelection = () => {
  const [state, setState] = useState<SelectionState>({
    currentStep: 'activity-mode',
    activityMode: null,
    selectedActivityType: null,
    selectedPlannedActivity: null,
    permissionsGranted: false,
    bluetoothConnected: false,
  });

  const router = useRouter();

  const goToNextStep = useCallback(() => {
    // Step navigation logic with conditional skipping
  }, [state]);

  const goToPreviousStep = useCallback(() => {
    setState(prev => ({ ...prev, currentStep: getPreviousStep(prev.currentStep) }));
  }, []);

  const startRecording = useCallback(async () => {
    // Navigate to recording screen with params
    router.push({
      pathname: '/(internal)/recording',
      params: {
        activityType: state.selectedActivityType?.id,
        plannedActivityId: state.selectedPlannedActivity,
      },
    });
  }, [state, router]);

  return { state, goToNextStep, goToPreviousStep, startRecording };
};
```

## 🔄 Recording Screen Components

### Recording Screen with Navigation Guards
```typescript
// routes/(internal)/recording.tsx
import { useEffect, useState, useCallback } from 'react';
import { View, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RecordingHeader } from '@/components/activity/RecordingHeader';
import { RecordingBodySection } from '@/components/activity/RecordingBodySection';
import { RecordingControls } from '@/components/activity/RecordingControls';
import { ActivityRecorder } from '@/lib/services/ActivityRecorder';

export default function RecordingScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [metrics, setMetrics] = useState(initialMetrics);

  // Navigation guard - prevent back during recording
  useEffect(() => {
    const subscription = router.addListener('beforeRemove', (e) => {
      if (isRecording) {
        e.preventDefault();
        Alert.alert('Recording in progress', 'Please stop recording first');
      }
    });

    return () => subscription.remove();
  }, [isRecording, router]);

  const handleStartRecording = async () => {
    await ActivityRecorder.startRecording();
    setIsRecording(true);
  };

  const handleStopRecording = async () => {
    await ActivityRecorder.stopRecording();
    setIsRecording(false);
    router.push('/(internal)/activity-summary');
  };

  return (
    <View className="flex-1 bg-background">
      <RecordingHeader
        isRecording={isRecording}
        isPaused={isPaused}
        activityType={params.activityType}
      />
      <RecordingBodySection metrics={metrics} isRecording={isRecording} />
      <RecordingControls
        isRecording={isRecording}
        isPaused={isPaused}
        onStart={handleStartRecording}
        onPause={() => setIsPaused(true)}
        onResume={() => setIsPaused(false)}
        onStop={handleStopRecording}
      />
    </View>
  );
}
```

## 🎨 UI Component Patterns

### Button Component Usage
```typescript
// Primary action
<Button variant="default" size="lg" onPress={handleAction}>
  <Text>Primary Action</Text>
</Button>

// Secondary action  
<Button variant="outline" onPress={handleAction}>
  <Text>Secondary</Text>
</Button>

// Destructive action
<Button variant="destructive" onPress={handleDelete}>
  <Text>Delete</Text>
</Button>

// Ghost button (minimal styling)
<Button variant="ghost" size="sm" onPress={handleAction}>
  <Icon as={X} />
</Button>

// Link style
<Button variant="link" onPress={handleAction}>
  <Text>Learn More</Text>
</Button>
```

### Card Component Structure
```typescript
<Card className="p-4">
  <Card.Header>
    <Text className="text-lg font-semibold">Card Title</Text>
    <Text className="text-sm text-muted-foreground">Subtitle</Text>
  </Card.Header>
  <Card.Content>
    <Text>Card content goes here</Text>
  </Card.Content>
  <Card.Footer>
    <Button variant="outline" size="sm">
      <Text>Action</Text>
    </Button>
  </Card.Footer>
</Card>
```

## 🔧 Service Patterns

### ActivityRecorder Service
```typescript
// lib/services/ActivityRecorder.ts
import * as Location from 'expo-location';
import { TaskManager } from 'expo-task-manager';

const LOCATION_TASK = 'background-location-task';

export class ActivityRecorder {
  private static currentSession: ActivitySession | null = null;

  static async startRecording(): Promise<void> {
    // Request permissions
    // Start background location tracking
    // Initialize session metrics
    // Connect Bluetooth devices
  }

  static async stopRecording(): Promise<ActivitySession> {
    // Stop location tracking
    // Disconnect devices
    // Save session data
    // Return completed session
  }

  static async pauseRecording(): Promise<void> {
    // Pause metrics collection
    // Maintain session state
  }

  static async resumeRecording(): Promise<void> {
    // Resume metrics collection
  }
}

// Background task for location tracking
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Location tracking error:', error);
    return;
  }
  if (data?.locations) {
    await ActivityRecorder.processLocationUpdates(data.locations);
  }
});
```

## 📊 State Management Patterns

### Zustand Store Example
```typescript
// lib/stores/useActivityStore.ts
import { create } from 'zustand';
import { Activity, PlannedActivity } from '@repo/core';

interface ActivityState {
  activities: Activity[];
  plannedActivities: PlannedActivity[];
  currentActivity: Activity | null;
  isLoading: boolean;
  
  // Actions
  loadActivities: (profileId: string) => Promise<void>;
  createActivity: (activity: Omit<Activity, 'id'>) => Promise<string>;
  deleteActivity: (activityId: string) => Promise<void>;
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  activities: [],
  plannedActivities: [],
  currentActivity: null,
  isLoading: false,

  loadActivities: async (profileId) => {
    set({ isLoading: true });
    try {
      const activities = await ActivityService.getActivities(profileId);
      set({ activities, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  createActivity: async (activityData) => {
    const activityId = await ActivityService.createActivity(activityData);
    const newActivity = { ...activityData, id: activityId };
    set(state => ({ activities: [...state.activities, newActivity] }));
    return activityId;
  },
}));
```

## 🎯 Quick Start Checklist

### Phase 1: Foundation (Current Focus)
1. [ ] Create tab navigation structure
2. [ ] Build Home screen with quick actions
3. [ ] Implement Record screen skeleton
4. [ ] Create Activities list screen
5. [ ] Build Trends dashboard framework
6. [ ] Implement Settings screen structure

### Phase 2: Core Features
7. [ ] Implement stepper navigation system
8. [ ] Build recording screen components
9. [ ] Add navigation guards
10. [ ] Integrate basic state management

### Immediate Next Steps:
- Start with `routes/(internal)/(tabs)/_layout.tsx`
- Create basic tab screens (index.tsx, record.tsx, activities.tsx, trends.tsx, settings.tsx)
- Implement useRecordSelection hook
- Build RecordingStepper component

This reference provides the core patterns and structures needed to rebuild your mobile application efficiently. Focus on recreating the navigation structure first, then gradually add functionality using these proven patterns.