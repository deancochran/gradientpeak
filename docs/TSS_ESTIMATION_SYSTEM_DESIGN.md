# TSS Estimation System - Comprehensive Design

## Executive Summary

This document outlines a comprehensive Training Stress Score (TSS) estimation system that provides users with accurate predictions of upcoming weekly TSS and fatigue levels to help them build effective training schedules, prepare properly, and manage recovery.

## Current State Analysis

### Existing TSS Calculation (Post-Activity)
- **Location**: `packages/core/calculations.ts`
- **Method**: Calculates actual TSS from completed activities using:
  - Normalized Power (NP) from power stream
  - Intensity Factor (IF) = NP / FTP
  - Formula: `TSS = (duration_hours × IF² × 100)`

### Existing Estimation (Pre-Activity)
- **Location**: `packages/core/utils/activity-defaults.ts`
- **Method**: Estimates TSS from activity plan structure:
  - `calculateStepTSS()`: Per-step TSS from targets and duration
  - `calculateTotalTSS()`: Sums TSS for all flattened steps
  - Uses target intensity (% FTP, watts, %HR, RPE) to derive IF

### Gap Analysis
**What's Missing:**
1. ❌ User profile integration (FTP, threshold HR, weight, age) in estimation
2. ❌ Real-time user fitness state (CTL/ATL/TSB) consideration
3. ❌ Activity-type-specific estimation models (run vs bike vs swim)
4. ❌ Route-based estimation (elevation, distance, terrain)
5. ❌ Weekly TSS preview and accumulation
6. ❌ Fatigue prediction and recovery recommendations
7. ❌ All other metric estimations (calories, duration, distance, zones)
8. ❌ Estimation confidence scoring
9. ❌ Historical accuracy tracking and learning

---

## System Architecture

### 1. Core Estimation Engine

```typescript
// packages/core/estimation/index.ts

interface EstimationContext {
  // User profile data
  profile: {
    ftp?: number;              // Functional Threshold Power (watts)
    threshold_hr?: number;      // Lactate Threshold HR (bpm)
    maxHR?: number;            // Maximum HR (bpm)
    restingHR?: number;        // Resting HR (bpm)
    weightKg?: number;         // Body weight
    age?: number;              // User age
  };

  // Current fitness state
  fitnessState?: {
    ctl: number;               // Chronic Training Load (42-day fitness)
    atl: number;               // Acute Training Load (7-day fatigue)
    tsb: number;               // Training Stress Balance (form)
    lastActivityDate?: Date;
  };

  // Activity details
  activityType: 'bike' | 'run' | 'swim' | 'strength' | 'other';
  location: 'indoor' | 'outdoor';
  
  // Optional route data
  route?: {
    distanceMeters: number;
    totalAscent: number;
    totalDescent: number;
    averageGrade?: number;
  };

  // Plan structure
  structure?: ActivityPlanStructure;
  
  // Scheduling context
  scheduledDate?: Date;
  weeklyPlannedTSS?: number;  // TSS already planned for the week
}

interface EstimationResult {
  // Primary metrics
  tss: number;
  duration: number;              // seconds
  intensityFactor: number;       // 0.0-2.0
  
  // Secondary metrics
  estimatedCalories?: number;
  estimatedDistance?: number;    // meters
  estimatedWork?: number;        // kJ (for power-based)
  
  // Zone predictions
  estimatedHRZones?: number[];   // [z1, z2, z3, z4, z5] seconds
  estimatedPowerZones?: number[]; // [z1-z7] seconds
  
  // Fatigue impact
  fatigueImpact: {
    projectedATL: number;        // After this activity
    projectedCTL: number;        // After this activity
    projectedTSB: number;        // After this activity
    formChange: 'improving' | 'maintaining' | 'declining';
    recoveryDaysNeeded: number;
  };
  
  // Estimation metadata
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;       // 0-100
  factors: string[];             // What influenced the estimate
  warnings?: string[];           // e.g., "Missing FTP, using default"
}
```

### 2. Estimation Strategies

#### Strategy 1: Structure-Based (Structured Workouts)
**When to use**: Activity has defined step structure with targets
**Accuracy**: High (90-95% for power-based, 80-85% for HR-based)

