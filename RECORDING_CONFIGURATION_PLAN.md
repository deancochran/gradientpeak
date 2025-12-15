# Recording Configuration System - Technical Implementation Plan

## Executive Summary

This plan outlines a comprehensive technical approach to handle all permutations of activity recording configurations in GradientPeak, ensuring users receive relevant features and UI elements for their specific recording scenario while hiding irrelevant functionality.

---

## Problem Statement

Current challenges:
- 8+ dimensions of recording configuration (location, type, mode, structure, route, FTMS, devices, etc.)
- 100+ potential permutations of valid recording scenarios
- Risk of showing irrelevant UI (route nav for indoor, step progression without plan, etc.)
- Manual configuration prone to user error
- Inconsistent automation behavior across scenarios

**Goal:** Create a robust system that:
1. Automatically detects recording capabilities based on configuration
2. Shows only relevant UI components for each scenario
3. Applies appropriate automation (FTMS control, step progression, etc.)
4. Gracefully handles edge cases and partial configurations

---

## Research Findings Summary

### Current Implementation Strengths
- Clean service-based architecture (`ActivityRecorderService`)
- FTMS trainer control fully implemented with feature detection
- V2 plan structure with flat steps and flexible durations
- Event-driven state management
- Separation of concerns (services, managers, hooks, UI)

### Configuration Dimensions Identified

1. **Activity Location**: `outdoor` | `indoor`
2. **Activity Type**: `run` | `bike` | `swim` | `strength` | `other`
3. **Recording Mode**: `planned` | `unplanned`
4. **Plan Structure**: `hasStructure` | `noStructure`
5. **Route Presence**: `hasRoute` | `noRoute`
6. **FTMS Connection**: `ftmsConnected` | `noFtms`
7. **Device Sensors**: `hasDevices` | `noDevices` (HR, power, cadence, etc.)
8. **GPS Availability**: `gpsAvailable` | `noGps`
9. **Follow-Along Mode**: `requiresFollowAlong` | `optional` (swim, other activities)

### Key Files & Architecture

**Service Layer:**
- `apps/mobile/lib/services/ActivityRecorder/index.ts` - Main recording service
- `apps/mobile/lib/services/ActivityRecorder/FTMSController.ts` - Trainer control
- `apps/mobile/lib/services/ActivityRecorder/SensorsManager.ts` - BLE devices
- `apps/mobile/lib/services/ActivityRecorder/LocationManager.ts` - GPS tracking

**Schema & Types:**
- `packages/core/schemas/activity_payload.ts` - Activity type helpers
- `packages/core/schemas/activity_plan_v2.ts` - Plan structure definitions
- `packages/core/utils/plan-view-logic.ts` - UI configuration logic

**UI Layer:**
- `apps/mobile/lib/hooks/useActivityRecorder.ts` - Recording hooks
- `apps/mobile/app/(internal)/record/index.tsx` - Recording screen
- `apps/mobile/components/RecordingCarousel.tsx` - Adaptive card system

---

## Proposed Architecture

### 1. Recording Configuration System

Create a centralized configuration resolver that determines capabilities and UI requirements based on recording context.

#### 1.1 Configuration Schema

```typescript
// packages/core/schemas/recording_config.ts

interface RecordingConfiguration {
  // Core identification
  activityType: PublicActivityType
  location: 'outdoor' | 'indoor'
  mode: 'planned' | 'unplanned'
  
  // Plan details
  plan?: {
    hasStructure: boolean
    hasRoute: boolean
    stepCount: number
    requiresManualAdvance: boolean
    structureType: 'time' | 'distance' | 'reps' | 'mixed'
  }
  
  // Device capabilities
  devices: {
    ftmsTrainer?: {
      deviceId: string
      features: FTMSFeatures
      supportedModes: ControlMode[]
      autoControlEnabled: boolean
    }
    sensors: ConnectedSensor[]
    hasPowerMeter: boolean
    hasHeartRateMonitor: boolean
    hasCadenceSensor: boolean
  }
  
  // Location capabilities
  location: {
    gpsAvailable: boolean
    gpsRequired: boolean
    hasRoute: boolean
  }
  
  // Computed capabilities (derived from above)
  capabilities: RecordingCapabilities
}

interface RecordingCapabilities {
  // Data collection
  canTrackLocation: boolean
  canTrackPower: boolean
  canTrackHeartRate: boolean
  canTrackCadence: boolean
  canTrackDistance: boolean
  canTrackSpeed: boolean
  
  // UI features
  shouldShowMap: boolean
  shouldShowStepCarousel: boolean
  shouldShowRouteOverlay: boolean
  shouldShowTurnByTurn: boolean
  shouldShowFollowAlong: boolean
  shouldShowPowerTarget: boolean
  shouldShowElevationProfile: boolean
  
  // Automation
  canAutoAdvanceSteps: boolean
  canAutoControlTrainer: boolean
  canAutoAdjustTargets: boolean
  canProvidePacing: boolean
  
  // Navigation
  primaryMetric: 'time' | 'distance' | 'reps' | 'power'
  secondaryMetrics: string[]
  
  // Validation
  isValid: boolean
  warnings: string[]
  errors: string[]
}
```

