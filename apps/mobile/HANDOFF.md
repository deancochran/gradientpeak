# **Comprehensive Database Schema & Activity Recording Improvement Plan**

## **🔍 Current Issues Identified**

### 1. **SQL Function Parameter Mismatch**
- **Error**: `activity_payload is not a column`
- **Root Cause**: SQL function `create_activity` uses `activity_payload` and `streams_payload` but parameters are named `activity` and `activity_streams`

```gradientpeak/packages/supabase/schemas/0002_activities_and_streams_rpc.sql#L1-12
create or replace function create_activity(
    activity jsonb,              -- ❌ Function param is 'activity'
    activity_streams jsonb       -- ❌ Function param is 'activity_streams'
) returns jsonb as $$
declare
    new_activity activities%rowtype;
    stream_item jsonb;
begin
    -- insert activity
    insert into activities
    select *
    from jsonb_populate_record(null::activities, activity_payload) -- ❌ Using wrong variable name
```

### 2. **Missing Adherence Score Calculation**
- **Current State**: `adherence_score` column exists but no calculation happens during insertion
- **Issue**: Activity submission doesn't compute adherence before database insertion

```gradientpeak/apps/mobile/src/lib/hooks/useActivitySubmission.ts#L350-393
// ❌ Missing adherence_score calculation in calculateActivityMetrics()
return {
    elapsed_time,
    moving_time,
    // ... other metrics
    // ❌ adherence_score: undefined (not calculated)
};
```

### 3. **Incomplete Adherence Implementation**
- **Core Logic**: Exists but marked as TODO in `packages/core/calculations.ts`
- **Real-time Display**: Missing during activity recording
- **UI Components**: Hardcoded placeholder values

---

## **🎯 Comprehensive Improvement Plan**

### **Phase 1: Fix Immediate Database Issues (High Priority)**

#### **1.1 Fix SQL Function Parameter Names**
```gradientpeak/packages/supabase/schemas/0002_activities_and_streams_rpc.sql#L1-26
create or replace function create_activity(
    activity jsonb,
    activity_streams jsonb
) returns jsonb as $$
declare
    new_activity activities%rowtype;
    stream_item jsonb;
begin
    -- ✅ Fix: Use correct parameter names
    insert into activities
    select *
    from jsonb_populate_record(null::activities, activity)
    returning * into new_activity;

    -- ✅ Fix: Use correct parameter names
    for stream_item in
        select * from jsonb_array_elements(activity_streams)
    loop
        insert into activity_streams
        select
            new_activity.id as activity_id,
            *
        from jsonb_populate_record(null::activity_streams, stream_item);
    end loop;

    return to_jsonb(new_activity);
end;
$$ language plpgsql;
```

#### **1.2 Add Adherence Score to Activity Metrics Calculation**
```gradientpeak/apps/mobile/src/lib/hooks/useActivitySubmission.ts#L231-400
function calculateActivityMetrics(
  recording: SelectActivityRecording,
  aggregatedStreams: Map<string, AggregatedStream>,
): Omit<PublicActivitiesInsert, /*...*/ > {
  // ... existing calculations ...

  // ✅ Add adherence score calculation
  const adherence_score = calculateAdherenceScoreForRecording(
    recording,
    aggregatedStreams
  );

  return {
    // ... existing metrics ...
    adherence_score, // ✅ Include in return object
  };
}
```

### **Phase 2: Implement Complete Adherence System (Medium Priority)**

#### **2.1 Complete Core Adherence Calculation Logic**
Create comprehensive adherence calculation in `packages/core/calculations.ts`:

```/dev/null/adherence-implementation.ts#L1-50
export interface AdherenceCalculationInput {
  activityPlan: RecordingServiceActivityPlan;
  aggregatedStreams: Map<string, AggregatedStream>;
  userProfile: {
    ftp?: number;
    thresholdHR?: number;
    weight?: number;
  };
}

export function calculateAdherenceScore(
  input: AdherenceCalculationInput
): number {
  const { activityPlan, aggregatedStreams, userProfile } = input;

  if (!activityPlan.structure?.steps) return 100; // No plan = perfect adherence

  const stepScores: number[] = [];

  // Calculate adherence for each step in the plan
  for (const step of activityPlan.structure.steps) {
    const stepScore = calculateStepAdherence(
      step,
      aggregatedStreams,
      userProfile
    );
    stepScores.push(stepScore);
  }

  // Weight by step duration for overall score
  const totalDuration = activityPlan.structure.steps.reduce(
    (sum, step) => sum + getDurationMs(step.duration),
    0
  );

  let weightedScore = 0;
  for (let i = 0; i < stepScores.length; i++) {
    const stepDuration = getDurationMs(activityPlan.structure.steps[i].duration);
    const weight = stepDuration / totalDuration;
    weightedScore += stepScores[i] * weight;
  }

  return Math.round(Math.max(0, Math.min(100, weightedScore)));
}

function calculateStepAdherence(
  step: FlattenedStep,
  aggregatedStreams: Map<string, AggregatedStream>,
  userProfile: { ftp?: number; thresholdHR?: number; weight?: number }
): number {
  const scores: number[] = [];

  // Power adherence (for cycling activities)
  if (step.targets.power && userProfile.ftp) {
    const powerStream = aggregatedStreams.get("power");
    if (powerStream) {
      const targetWatts = (step.targets.power.intensity / 100) * userProfile.ftp;
      const actualWatts = powerStream.avgValue || 0;
      scores.push(calculateIntensityAdherence(actualWatts, targetWatts));
    }
  }

  // Heart rate adherence
  if (step.targets.heartRate && userProfile.thresholdHR) {
    const hrStream = aggregatedStreams.get("heartrate");
    if (hrStream) {
      const targetHR = (step.targets.heartRate.intensity / 100) * userProfile.thresholdHR;
      const actualHR = hrStream.avgValue || 0;
      scores.push(calculateIntensityAdherence(actualHR, targetHR));
    }
  }

  // Pace adherence (for running activities)
  if (step.targets.pace) {
    const speedStream = aggregatedStreams.get("speed");
    if (speedStream) {
      const targetSpeed = step.targets.pace.intensity; // Assuming speed in m/s
      const actualSpeed = speedStream.avgValue || 0;
      scores.push(calculateIntensityAdherence(actualSpeed, targetSpeed));
    }
  }

  return scores.length > 0
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : 100; // No targets = perfect adherence
}

function calculateIntensityAdherence(actual: number, target: number): number {
  if (target <= 0) return 100;

  const tolerance = 0.1; // 10% tolerance
  const ratio = Math.abs(actual - target) / target;

  if (ratio <= tolerance) return 100;
  if (ratio >= 0.5) return 0; // More than 50% off = 0 adherence

  // Linear decay from 100% at tolerance to 0% at 50% difference
  return Math.round(100 * (1 - (ratio - tolerance) / (0.5 - tolerance)));
}
```

#### **2.2 Real-Time Adherence Display During Recording**

Update the recording UI to show live adherence scores:

```gradientpeak/apps/mobile/src/components/RecordingCarousel/cards/EnhancedPlanCard.tsx#L539-571
const EnhancedPlanCard = memo<Props>(({ service }) => {
  // ... existing code ...

  // ✅ Calculate real-time adherence
  const adherenceScore = useMemo(() => {
    if (!hasPlan || !service?.plan || !currentStepInfo) return undefined;

    // Get current streams for real-time calculation
    const currentStreams = service.getAggregatedStreams();

    return calculateAdherenceScore({
      activityPlan: service.plan,
      aggregatedStreams: currentStreams,
      userProfile: {
        ftp: service.profile?.ftp,
        thresholdHR: service.profile?.threshold_hr,
        weight: service.profile?.weight_kg,
      }
    });
  }, [hasPlan, service?.plan, currentStepInfo, service?.getAggregatedStreams()]);

  return (
    <View className="bg-card rounded-xl p-4 shadow-sm border border-border/20">
      <CardHeaderView
        adherenceScore={adherenceScore} // ✅ Real-time score
        hasPlan={hasPlan}
        isFinished={isFinished}
        planName={planName}
      />
      {/* ... rest of component */}
    </View>
  );
});
```



## **🚀 Implementation Timeline & Priority**

### Critical Fixes (Must Do)**
1. ✅ Fix SQL function parameter names
2. ✅ Add adherence calculation to activity submission
3. ✅ Complete core adherence logic in `packages/core`

### Real-time Features (High Impact)**
1. ✅ Implement real-time adherence display during recording EnhancedPlanCard
2. ✅ Update recording UI components in EnhancedPlanCard