```typescript
function estimateFromStructure(
  structure: ActivityPlanStructure,
  context: EstimationContext
): EstimationResult {
  const flatSteps = flattenPlanSteps(structure.steps);
  
  let totalTSS = 0;
  let totalDuration = 0;
  let totalWeightedIF = 0;
  
  const hrZones = [0, 0, 0, 0, 0];
  const powerZones = [0, 0, 0, 0, 0, 0, 0];
  
  for (const step of flatSteps) {
    const stepDuration = getDurationMs(step.duration) / 1000;
    const stepIF = calculateStepIF(step, context);
    const stepTSS = (stepDuration / 3600) * Math.pow(stepIF, 2) * 100;
    
    totalTSS += stepTSS;
    totalDuration += stepDuration;
    totalWeightedIF += stepIF * stepDuration;
    
    // Distribute time into zones based on targets
    distributeStepIntoZones(step, stepDuration, hrZones, powerZones, context);
  }
  
  const avgIF = totalWeightedIF / totalDuration;
  
  return {
    tss: Math.round(totalTSS),
    duration: Math.round(totalDuration),
    intensityFactor: avgIF,
    estimatedHRZones: hrZones.map(Math.round),
    estimatedPowerZones: powerZones.map(Math.round),
    // ... rest of result
    confidence: 'high',
    confidenceScore: context.profile.ftp ? 95 : 80,
    factors: ['structure-based', 'user-profile']
  };
}
```

#### Strategy 2: Route-Based (Outdoor Activities)
**When to use**: Activity has route but no structure
**Accuracy**: Medium (70-80% depending on route detail)

```typescript
function estimateFromRoute(
  route: Route,
  context: EstimationContext
): EstimationResult {
  // Estimate speed based on terrain and user fitness
  const baseSpeed = estimateBaseSpeed(context);
  const terrainAdjustment = calculateTerrainAdjustment(route);
  const effectiveSpeed = baseSpeed * terrainAdjustment;
  
  // Estimate duration
  const duration = route.distanceMeters / effectiveSpeed;
  
  // Estimate power/effort from elevation
  const avgPower = estimatePowerFromElevation(
    route.totalAscent,
    route.distanceMeters,
    context.profile.weightKg || 70,
    context.profile.ftp
  );
  
  // Calculate IF and TSS
  const IF = context.profile.ftp 
    ? avgPower / context.profile.ftp 
    : 0.75; // Default moderate effort
  
  const tss = (duration / 3600) * Math.pow(IF, 2) * 100;
  
  return {
    tss: Math.round(tss),
    duration: Math.round(duration),
    intensityFactor: IF,
    estimatedDistance: route.distanceMeters,
    confidence: 'medium',
    confidenceScore: 75,
    factors: ['route-based', 'terrain-adjusted', 'user-profile']
  };
}
```

#### Strategy 3: Template-Based (No Structure or Route)
**When to use**: Fallback for activities without structure/route
**Accuracy**: Low (50-65%)

```typescript
function estimateFromTemplate(
  context: EstimationContext
): EstimationResult {
  // Use historical averages or activity-type defaults
  const templates = {
    bike: { avgIF: 0.75, avgDuration: 3600, avgTSS: 60 },
    run: { avgIF: 0.80, avgDuration: 2700, avgTSS: 55 },
    swim: { avgIF: 0.70, avgDuration: 2400, avgTSS: 45 },
    strength: { avgIF: 0.65, avgDuration: 2700, avgTSS: 40 },
    other: { avgIF: 0.65, avgDuration: 1800, avgTSS: 30 }
  };
  
  const template = templates[context.activityType];
  
  // Adjust based on user fitness level (CTL)
  const fitnessMultiplier = context.fitnessState 
    ? 1 + (context.fitnessState.ctl - 50) / 100
    : 1.0;
  
  return {
    tss: Math.round(template.avgTSS * fitnessMultiplier),
    duration: template.avgDuration,
    intensityFactor: template.avgIF,
    confidence: 'low',
    confidenceScore: 50,
    factors: ['template-based', 'activity-type-default'],
    warnings: ['No structure or route provided - using defaults']
  };
}
```

### 3. Fatigue Prediction System