#### 1.2 Configuration Resolver

```typescript
// packages/core/utils/recording-config-resolver.ts

class RecordingConfigResolver {
  /**
   * Analyzes current recording context and computes full configuration
   */
  static resolve(input: {
    activityPayload: ActivityPayload
    connectedDevices: ConnectedSensor[]
    gpsEnabled: boolean
    planData?: ActivityPlan
  }): RecordingConfiguration {
    const config = this.buildBaseConfig(input)
    const capabilities = this.computeCapabilities(config)
    
    return {
      ...config,
      capabilities: {
        ...capabilities,
        ...this.validateConfiguration(config, capabilities)
      }
    }
  }
  
  private static computeCapabilities(config: RecordingConfiguration): RecordingCapabilities {
    // Apply decision rules based on configuration matrix
    
    const canTrackLocation = config.location.gpsAvailable && isOutdoorActivity(config.activityType)
    const hasStructuredPlan = config.plan?.hasStructure ?? false
    const hasFtmsTrainer = !!config.devices.ftmsTrainer
    
    return {
      // Data collection capabilities
      canTrackLocation,
      canTrackPower: config.devices.hasPowerMeter || hasFtmsTrainer,
      canTrackHeartRate: config.devices.hasHeartRateMonitor,
      canTrackCadence: config.devices.hasCadenceSensor,
      canTrackDistance: canTrackLocation || isContinuousActivity(config.activityType),
      canTrackSpeed: canTrackLocation || hasFtmsTrainer,
      
      // UI features
      shouldShowMap: canTrackLocation || config.plan?.hasRoute,
      shouldShowStepCarousel: hasStructuredPlan,
      shouldShowRouteOverlay: canTrackLocation && config.plan?.hasRoute,
      shouldShowTurnByTurn: canTrackLocation && config.location.hasRoute,
      shouldShowFollowAlong: shouldUseFollowAlong(config.activityType),
      shouldShowPowerTarget: hasFtmsTrainer && hasStructuredPlan,
      shouldShowElevationProfile: config.plan?.hasRoute,
      
      // Automation capabilities
      canAutoAdvanceSteps: hasStructuredPlan && !config.plan?.requiresManualAdvance,
      canAutoControlTrainer: hasFtmsTrainer && config.devices.ftmsTrainer!.autoControlEnabled,
      canAutoAdjustTargets: hasFtmsTrainer && hasStructuredPlan,
      canProvidePacing: usesPaceData(config.activityType) && canTrackLocation,
      
      // Navigation
      primaryMetric: this.determinePrimaryMetric(config),
      secondaryMetrics: this.determineSecondaryMetrics(config),
      
      // Validation
      isValid: true,
      warnings: [],
      errors: []
    }
  }
  
  private static determinePrimaryMetric(config: RecordingConfiguration): string {
    // Priority order based on activity type and available data
    if (isStepBasedActivity(config.activityType)) return 'reps'
    if (config.devices.ftmsTrainer) return 'power'
    if (config.location.gpsAvailable) return 'distance'
    return 'time'
  }
  
  private static validateConfiguration(
    config: RecordingConfiguration,
    capabilities: RecordingCapabilities
  ): Pick<RecordingCapabilities, 'isValid' | 'warnings' | 'errors'> {
    const warnings: string[] = []
    const errors: string[] = []
    
    // Validate GPS requirements
    if (isOutdoorActivity(config.activityType) && !config.location.gpsAvailable) {
      errors.push('GPS is required for outdoor activities')
    }
    
    // Validate trainer control
    if (config.devices.ftmsTrainer?.autoControlEnabled && !config.plan?.hasStructure) {
      warnings.push('Auto trainer control requires a structured plan')
    }
    
    // Validate route navigation
    if (capabilities.shouldShowTurnByTurn && !config.location.gpsAvailable) {
      errors.push('Route navigation requires GPS')
    }
    
    // Validate plan structure requirements
    if (config.mode === 'planned' && !config.plan?.hasStructure) {
      warnings.push('Planned activity has no structure - will record as unplanned')
    }
    
    return {
      isValid: errors.length === 0,
      warnings,
      errors
    }
  }
}
```