```typescript
// packages/core/estimation/fatigue.ts

interface FatiguePrediction {
  afterActivity: {
    ctl: number;
    atl: number;
    tsb: number;
    form: 'fresh' | 'optimal' | 'neutral' | 'tired' | 'overreaching';
  };
  
  weeklyProjection: {
    totalTSS: number;
    averageDailyTSS: number;
    rampRate: number;              // Weekly CTL change
    isSafe: boolean;               // Ramp rate < 5-8 TSS/week
    recommendation: string;
  };
  
  recoveryPlan: {
    daysToRecover: number;
    nextHardWorkoutDate: Date;
    suggestedRestDays: number;
  };
  
  warnings: string[];
}

function predictFatigue(
  plannedTSS: number,
  scheduledDate: Date,
  currentState: FitnessState,
  weeklyPlannedActivities: PlannedActivity[]
): FatiguePrediction {
  // Calculate new training load after activity
  const newATL = calculateATL(currentState.atl, plannedTSS);
  const newCTL = calculateCTL(currentState.ctl, plannedTSS);
  const newTSB = calculateTSB(newCTL, newATL);
  
  // Calculate weekly totals
  const weekStart = startOfWeek(scheduledDate);
  const weeklyTSS = weeklyPlannedActivities
    .filter(a => isSameWeek(a.scheduledDate, weekStart))
    .reduce((sum, a) => sum + a.estimatedTSS, 0) + plannedTSS;
  
  // Calculate ramp rate
  const previousWeekCTL = currentState.ctl; // Simplified
  const projectedEndOfWeekCTL = projectCTL(
    currentState.ctl,
    weeklyPlannedActivities.map(a => a.estimatedTSS).concat(plannedTSS)
  );
  const rampRate = projectedEndOfWeekCTL - previousWeekCTL;
  
  // Safety check
  const isSafe = rampRate <= 8; // Conservative threshold
  
  // Recovery recommendations
  const daysToRecover = Math.ceil(plannedTSS / 100); // 1 day per 100 TSS
  const nextHardWorkoutDate = addDays(scheduledDate, daysToRecover);
  
  // Warnings
  const warnings: string[] = [];
  if (!isSafe) {
    warnings.push(`Ramp rate of ${rampRate.toFixed(1)} TSS/week exceeds safe limit (8)`);
  }
  if (newTSB < -30) {
    warnings.push('This activity will push you into overreaching territory');
  }
  if (weeklyTSS > currentState.ctl * 1.5) {
    warnings.push('Weekly TSS significantly exceeds current fitness level');
  }
  
  return {
    afterActivity: {
      ctl: newCTL,
      atl: newATL,
      tsb: newTSB,
      form: getFormStatus(newTSB)
    },
    weeklyProjection: {
      totalTSS: weeklyTSS,
      averageDailyTSS: weeklyTSS / 7,
      rampRate,
      isSafe,
      recommendation: generateRecommendation(rampRate, weeklyTSS, currentState)
    },
    recoveryPlan: {
      daysToRecover,
      nextHardWorkoutDate,
      suggestedRestDays: Math.max(1, Math.ceil(daysToRecover / 2))
    },
    warnings
  };
}
```

### 4. Additional Metric Estimation

```typescript
// packages/core/estimation/metrics.ts

interface MetricEstimations {
  calories: number;
  distance?: number;           // meters
  elevationGain?: number;      // meters
  avgPower?: number;           // watts
  avgHeartRate?: number;       // bpm
  avgSpeed?: number;           // m/s
  movingTime?: number;         // seconds (< duration)
}

function estimateMetrics(
  baseEstimation: EstimationResult,
  context: EstimationContext
): MetricEstimations {
  const { duration, intensityFactor, tss } = baseEstimation;
  
  // Calorie estimation
  let calories = 0;
  if (context.profile.ftp && context.activityType === 'bike') {
    // Power-based (most accurate)
    const avgPower = (context.profile.ftp * intensityFactor);
    calories = (avgPower * duration * 3.6) / 1000; // kJ to kcal
  } else if (context.profile.weightKg && context.profile.age) {
    // HR-based estimation
    const avgHR = estimateAvgHR(intensityFactor, context);
    calories = estimateCaloriesFromHR(duration, avgHR, context);
  } else {
    // Fallback: TSS-based (rough approximation)
    calories = tss * 4; // 1 TSS ≈ 4 calories
  }
  
  // Distance estimation
  let distance: number | undefined;
  if (context.route) {
    distance = context.route.distanceMeters;
  } else if (context.activityType === 'run' || context.activityType === 'bike') {
    // Estimate from duration and typical speeds
    const typicalSpeeds = {
      run: { easy: 3.0, moderate: 3.5, hard: 4.5 }, // m/s
      bike: { easy: 7.0, moderate: 8.5, hard: 10.0 }
    };
    const effortLevel = getEffortLevel(intensityFactor);
    const speed = typicalSpeeds[context.activityType][effortLevel];
    distance = speed * duration;
  }
  
  // Speed estimation
  const avgSpeed = distance ? distance / duration : undefined;
  
  // Average power estimation
  const avgPower = context.profile.ftp 
    ? context.profile.ftp * intensityFactor 
    : undefined;
  
  // Average HR estimation
  const avgHeartRate = estimateAvgHR(intensityFactor, context);
  
  // Moving time (typically 95% of duration for structured workouts)
  const movingTime = duration * 0.95;
  
  return {
    calories: Math.round(calories),
    distance: distance ? Math.round(distance) : undefined,
    avgPower: avgPower ? Math.round(avgPower) : undefined,
    avgHeartRate: avgHeartRate ? Math.round(avgHeartRate) : undefined,
    avgSpeed,
    movingTime: Math.round(movingTime),
    elevationGain: context.route?.totalAscent
  };
}

function estimateAvgHR(
  intensityFactor: number,
  context: EstimationContext
): number | undefined {
  const { threshold_hr, maxHR, restingHR } = context.profile;
  
  if (!threshold_hr && !maxHR) return undefined;
  
  // Use threshold HR if available, otherwise estimate from max HR
  const lthr = threshold_hr || (maxHR ? maxHR * 0.9 : undefined);
  if (!lthr) return undefined;
  
  // IF 1.0 = threshold HR
  // IF 0.5 = ~60% of threshold
  // Scale appropriately
  const hrPercent = 0.5 + (intensityFactor * 0.5);
  const avgHR = lthr * hrPercent;
  
  return Math.min(avgHR, maxHR || 220);
}
```

---

## Implementation Plan

### Phase 1: Core Estimation Engine ✅
**Files to create:**
- `packages/core/estimation/index.ts` - Main estimation orchestrator
- `packages/core/estimation/strategies.ts` - Structure/route/template strategies
- `packages/core/estimation/metrics.ts` - Additional metric estimations
- `packages/core/estimation/fatigue.ts` - Fatigue prediction logic
- `packages/core/estimation/types.ts` - TypeScript interfaces

**Key functions:**
```typescript
export function estimateActivity(context: EstimationContext): EstimationResult;
export function estimateMetrics(result: EstimationResult, context: EstimationContext): MetricEstimations;
export function predictFatigue(tss: number, date: Date, state: FitnessState, planned: PlannedActivity[]): FatiguePrediction;
export function estimateWeeklyLoad(planned: PlannedActivity[], currentState: FitnessState): WeeklyLoadEstimation;
```

### Phase 2: Profile Integration
**Updates needed:**
1. Enhance `useActivityPlanForm` to fetch user profile
2. Pass profile context to estimation functions
3. Add profile completeness indicators (e.g., "Add FTP for better estimates")

```typescript
// apps/mobile/lib/hooks/forms/useActivityPlanForm.ts

const { data: profile } = trpc.profiles.getCurrent.useQuery();
const { data: fitnessState } = trpc.trends.getCurrentFitness.useQuery();

const estimationContext: EstimationContext = {
  profile: {
    ftp: profile?.ftp,
    threshold_hr: profile?.threshold_hr,
    weightKg: profile?.weight_kg,
    age: profile?.dob ? calculateAge(profile.dob) : undefined,
  },
  fitnessState: fitnessState ? {
    ctl: fitnessState.ctl,
    atl: fitnessState.atl,
    tsb: fitnessState.tsb,
  } : undefined,
  activityType: form.activityCategory,
  location: form.activityLocation,
  structure: form.structure,
  route: selectedRoute,
};
```

### Phase 3: UI Components

#### A. Enhanced Metrics Display
**File**: `apps/mobile/components/ActivityPlan/EstimationMetrics.tsx`