---

### 2. Adaptive UI System

Refactor UI components to consume configuration and render only relevant elements.

#### 2.1 Configuration Context

```typescript
// apps/mobile/lib/contexts/RecordingConfigContext.tsx

interface RecordingConfigContextValue {
  config: RecordingConfiguration | null
  capabilities: RecordingCapabilities | null
  updateConfig: (updates: Partial<RecordingConfiguration>) => void
  refreshConfig: () => void
}

export const RecordingConfigProvider = ({ children, service }) => {
  const [config, setConfig] = useState<RecordingConfiguration | null>(null)
  
  // Recompute configuration when service state changes
  useEffect(() => {
    if (!service) return
    
    const recompute = () => {
      const newConfig = RecordingConfigResolver.resolve({
        activityPayload: service.getActivityPayload(),
        connectedDevices: service.getConnectedSensors(),
        gpsEnabled: service.isGPSAvailable(),
        planData: service.getActivityPlan()
      })
      
      setConfig(newConfig)
    }
    
    // Recompute on relevant changes
    service.on('activitySelected', recompute)
    service.on('planSelected', recompute)
    service.on('sensorsChanged', recompute)
    
    recompute()
    
    return () => {
      service.off('activitySelected', recompute)
      service.off('planSelected', recompute)
      service.off('sensorsChanged', recompute)
    }
  }, [service])
  
  return (
    <RecordingConfigContext.Provider value={{ config, ... }}>
      {children}
    </RecordingConfigContext.Provider>
  )
}

export const useRecordingConfig = () => useContext(RecordingConfigContext)
```

#### 2.2 Capability-Aware Hooks

```typescript
// apps/mobile/lib/hooks/useRecordingCapabilities.ts

export const useRecordingCapabilities = () => {
  const { capabilities } = useRecordingConfig()
  return capabilities
}

// Usage in components:
const RecordingScreen = () => {
  const capabilities = useRecordingCapabilities()
  
  return (
    <>
      {capabilities?.shouldShowMap && <MapCard />}
      {capabilities?.shouldShowStepCarousel && <StepCarousel />}
      {capabilities?.shouldShowFollowAlong && <FollowAlongView />}
      <MetricsCard metrics={capabilities?.secondaryMetrics} />
    </>
  )
}
```

#### 2.3 Dynamic Card System

```typescript
// apps/mobile/components/RecordingCarousel.tsx

interface CardConfig {
  id: string
  component: React.ComponentType<any>
  visible: (capabilities: RecordingCapabilities) => boolean
  priority: number
}

const CARD_REGISTRY: CardConfig[] = [
  {
    id: 'map',
    component: MapCard,
    visible: (c) => c.shouldShowMap,
    priority: 100
  },
  {
    id: 'steps',
    component: StepCarousel,
    visible: (c) => c.shouldShowStepCarousel,
    priority: 90
  },
  {
    id: 'followAlong',
    component: FollowAlongCard,
    visible: (c) => c.shouldShowFollowAlong,
    priority: 95
  },
  {
    id: 'powerTarget',
    component: PowerTargetCard,
    visible: (c) => c.shouldShowPowerTarget,
    priority: 80
  },
  {
    id: 'elevation',
    component: ElevationProfileCard,
    visible: (c) => c.shouldShowElevationProfile,
    priority: 70
  },
  {
    id: 'metrics',
    component: MetricsCard,
    visible: () => true, // Always visible
    priority: 50
  }
]

export const AdaptiveRecordingCarousel = () => {
  const capabilities = useRecordingCapabilities()
  
  const visibleCards = useMemo(() => {
    if (!capabilities) return []
    
    return CARD_REGISTRY
      .filter(card => card.visible(capabilities))
      .sort((a, b) => b.priority - a.priority)
  }, [capabilities])
  
  return (
    <Carousel>
      {visibleCards.map(card => (
        <card.component key={card.id} />
      ))}
    </Carousel>
  )
}
```

---

### 3. Automation Rule Engine

Create a declarative system for automatic behavior based on configuration.

#### 3.1 Automation Rules Schema

```typescript
// packages/core/schemas/automation_rules.ts

type AutomationTrigger = 
  | { type: 'stepChanged', stepIndex: number }
  | { type: 'deviceConnected', deviceType: string }
  | { type: 'locationUpdated', location: Location }
  | { type: 'metricThreshold', metric: string, value: number }
  | { type: 'recordingStarted' }
  | { type: 'recordingPaused' }
  | { type: 'recordingResumed' }

type AutomationAction =
  | { type: 'setTrainerTarget', mode: ControlMode, value: number }
  | { type: 'advanceStep' }
  | { type: 'showNotification', message: string }
  | { type: 'adjustPacing', targetPace: number }
  | { type: 'updateUI', element: string, visible: boolean }

interface AutomationRule {
  id: string
  name: string
  description: string
  enabled: boolean
  conditions: {
    requiresCapabilities?: Partial<RecordingCapabilities>
    requiresConfig?: Partial<RecordingConfiguration>
    customPredicate?: (context: RecordingContext) => boolean
  }
  trigger: AutomationTrigger
  actions: AutomationAction[]
  priority: number
}
```

#### 3.2 Automation Engine

```typescript
// apps/mobile/lib/services/ActivityRecorder/AutomationEngine.ts

export class AutomationEngine {
  private rules: AutomationRule[] = []
  private config: RecordingConfiguration
  
  constructor(private service: ActivityRecorderService) {
    this.loadDefaultRules()
  }
  
  private loadDefaultRules(): void {
    this.rules = [
      // Auto-advance steps on duration completion
      {
        id: 'auto-advance-steps',
        name: 'Auto-advance plan steps',
        enabled: true,
        conditions: {
          requiresCapabilities: { canAutoAdvanceSteps: true }
        },
        trigger: { type: 'stepChanged' },
        actions: [
          { type: 'advanceStep' }
        ],
        priority: 100
      },
      
      // Apply trainer targets on step change
      {
        id: 'auto-trainer-control',
        name: 'Automatic trainer control',
        enabled: true,
        conditions: {
          requiresCapabilities: { canAutoControlTrainer: true, canAutoAdjustTargets: true }
        },
        trigger: { type: 'stepChanged' },
        actions: [
          { type: 'setTrainerTarget' } // Value computed from step
        ],
        priority: 90
      },
      
      // Show follow-along for specific activities
      {
        id: 'show-follow-along',
        name: 'Enable follow-along mode',
        enabled: true,
        conditions: {
          requiresCapabilities: { shouldShowFollowAlong: true }
        },
        trigger: { type: 'recordingStarted' },
        actions: [
          { type: 'updateUI', element: 'followAlong', visible: true }
        ],
        priority: 80
      }
    ]
  }
  
  public evaluateRules(trigger: AutomationTrigger, context: RecordingContext): void {
    const applicableRules = this.rules
      .filter(rule => rule.enabled)
      .filter(rule => this.matchesTrigger(rule.trigger, trigger))
      .filter(rule => this.meetsConditions(rule.conditions, context))
      .sort((a, b) => b.priority - a.priority)
    
    for (const rule of applicableRules) {
      this.executeActions(rule.actions, context)
    }
  }
  
  private meetsConditions(conditions: AutomationRule['conditions'], context: RecordingContext): boolean {
    // Check capability requirements
    if (conditions.requiresCapabilities) {
      const capabilities = context.config.capabilities
      for (const [key, value] of Object.entries(conditions.requiresCapabilities)) {
        if (capabilities[key] !== value) return false
      }
    }
    
    // Check custom predicate
    if (conditions.customPredicate && !conditions.customPredicate(context)) {
      return false
    }
    
    return true
  }
  
  private executeActions(actions: AutomationAction[], context: RecordingContext): void {
    for (const action of actions) {
      switch (action.type) {
        case 'setTrainerTarget':
          this.handleTrainerTarget(action, context)
          break
        case 'advanceStep':
          this.service.advanceStep()
          break
        case 'showNotification':
          // Emit notification event
          break
        // ... other action handlers
      }
    }
  }
}
```

---

### 4. Validation & Error Handling

Comprehensive validation to catch configuration issues early.

#### 4.1 Pre-Recording Validation