```tsx
interface EstimationMetricsProps {
  estimation: EstimationResult;
  metrics: MetricEstimations;
  showDetails?: boolean;
}

export function EstimationMetrics({ estimation, metrics, showDetails }: EstimationMetricsProps) {
  return (
    <View className="bg-card rounded-lg border border-border p-4">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-medium">Estimated Metrics</Text>
        <View className={cn(
          "px-2 py-1 rounded",
          estimation.confidence === 'high' && "bg-green-500/10",
          estimation.confidence === 'medium' && "bg-yellow-500/10",
          estimation.confidence === 'low' && "bg-orange-500/10"
        )}>
          <Text className="text-xs font-medium">
            {estimation.confidence} confidence
          </Text>
        </View>
      </View>
      
      {/* Primary Metrics */}
      <View className="flex-row gap-4 mb-3">
        <MetricItem 
          label="TSS" 
          value={estimation.tss} 
          icon={<TrendingUp size={14} />}
        />
        <MetricItem 
          label="Duration" 
          value={formatDuration(estimation.duration)} 
          icon={<Clock size={14} />}
        />
        <MetricItem 
          label="IF" 
          value={estimation.intensityFactor.toFixed(2)} 
          icon={<Zap size={14} />}
        />
        <MetricItem 
          label="Calories" 
          value={metrics.calories} 
          icon={<Flame size={14} />}
        />
      </View>
      
      {showDetails && (
        <>
          {/* Secondary Metrics */}
          {metrics.distance && (
            <MetricItem label="Distance" value={formatDistance(metrics.distance)} />
          )}
          {metrics.avgPower && (
            <MetricItem label="Avg Power" value={`${metrics.avgPower}W`} />
          )}
          {metrics.avgHeartRate && (
            <MetricItem label="Avg HR" value={`${metrics.avgHeartRate} bpm`} />
          )}
          
          {/* Confidence factors */}
          <View className="mt-3 pt-3 border-t border-border">
            <Text className="text-xs text-muted-foreground mb-1">Based on:</Text>
            <View className="flex-row flex-wrap gap-1">
              {estimation.factors.map(factor => (
                <View key={factor} className="px-2 py-1 bg-muted rounded">
                  <Text className="text-xs">{factor}</Text>
                </View>
              ))}
            </View>
          </View>
          
          {/* Warnings */}
          {estimation.warnings && estimation.warnings.length > 0 && (
            <View className="mt-2 p-2 bg-yellow-500/10 rounded">
              {estimation.warnings.map((warning, i) => (
                <Text key={i} className="text-xs text-yellow-600">{warning}</Text>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}
```

#### B. Weekly TSS Preview
**File**: `apps/mobile/components/ActivityPlan/WeeklyTSSPreview.tsx`