```typescript
// apps/mobile/lib/services/ActivityRecorder/RecordingValidator.ts

export class RecordingValidator {
  /**
   * Validates recording configuration before starting
   * Returns errors (blocking) and warnings (non-blocking)
   */
  static validatePreStart(config: RecordingConfiguration): {
    canStart: boolean
    errors: ValidationError[]
    warnings: ValidationWarning[]
  } {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []
    
    // GPS validation
    if (isOutdoorActivity(config.activityType) && !config.location.gpsAvailable) {
      errors.push({
        code: 'GPS_REQUIRED',
        message: 'GPS must be enabled for outdoor activities',
        severity: 'error',
        remediation: 'Enable location services in device settings'
      })
    }
    
    // Plan structure validation
    if (config.mode === 'planned' && !config.plan?.hasStructure) {
      warnings.push({
        code: 'NO_PLAN_STRUCTURE',
        message: 'Selected plan has no structure',
        severity: 'warning',
        remediation: 'Activity will record as unplanned'
      })
    }
    
    // Trainer control validation
    if (config.devices.ftmsTrainer?.autoControlEnabled) {
      const trainer = config.devices.ftmsTrainer
      const hasValidTargets = config.plan?.hasStructure && 
        this.planHasTrainerTargets(config.plan)
      
      if (!hasValidTargets) {
        warnings.push({
          code: 'NO_TRAINER_TARGETS',
          message: 'Auto trainer control enabled but no power/resistance targets in plan',
          severity: 'warning',
          remediation: 'Add targets to plan or disable auto control'
        })
      }
    }
    
    // Device compatibility
    if (config.devices.sensors.length === 0 && isContinuousActivity(config.activityType)) {
      warnings.push({
        code: 'NO_SENSORS',
        message: 'No sensors connected - metrics will be limited',
        severity: 'info',
        remediation: 'Connect heart rate, power, or cadence sensors for richer data'
      })
    }
    
    return {
      canStart: errors.length === 0,
      errors,
      warnings
    }
  }
}
```

#### 4.2 Validation UI

```typescript
// apps/mobile/components/RecordingValidationSheet.tsx

export const RecordingValidationSheet = ({ config, onDismiss, onProceed }) => {
  const validation = RecordingValidator.validatePreStart(config)
  
  if (validation.canStart && validation.warnings.length === 0) {
    // Auto-proceed if no issues
    onProceed()
    return null
  }
  
  return (
    <BottomSheet>
      <View>
        {validation.errors.length > 0 && (
          <ErrorSection>
            <Text>Cannot start recording:</Text>
            {validation.errors.map(error => (
              <ErrorItem key={error.code}>
                <Text>{error.message}</Text>
                <Text style={styles.remediation}>{error.remediation}</Text>
              </ErrorItem>
            ))}
          </ErrorSection>
        )}
        
        {validation.warnings.length > 0 && (
          <WarningSection>
            <Text>Warnings:</Text>
            {validation.warnings.map(warning => (
              <WarningItem key={warning.code}>
                <Text>{warning.message}</Text>
                <Text style={styles.remediation}>{warning.remediation}</Text>
              </WarningItem>
            ))}
          </WarningSection>
        )}
        
        <Actions>
          {validation.canStart && (
            <Button onPress={onProceed}>Start Anyway</Button>
          )}
          <Button onPress={onDismiss}>Cancel</Button>
        </Actions>
      </View>
    </BottomSheet>
  )
}
```

---

### 5. Testing Strategy

Comprehensive testing matrix to validate all configuration permutations.

#### 5.1 Configuration Test Matrix