```tsx
interface WeeklyTSSPreviewProps {
  scheduledDate: Date;
  estimatedTSS: number;
  fatiguePrediction: FatiguePrediction;
  currentState: FitnessState;
}

export function WeeklyTSSPreview({ 
  scheduledDate, 
  estimatedTSS, 
  fatiguePrediction,
  currentState 
}: WeeklyTSSPreviewProps) {
  const { weeklyProjection, afterActivity, warnings } = fatiguePrediction;
  
  return (
    <Card>
      <CardContent className="p-4">
        <Text className="text-base font-semibold mb-3">Weekly Impact</Text>
        
        {/* Weekly TSS Bar */}
        <View className="mb-4">
          <View className="flex-row justify-between mb-1">
            <Text className="text-sm text-muted-foreground">Weekly TSS</Text>
            <Text className="text-sm font-medium">
              {weeklyProjection.totalTSS} / {Math.round(currentState.ctl * 1.3)} target
            </Text>
          </View>
          <View className="h-2 bg-muted rounded-full overflow-hidden">
            <View 
              className={cn(
                "h-full rounded-full",
                weeklyProjection.isSafe ? "bg-green-500" : "bg-orange-500"
              )}
              style={{ 
                width: `${Math.min(100, (weeklyProjection.totalTSS / (currentState.ctl * 1.3)) * 100)}%` 
              }}
            />
          </View>
        </View>
        
        {/* Form Change */}
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-sm text-muted-foreground">Form Status</Text>
            <View className="flex-row items-center gap-2 mt-1">
              <Text className={cn(
                "text-lg font-semibold capitalize",
                getFormStatusColor(currentState.form)
              )}>
                {currentState.form}
              </Text>
              <Text className="text-muted-foreground">→</Text>
              <Text className={cn(
                "text-lg font-semibold capitalize",
                getFormStatusColor(afterActivity.form)
              )}>
                {afterActivity.form}
              </Text>
            </View>
          </View>
          
          <View className="items-end">
            <Text className="text-sm text-muted-foreground">TSB</Text>
            <Text className={cn(
              "text-lg font-semibold",
              afterActivity.tsb > 0 ? "text-green-600" : "text-orange-600"
            )}>
              {afterActivity.tsb > 0 ? "+" : ""}{afterActivity.tsb}
            </Text>
          </View>
        </View>
        
        {/* Ramp Rate */}
        <View className="p-3 bg-muted rounded-lg mb-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-medium">Ramp Rate</Text>
            <View className="flex-row items-center gap-2">
              <Text className={cn(
                "text-sm font-semibold",
                weeklyProjection.isSafe ? "text-green-600" : "text-orange-600"
              )}>
                {weeklyProjection.rampRate > 0 ? "+" : ""}{weeklyProjection.rampRate.toFixed(1)} TSS/week
              </Text>
              {weeklyProjection.isSafe ? (
                <CheckCircle size={16} className="text-green-600" />
              ) : (
                <AlertTriangle size={16} className="text-orange-600" />
              )}
            </View>
          </View>
          {!weeklyProjection.isSafe && (
            <Text className="text-xs text-muted-foreground mt-1">
              Recommended max: 8 TSS/week
            </Text>
          )}
        </View>
        
        {/* Recommendation */}
        <View className="p-3 bg-blue-500/10 rounded-lg">
          <Text className="text-sm text-blue-600">
            {weeklyProjection.recommendation}
          </Text>
        </View>
        
        {/* Warnings */}
        {warnings.length > 0 && (
          <View className="mt-3 p-3 bg-yellow-500/10 rounded-lg">
            <View className="flex-row items-start gap-2">
              <AlertTriangle size={16} className="text-yellow-600 mt-0.5" />
              <View className="flex-1">
                {warnings.map((warning, i) => (
                  <Text key={i} className="text-xs text-yellow-600 mb-1">
                    • {warning}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        )}
      </CardContent>
    </Card>
  );
}
```

#### C. Recovery Planner
**File**: `apps/mobile/components/ActivityPlan/RecoveryPlanner.tsx`

```tsx
export function RecoveryPlanner({ recoveryPlan }: { recoveryPlan: RecoveryPlan }) {
  return (
    <Card>
      <CardContent className="p-4">
        <Text className="text-base font-semibold mb-3">Recovery Plan</Text>
        
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-muted-foreground">Days to recover</Text>
            <Text className="text-lg font-semibold">{recoveryPlan.daysToRecover}</Text>
          </View>
          
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-muted-foreground">Next hard workout</Text>
            <Text className="text-sm font-medium">
              {format(recoveryPlan.nextHardWorkoutDate, 'EEE, MMM d')}
            </Text>
          </View>
          
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-muted-foreground">Suggested rest days</Text>
            <Text className="text-lg font-semibold">{recoveryPlan.suggestedRestDays}</Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}
```

### Phase 4: Integration into Creation Flow

**Update**: `apps/mobile/app/(internal)/(tabs)/plan/create_activity_plan/index.tsx`

```typescript
// Add estimation calculations
const estimation = useMemo(() => {
  if (!profile || !fitnessState) return null;
  
  const context: EstimationContext = {
    profile: {
      ftp: profile.ftp,
      threshold_hr: profile.threshold_hr,
      weightKg: profile.weight_kg,
      age: profile.dob ? calculateAge(profile.dob) : undefined,
    },
    fitnessState,
    activityType: activityCategory,
    location: activityLocation,
    structure,
    route: routeId ? routes.find(r => r.id === routeId) : undefined,
  };
  
  return estimateActivity(context);
}, [structure, profile, fitnessState, activityCategory, activityLocation, routeId]);

const metrics = useMemo(() => {
  if (!estimation) return null;
  return estimateMetrics(estimation, estimationContext);
}, [estimation]);

const fatiguePrediction = useMemo(() => {
  if (!estimation || !fitnessState || !scheduledDate) return null;
  return predictFatigue(
    estimation.tss,
    scheduledDate,
    fitnessState,
    weeklyPlannedActivities
  );
}, [estimation, fitnessState, scheduledDate, weeklyPlannedActivities]);
```

---

## Data Flow

```
1. User Profile + Fitness State
   └─> [Profile Query] → FTP, Threshold HR, Weight, Age
   └─> [Fitness Query] → CTL, ATL, TSB

2. Activity Plan Input
   └─> Structure (steps, targets, durations)
   └─> Route (distance, elevation)
   └─> Activity type, location

3. Estimation Context
   └─> Combine profile + fitness + activity data

4. Estimation Engine
   └─> Select strategy (structure/route/template)
   └─> Calculate TSS, duration, IF
   └─> Estimate metrics (calories, distance, zones)
   └─> Predict fatigue impact

5. UI Display
   └─> Show estimated metrics with confidence
   └─> Display weekly TSS preview
   └─> Show fatigue prediction & warnings
   └─> Suggest recovery plan

6. Save to Database
   └─> Store estimated_tss, estimated_duration
   └─> Link to route_id if applicable
```

---

## Database Schema Changes

**No changes needed!** The schema already supports:
- `activity_plans.estimated_tss` (integer)
- `activity_plans.estimated_duration` (integer, seconds)
- `activity_plans.route_id` (uuid, optional)

---

## Testing Strategy

### Unit Tests
```typescript
describe('TSS Estimation', () => {
  it('estimates TSS from structured workout', () => {
    const context = createTestContext({ ftp: 250 });
    const structure = createTestStructure(); // 60min @ 80% FTP
    const result = estimateActivity(context);
    
    expect(result.tss).toBeCloseTo(64, 1); // (1 hour * 0.8^2 * 100)
    expect(result.confidence).toBe('high');
  });
  
  it('estimates from route when no structure', () => {
    const context = createTestContext({ ftp: 250 });
    context.route = { distanceMeters: 50000, totalAscent: 800 };
    
    const result = estimateActivity(context);
    expect(result.tss).toBeGreaterThan(0);
    expect(result.confidence).toBe('medium');
  });
  
  it('predicts fatigue correctly', () => {
    const state = { ctl: 60, atl: 50, tsb: 10 };
    const prediction = predictFatigue(100, new Date(), state, []);
    
    expect(prediction.afterActivity.atl).toBeGreaterThan(50);
    expect(prediction.afterActivity.tsb).toBeLessThan(10);
  });
});
```

### Integration Tests
- Test with real user profiles
- Verify estimation accuracy vs actual activities
- Test confidence scoring
- Verify warning triggers

### Accuracy Tracking
- Store estimated vs actual TSS for completed activities
- Calculate MAPE (Mean Absolute Percentage Error)
- Adjust estimation models based on historical data
- Display accuracy stats to users

---

## Performance Considerations

1. **Caching**:
   - Cache user profile in memory (short TTL)
   - Cache fitness state for session
   - Memoize estimation results until inputs change

2. **Lazy Loading**:
   - Load route data only when needed
   - Defer fatigue prediction until scheduling step

3. **Debouncing**:
   - Debounce estimation recalculation on structure edits
   - Batch multiple estimation calls

---

## Future Enhancements

### V2: Machine Learning
- Train ML model on historical data
- Personalized estimation per user
- Account for sleep, stress, nutrition

### V3: Advanced Features
- Multi-week planning with CTL/ATL projections
- Automatic periodization suggestions
- Race readiness calculator
- Injury risk prediction
- Weather-adjusted estimates (outdoor activities)

### V4: Social Features
- Compare estimates with similar athletes
- Crowd-sourced route difficulty ratings
- Training plan templates with proven TSS progression

---

## Success Metrics

1. **Accuracy**: MAPE < 15% for structured workouts
2. **Adoption**: 80% of users schedule activities with estimates
3. **Confidence**: 90% of estimates have "high" or "medium" confidence
4. **User Satisfaction**: 4.5+ star rating on estimation feature
5. **Safety**: Reduce overtraining incidents by 30%

---

## Conclusion

This comprehensive TSS estimation system will empower users to:
- ✅ Plan training with confidence
- ✅ Understand fatigue impact before scheduling
- ✅ Build sustainable training progressions
- ✅ Prevent overtraining and injury
- ✅ Optimize performance through data-driven decisions

By integrating user profile data, fitness state, and intelligent estimation strategies, we provide accurate, actionable insights that help users train smarter and achieve their goals.