```typescript
// apps/mobile/__tests__/recording-configurations.test.ts

describe('Recording Configuration Matrix', () => {
  const testCases: Array<{
    name: string
    input: RecordingConfigInput
    expected: Partial<RecordingCapabilities>
  }> = [
    // Outdoor + Planned + Structured + GPS
    {
      name: 'Outdoor run with structured plan and GPS',
      input: {
        activityType: 'outdoor_run',
        mode: 'planned',
        hasStructure: true,
        gpsAvailable: true,
        devices: []
      },
      expected: {
        shouldShowMap: true,
        shouldShowStepCarousel: true,
        canAutoAdvanceSteps: true,
        canTrackLocation: true,
        primaryMetric: 'distance'
      }
    },
    
    // Indoor + Unplanned + FTMS
    {
      name: 'Indoor trainer without plan',
      input: {
        activityType: 'indoor_bike_trainer',
        mode: 'unplanned',
        hasStructure: false,
        gpsAvailable: false,
        devices: [{ type: 'ftms_trainer', ... }]
      },
      expected: {
        shouldShowMap: false,
        shouldShowStepCarousel: false,
        canAutoAdvanceSteps: false,
        canAutoControlTrainer: false, // No plan = no auto control
        canTrackPower: true,
        primaryMetric: 'power'
      }
    },
    
    // Indoor + Planned + Structured + FTMS
    {
      name: 'Indoor trainer with structured plan and auto control',
      input: {
        activityType: 'indoor_bike_trainer',
        mode: 'planned',
        hasStructure: true,
        gpsAvailable: false,
        devices: [{ 
          type: 'ftms_trainer', 
          autoControlEnabled: true,
          features: { powerTargetSettingSupported: true }
        }]
      },
      expected: {
        shouldShowMap: false,
        shouldShowStepCarousel: true,
        shouldShowPowerTarget: true,
        canAutoAdvanceSteps: true,
        canAutoControlTrainer: true,
        canAutoAdjustTargets: true,
        primaryMetric: 'power'
      }
    },
    
    // Strength training
    {
      name: 'Indoor strength with structured plan',
      input: {
        activityType: 'indoor_strength',
        mode: 'planned',
        hasStructure: true,
        gpsAvailable: false,
        devices: []
      },
      expected: {
        shouldShowMap: false,
        shouldShowStepCarousel: true,
        shouldShowFollowAlong: false,
        canAutoAdvanceSteps: false, // Manual advance for reps
        primaryMetric: 'reps'
      }
    },
    
    // Swimming (requires follow-along)
    {
      name: 'Indoor swim with plan',
      input: {
        activityType: 'indoor_swim',
        mode: 'planned',
        hasStructure: true,
        gpsAvailable: false,
        devices: []
      },
      expected: {
        shouldShowMap: false,
        shouldShowFollowAlong: true, // Mandatory for swim
        shouldShowStepCarousel: false, // Follow-along replaces carousel
        canAutoAdvanceSteps: false,
        primaryMetric: 'time'
      }
    },
    
    // Edge case: Outdoor with route but no GPS
    {
      name: 'Outdoor activity with route but GPS disabled (invalid)',
      input: {
        activityType: 'outdoor_run',
        mode: 'planned',
        hasStructure: true,
        hasRoute: true,
        gpsAvailable: false,
        devices: []
      },
      expected: {
        isValid: false, // Should fail validation
        errors: ['GPS is required for outdoor activities']
      }
    },
    
    // Edge case: Indoor with route (visualization only)
    {
      name: 'Indoor trainer with route overlay (visualization)',
      input: {
        activityType: 'indoor_bike_trainer',
        mode: 'planned',
        hasStructure: true,
        hasRoute: true,
        gpsAvailable: false,
        devices: [{ type: 'ftms_trainer' }]
      },
      expected: {
        shouldShowMap: true, // Show map for route viz
        shouldShowRouteOverlay: false, // No overlay without GPS
        shouldShowTurnByTurn: false, // No navigation
        canTrackLocation: false,
        primaryMetric: 'power'
      }
    }
  ]
  
  testCases.forEach(({ name, input, expected }) => {
    it(name, () => {
      const config = RecordingConfigResolver.resolve(input)
      
      for (const [key, value] of Object.entries(expected)) {
        expect(config.capabilities[key]).toEqual(value)
      }
    })
  })
})
```

#### 5.2 UI Rendering Tests

```typescript
// apps/mobile/__tests__/adaptive-ui.test.tsx

describe('Adaptive UI Rendering', () => {
  it('renders only map and metrics for outdoor unplanned', () => {
    const config = createTestConfig({
      activityType: 'outdoor_run',
      mode: 'unplanned',
      gpsAvailable: true
    })
    
    const { getByTestId, queryByTestId } = render(
      <RecordingConfigProvider value={config}>
        <AdaptiveRecordingCarousel />
      </RecordingConfigProvider>
    )
    
    expect(getByTestId('map-card')).toBeVisible()
    expect(getByTestId('metrics-card')).toBeVisible()
    expect(queryByTestId('step-carousel')).toBeNull()
    expect(queryByTestId('follow-along-card')).toBeNull()
  })
  
  it('renders step carousel for structured plan', () => {
    const config = createTestConfig({
      activityType: 'indoor_bike_trainer',
      mode: 'planned',
      hasStructure: true,
      devices: [{ type: 'ftms_trainer' }]
    })
    
    const { getByTestId } = render(
      <RecordingConfigProvider value={config}>
        <AdaptiveRecordingCarousel />
      </RecordingConfigProvider>
    )
    
    expect(getByTestId('step-carousel')).toBeVisible()
    expect(getByTestId('power-target-card')).toBeVisible()
    expect(getByTestId('metrics-card')).toBeVisible()
  })
})
```

#### 5.3 Automation Tests

```typescript
// apps/mobile/__tests__/automation-engine.test.ts

describe('Automation Engine', () => {
  it('auto-advances steps when duration complete', async () => {
    const service = createMockService({
      activityType: 'indoor_bike_trainer',
      mode: 'planned',
      hasStructure: true
    })
    
    const engine = new AutomationEngine(service)
    
    // Simulate step duration completion
    service.emit('stepChanged', { 
      index: 0, 
      progress: { progress: 1.0, canAdvance: true } 
    })
    
    await waitFor(() => {
      expect(service.advanceStep).toHaveBeenCalled()
    })
  })
  
  it('applies trainer targets on step change', async () => {
    const service = createMockService({
      activityType: 'indoor_bike_trainer',
      mode: 'planned',
      hasStructure: true,
      devices: [{ type: 'ftms_trainer', autoControlEnabled: true }]
    })
    
    const engine = new AutomationEngine(service)
    
    // Simulate step change with power target
    service.emit('stepChanged', { 
      current: { 
        targets: [{ type: 'power', value: 200, unit: 'watts' }] 
      } 
    })
    
    await waitFor(() => {
      expect(service.sensorsManager.setPowerTarget).toHaveBeenCalledWith(200)
    })
  })
  
  it('does not auto-control when manual override enabled', async () => {
    const service = createMockService({
      activityType: 'indoor_bike_trainer',
      mode: 'planned',
      hasStructure: true,
      devices: [{ type: 'ftms_trainer', autoControlEnabled: false }]
    })
    
    const engine = new AutomationEngine(service)
    
    service.emit('stepChanged', { current: { targets: [...] } })
    
    expect(service.sensorsManager.setPowerTarget).not.toHaveBeenCalled()
  })
})
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
1. **Create configuration schema** (`recording_config.ts`)
   - Define `RecordingConfiguration` and `RecordingCapabilities` interfaces
   - Implement helper type guards and validators
   
2. **Implement configuration resolver** (`recording-config-resolver.ts`)
   - Build capability computation logic
   - Add validation rules
   - Create configuration factory functions

3. **Add unit tests for resolver**
   - Test all configuration permutations (50+ test cases)
   - Validate edge cases and error conditions

**Deliverables:**
- `packages/core/schemas/recording_config.ts`
- `packages/core/utils/recording-config-resolver.ts`
- `packages/core/utils/__tests__/recording-config-resolver.test.ts`

**Success Criteria:**
- All 50+ configuration permutations tested
- Validation catches all invalid configurations
- Zero false positives/negatives

---

### Phase 2: Service Integration (Week 3-4)
1. **Integrate resolver into ActivityRecorderService**
   - Add configuration state to service
   - Trigger recomputation on state changes
   - Expose configuration via getter methods

2. **Implement automation engine**
   - Create `AutomationEngine` class
   - Define default automation rules
   - Hook into service event system

3. **Update existing managers**
   - Refactor `FTMSController` to use capabilities
   - Update `LocationManager` based on GPS requirements
   - Adjust `LiveMetricsManager` for capability-aware metrics

**Deliverables:**
- Updated `ActivityRecorderService` with configuration
- `AutomationEngine` class with rule system
- Refactored managers

**Success Criteria:**
- Service maintains accurate configuration state
- Automation rules execute correctly
- No regression in existing functionality

---

### Phase 3: UI Adaptation (Week 5-6)
1. **Create configuration context**
   - Implement `RecordingConfigProvider`
   - Create React hooks for capabilities

2. **Refactor recording screen**
   - Replace hardcoded UI logic with capability checks
   - Implement adaptive card system
   - Add validation sheet

3. **Update individual cards**
   - Make MapCard capability-aware
   - Update StepCarousel for auto-advance
   - Implement PowerTargetCard for trainer control
   - Add FollowAlongCard for swim/other

**Deliverables:**
- `RecordingConfigContext` and hooks
- Refactored recording screen
- Updated/new card components

**Success Criteria:**
- UI shows only relevant elements for each configuration
- Smooth transitions when configuration changes
- User feedback for validation issues

---

### Phase 4: Validation & Error Handling (Week 7)
1. **Implement pre-start validation**
   - Create `RecordingValidator` class
   - Add comprehensive validation rules
   - Generate actionable error messages

2. **Build validation UI**
   - Create `RecordingValidationSheet` component
   - Design error/warning display
   - Add remediation suggestions

3. **Add runtime validation**
   - Validate during recording state changes
   - Handle device disconnections gracefully
   - Show contextual warnings

**Deliverables:**
- `RecordingValidator` class
- Validation UI components
- Runtime validation hooks

**Success Criteria:**
- No invalid recordings can be started
- Clear, actionable error messages
- Graceful degradation on runtime issues

---

### Phase 5: Testing & Documentation (Week 8)
1. **Comprehensive test suite**
   - Configuration matrix tests (50+ cases)
   - UI rendering tests for each configuration
   - Automation engine tests
   - Integration tests

2. **Performance testing**
   - Configuration resolution benchmarks
   - UI rendering performance
   - Memory leak detection

3. **Documentation**
   - Configuration system architecture docs
   - Developer guide for adding new rules
   - User-facing documentation updates

**Deliverables:**
- Complete test suite (80%+ coverage)
- Performance benchmarks
- Architecture documentation

**Success Criteria:**
- All tests passing
- Configuration resolution < 50ms
- No memory leaks detected
- Documentation complete

---

## Key Design Patterns

### 1. Configuration as Single Source of Truth
- All recording behavior derived from configuration object
- No scattered conditional logic across components
- Easy to test and debug

### 2. Capability-Based Rendering
- UI components query capabilities, not raw state
- Declarative: "show if shouldShowMap" vs "show if outdoor and GPS"
- Centralized decision logic

### 3. Rule-Based Automation
- Declarative automation rules
- Easy to add/modify behavior
- Priority-based execution
- Conditions + triggers + actions pattern

### 4. Validation-First Approach
- Validate before starting recording
- Clear error messages with remediation
- Graceful degradation on runtime issues

### 5. Event-Driven Updates
- Configuration recomputed on relevant state changes
- React hooks trigger re-renders automatically
- No manual synchronization needed

---

## Migration Strategy

### Backward Compatibility
1. **Gradual rollout**
   - Keep existing logic initially
   - Add configuration system in parallel
   - Feature flag for testing

2. **Fallback logic**
   - If configuration resolution fails, use legacy behavior
   - Log errors for debugging
   - Gradual migration per component

3. **Data migration**
   - No database changes required
   - Purely runtime configuration
   - Existing recordings unaffected

### Rollout Plan
1. **Week 1-4:** Build foundation without affecting production
2. **Week 5-6:** Enable for internal testing (feature flag)
3. **Week 7:** Beta testing with select users
4. **Week 8:** Full production rollout

---

## Success Metrics

### Technical Metrics
- **Configuration resolution time:** < 50ms
- **Test coverage:** > 80% for configuration system
- **Memory overhead:** < 2MB for configuration state
- **UI render time:** < 100ms for capability updates

### User Experience Metrics
- **Invalid recording attempts:** Reduced to 0 (caught by validation)
- **User reported bugs related to missing/irrelevant UI:** -80%
- **Support tickets for configuration issues:** -70%
- **User satisfaction with recording UX:** +40%

### Code Quality Metrics
- **Cyclomatic complexity:** Reduced by 50% in recording screen
- **Number of conditional branches:** Reduced by 60%
- **Code duplication:** -40% (centralized logic)
- **Maintenance time for new activity types:** -50%

---

## Risk Mitigation

### Technical Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance degradation | High | Benchmark early, optimize resolver, memoize results |
| Configuration explosion | Medium | Limit dimensions, use sensible defaults, validate early |
| Migration issues | Medium | Feature flag, gradual rollout, fallback logic |
| Test complexity | Low | Parameterized tests, test factories, clear naming |

### Product Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| User confusion with validation | Medium | Clear error messages, contextual help, remediation steps |
| Breaking existing workflows | High | Extensive testing, beta program, rollback plan |
| Over-engineering | Low | Start simple, add complexity as needed, user feedback |

---

## Open Questions & Decisions Needed

1. **Configuration Persistence**
   - Should user preferences (e.g., "always use manual trainer control") be saved?
   - If yes, where? (Local storage, database, profile settings?)

2. **Dynamic Configuration Updates**
   - Should configuration auto-update during recording if devices connect/disconnect?
   - Or should it be locked once recording starts?

3. **Custom Rules**
   - Should advanced users be able to define custom automation rules?
   - If yes, what's the UX for rule creation?

4. **Fallback Behavior**
   - When multiple configurations are invalid, which takes precedence?
   - Should we suggest alternative configurations to user?

5. **Analytics**
   - What telemetry should we collect for configuration usage?
   - How to measure success of adaptive UI?

---

## Conclusion

This technical plan provides a comprehensive approach to handling all permutations of recording configurations in GradientPeak. By implementing a centralized configuration system, capability-based UI rendering, and rule-based automation, we can ensure users always see relevant features while hiding irrelevant ones.

The phased implementation approach allows for incremental development and testing, minimizing risk while delivering value early. The extensive test matrix ensures all configuration permutations work correctly, and the validation system prevents invalid recordings before they start.

**Next Steps:**
1. Review and approve this plan
2. Clarify open questions
3. Begin Phase 1 implementation
4. Schedule regular check-ins for progress updates
