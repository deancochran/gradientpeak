# GradientPeak Activity Recording: Feature Analysis & Bluetooth Control Gap

## Executive Summary

GradientPeak's mobile app includes a comprehensive activity recording feature with significant overlap with Auuki's workout execution capabilities. However, there's a critical missing piece: **Bluetooth device control**. This document analyzes the current recording feature, identifies the Bluetooth control gap, and explores the implications and potential solutions.

---

## Current Recording Capabilities

### What GradientPeak Does Well

**Local-First Recording Architecture:**
- SQLite-based offline recording with JSON structures
- Complete activity capture without network dependency
- Automatic background sync when connectivity restored
- Data integrity through core package validation

**Comprehensive Data Model:**
- Time-series activity streams (power, HR, cadence, speed)
- Full activity metadata (duration, distance, elevation)
- Performance calculations (TSS, NP, IF) via core package
- Structured activity format with nested repetitions
- Schema versioning for evolution

**Native Mobile Experience:**
- React Native app with Expo SDK 54
- Smooth 60fps animations with Reanimated
- Deep integration with mobile sensors
- Persistent state management with Zustand + AsyncStorage

**Analytics Pipeline:**
```
Record Activity (JSON)
    ↓
Store Locally (SQLite)
    ↓
Upload to Cloud (Supabase Storage)
    ↓
Generate Metadata & Streams
    ↓
Calculate Performance Metrics (Core Package)
    ↓
Display in Dashboard
```

### Recording Features In Place

✅ **Activity Structure Support:**
- Warm-up, intervals, cooldown sequences
- Multiple intensity target types (power, HR, pace)
- Nested repetitions and complex progressions
- Duration tracking (time, distance, lap-based)

✅ **Data Capture:**
- GPS location tracking
- Time-series sensor data
- Manual data entry support
- Offline-first architecture

✅ **Post-Recording Analysis:**
- TSS, normalized power, intensity factor
- Training load impact (CTL/ATL/TSB)
- Power curves and zone distribution
- Compliance scoring against planned activities

✅ **Platform Integration:**
- Supabase for cloud storage
- .FIT file export capability (likely)
- Intervals.icu integration (mentioned in docs)
- JSON-first data format

---

## The Bluetooth Control Gap

### What's Missing: Real-Time Device Control

**Current State:**
```
GradientPeak Mobile App
    ↓
Manual Recording / GPS Sensors
    ↓
Activity Data Captured
```

**Auuki's Advantage:**
```
Auuki Browser App
    ↓
Bluetooth Connection (Web Bluetooth API)
    ↓
Smart Trainer Control (FTMS/FE-C)
    ↓
Real-time Resistance/ERG Control
    ↓
Activity Data Recorded (.FIT)
```

### Specific Missing Capabilities

❌ **Device Connection:**
- No Bluetooth Low Energy (BLE) connectivity
- Cannot pair with smart trainers
- Cannot connect to power meters directly
- No heart rate monitor connectivity
- Missing ANT+ support

❌ **Real-Time Control:**
- No ERG mode (automatic resistance adjustment)
- No grade simulation
- No resistance mode control
- Cannot follow structured workout with automatic resistance
- No real-time target adjustments

❌ **Device Communication:**
- Cannot read power data directly from trainer
- Cannot control trainer resistance levels
- No real-time feedback loop between app and hardware
- Missing FTMS (Fitness Machine Service) protocol support
- Missing FE-C over BLE support
- No WahooCPS protocol support

❌ **Workout Execution:**
- No automatic workout progression with resistance changes
- Cannot enforce target power/resistance in real-time
- No slope-based intensity targets
- Missing .ZWO workout format import/execution

---

## Feature Overlap Analysis

### Areas of Strong Overlap

**1. Structured Workout Definition:**

| Feature | GradientPeak | Auuki | Overlap |
|---------|--------------|-------|---------|
| Workout structure format | ✅ Custom JSON | ✅ .ZWO format | 🟡 Different formats, same concept |
| Nested intervals | ✅ Full support | ✅ Full support | ✅ Direct overlap |
| Multiple target types | ✅ Power, HR, pace | ✅ Power, HR, slope | ✅ Strong overlap |
| Duration tracking | ✅ Time/distance/laps | ✅ Time/distance/reps | ✅ Strong overlap |
| Pre-built workouts | ✅ Library system | ✅ Built-in workouts | ✅ Direct overlap |

**2. Activity Recording:**

| Feature | GradientPeak | Auuki | Overlap |
|---------|--------------|-------|---------|
| Local recording | ✅ SQLite + JSON | ✅ Browser storage | 🟡 Different tech, same pattern |
| Offline capability | ✅ Full offline | ✅ Browser-based | 🟡 GradientPeak stronger |
| Data export | ✅ JSON/.FIT | ✅ .FIT | ✅ Strong overlap |
| Cloud sync | ✅ Supabase | ✅ Intervals.icu/Strava | 🟡 Different approaches |

**3. Workout Library:**

Both apps provide:
- Pre-built structured workouts
- Ability to import workouts
- Workout organization and management
- Integration with external platforms (Intervals.icu)

### The Critical Differentiator: Hardware Control

**Auuki's Unique Value:**
```
User Opens App
    ↓
Connects Smart Trainer (Bluetooth)
    ↓
Selects Structured Workout
    ↓
App Automatically Controls Resistance
    ↓
User Follows Visual Cues
    ↓
Activity Recorded with Perfect Execution
```

**GradientPeak's Current Experience:**
```
User Opens App
    ↓
Selects Planned Activity
    ↓
Starts Recording
    ↓
Manually Adjusts Trainer Resistance
    ↓
Tries to Match Target Zones
    ↓
Activity Recorded (may not match plan perfectly)
```

### User Experience Gap

**Without Bluetooth Control:**
- Athletes must manually adjust resistance on trainer
- No guarantee of hitting exact target power/resistance
- Requires constant attention to targets vs actual output
- Harder to execute complex interval structures
- More cognitive load during workout

**With Bluetooth Control (Auuki):**
- Automatic resistance adjustments
- Perfect execution of workout structure
- Athlete can focus on effort, not numbers
- Seamless interval transitions
- Lower cognitive load

---

## Technical Implementation Analysis

### React Native BLE PLX Integration

GradientPeak already has **React Native BLE PLX** listed as a dependency:

```
**Expo SQLite + FileSystem** - Offline-first data persistence
**React Native BLE PLX** - Bluetooth Low Energy device integration
**React Native Reanimated** - Smooth 60fps animations and gestures
```

This suggests Bluetooth capability is **partially implemented** or **planned**.

### What Would Be Required for Full Bluetooth Control

**1. BLE Protocol Implementation:**
```typescript
// Core BLE connection flow
import { BleManager } from 'react-native-ble-plx';

class TrainerConnectionManager {
  // Scan for devices
  async scanForTrainers() {
    // Look for FTMS service UUID
    // Filter for supported protocols (FTMS, FE-C, WahooCPS)
  }
  
  // Connect to selected device
  async connectToTrainer(deviceId: string) {
    // Establish BLE connection
    // Subscribe to characteristics
  }
  
  // Control trainer resistance
  async setTargetPower(watts: number) {
    // Write to FTMS control characteristic
    // Handle ERG mode
  }
  
  // Read real-time data
  async readPowerData() {
    // Subscribe to power measurement characteristic
    // Parse incoming data
  }
}
```

**2. Protocol Support:**
- **FTMS (Fitness Machine Service)** - Standard Bluetooth protocol
  - Power Target Control
  - Resistance Control
  - Indoor Bike Data characteristic
  - Training Status
  
- **FE-C over BLE** - Tacx-specific protocol
  - Specialized for NEO trainers
  - Similar control modes
  
- **WahooCPS** - Wahoo-specific protocol
  - Custom power control service

**3. Control Modes:**
```typescript
enum ControlMode {
  ERG = 'erg',              // Target power (watts)
  SIMULATION = 'simulation', // Grade simulation (%)
  RESISTANCE = 'resistance'  // Manual resistance level
}

interface WorkoutTarget {
  mode: ControlMode;
  value: number;           // Watts, %, or resistance level
  duration: number;        // Seconds
}
```

**4. Real-time Workout Execution:**
```typescript
class WorkoutExecutor {
  private currentStep: WorkoutStep;
  private elapsedTime: number;
  private trainer: TrainerConnectionManager;
  
  async executeWorkout(workout: StructuredWorkout) {
    for (const step of workout.steps) {
      await this.executeStep(step);
    }
  }
  
  async executeStep(step: WorkoutStep) {
    // Set trainer target based on step
    await this.trainer.setTargetPower(step.targetPower);
    
    // Monitor progress
    this.monitorStepProgress(step.duration);
    
    // Transition to next step
  }
}
```

---

## Impact on User Experience

### Current User Journey (Without BLE Control)

**Indoor Cycling Workout:**
1. Open GradientPeak app
2. Select planned workout (e.g., "4x8min Threshold Intervals")
3. Start recording
4. Manually check current target (e.g., "240W for 8 minutes")
5. Manually adjust trainer resistance using buttons/shifters
6. Monitor power output vs target
7. Manually adjust when drifting from target
8. Repeat for each interval
9. Stop recording
10. View analytics

**Pain Points:**
- Constant attention to power numbers
- Manual resistance adjustments disrupt flow
- Easy to miss targets during fatigue
- Complex intervals are harder to execute
- More room for human error

### Potential User Journey (With BLE Control)

**Indoor Cycling Workout:**
1. Open GradientPeak app
2. Connect to smart trainer (one-time pairing)
3. Select planned workout
4. Start recording
5. App automatically controls resistance throughout workout
6. Focus on pedaling and effort
7. App handles all transitions automatically
8. Stop recording
9. View analytics

**Benefits:**
- Reduced cognitive load during workout
- Perfect execution of complex intervals
- More engaging workout experience
- Better compliance with training plan
- Can focus on form and effort

---

## Strategic Considerations

### Market Positioning

**Current Position:**
- Comprehensive training platform (planning + analytics)
- Strong offline-first architecture
- Deep performance analytics
- Multi-sport support

**With Bluetooth Control:**
- **Self-contained training solution** (plan → execute → analyze)
- Competitive with specialized workout apps
- No need for companion apps during workouts
- True "all-in-one" positioning

### Competitive Landscape

**Without BLE Control:**
- Users need Auuki (or similar) for structured indoor workouts
- Split workflow across multiple apps
- GradientPeak is "planning and analytics only"

**With BLE Control:**
- Direct competition with Zwift, TrainerRoad, Sufferfest
- Can capture entire user workflow
- Higher user engagement (daily workout execution)
- Stronger value proposition

### User Retention Impact

**Workout Execution = Daily Touchpoint:**
- Planning: Weekly or bi-weekly
- Recording without control: Occasional (outdoor rides)
- Recording with BLE control: 3-5x per week (indoor training)

**With BLE Control:**
- Users open app every indoor workout (more frequent)
- Higher engagement leads to better retention
- More opportunities to demonstrate value
- Stronger habit formation

---

## Development Priority Matrix

### High Priority: Core BLE Implementation

**Why It Matters:**
- Largest functional gap vs competitors
- Directly impacts user experience
- Enables true end-to-end workflow
- High user demand in cycling/triathlon

**Effort Estimate:**
- React Native BLE PLX already in stack ✅
- Need FTMS protocol implementation (Medium)
- Need real-time workout executor (Medium)
- Need UI for device pairing (Low)
- Testing across trainer brands (High)

**Dependencies:**
- Core package workout structure already defined ✅
- Recording infrastructure already built ✅
- Need protocol specifications (FTMS, FE-C)
- Need test devices (various trainer brands)

### Medium Priority: Enhanced Protocols

**Extended Protocol Support:**
- ANT+ via dongles (lower priority, smaller market)
- Brand-specific optimizations (Wahoo, Tacx)
- Advanced control modes (slope simulation)

### Lower Priority: Ecosystem Integration

**.ZWO Format Import:**
- Compatibility with Zwift workouts
- Easier onboarding for existing users
- Not critical if custom format works well

---

## Implementation Roadmap

### Phase 1: MVP Bluetooth Control (4-6 weeks)

**Core Features:**
- ✅ Device scanning and pairing
- ✅ FTMS protocol support (most trainers)
- ✅ ERG mode (target power control)
- ✅ Real-time data reading (power, cadence, HR)
- ✅ Basic workout execution (step progression)

**Success Metrics:**
- Can connect to 80%+ of modern smart trainers
- Accurate power control within ±5 watts
- Smooth transitions between intervals
- Stable connection throughout workout

### Phase 2: Enhanced Control (2-3 weeks)

**Additional Features:**
- ✅ Grade simulation mode
- ✅ Resistance level mode
- ✅ FE-C over BLE (Tacx NEO support)
- ✅ Multi-device support (trainer + HR monitor)

### Phase 3: Polish & Optimization (2-3 weeks)

**Quality Improvements:**
- ✅ Connection reliability improvements
- ✅ Better error handling and recovery
- ✅ Device compatibility testing
- ✅ Performance optimization
- ✅ UI/UX refinements

### Phase 4: Advanced Features (Future)

**Nice-to-Have:**
- ANT+ support via dongles
- Brand-specific protocols (WahooCPS)
- .ZWO format import
- Workout creator with preview
- Real-time workout adjustments

---

## Technical Challenges & Solutions

### Challenge 1: Protocol Complexity

**Problem:**
- Multiple protocols (FTMS, FE-C, WahooCPS)
- Brand-specific quirks
- Incomplete documentation

**Solution:**
- Start with FTMS (widest compatibility)
- Leverage open-source implementations
- Community testing for edge cases

### Challenge 2: Connection Reliability

**Problem:**
- BLE connections can be finicky
- Interference from other devices
- iOS/Android differences

**Solution:**
- Implement robust reconnection logic
- Clear user feedback on connection status
- Fallback to manual recording if connection lost

### Challenge 3: Real-time Performance

**Problem:**
- React Native overhead
- Need sub-second response times
- Battery consumption

**Solution:**
- Use native modules for critical paths
- Optimize BLE message frequency
- Implement efficient state updates
- Background processing for data

### Challenge 4: Device Compatibility

**Problem:**
- Hundreds of trainer models
- Firmware variations
- Non-standard implementations

**Solution:**
- Prioritize popular brands (Wahoo, Tacx, Elite, Saris)
- Community-driven compatibility testing
- Graceful degradation for unsupported features
- Clear documentation of supported devices

---

## Competitive Analysis

### Apps With BLE Control

**Zwift:**
- ✅ BLE control (ERG, simulation)
- ✅ Massive trainer compatibility
- ✅ Gamification
- ❌ Weak analytics
- ❌ No training planning

**TrainerRoad:**
- ✅ BLE control (ERG focus)
- ✅ Excellent trainer compatibility
- ✅ Training plans
- ❌ No gamification
- ❌ Web-only analytics

**Sufferfest/Systm:**
- ✅ BLE control
- ✅ Video workouts
- ✅ Training plans
- ❌ Subscription required
- ❌ Limited customization

**Auuki:**
- ✅ BLE control (ERG, simulation, resistance)
- ✅ Browser-based (no install)
- ✅ Free and open-source
- ✅ .ZWO compatibility
- ❌ No planning
- ❌ No analytics
- ❌ No iOS support (web version)

### GradientPeak's Potential Advantage

**With BLE Control Added:**
- ✅ BLE control (full modes)
- ✅ Training planning
- ✅ Deep analytics
- ✅ Multi-sport support
- ✅ Offline-first architecture
- ✅ Native mobile apps (iOS + Android)
- ✅ Local-first data ownership

**Unique Value Proposition:**
- Complete training lifecycle in one app
- No subscription required (if staying true to current model)
- Enterprise-grade architecture
- Full data ownership
- Superior analytics

---

## Resource Requirements

### Development Resources

**Engineering:**
- 1 Senior React Native Developer (lead)
- 1 Mobile Developer (iOS/Android testing)
- 1 Backend Developer (protocol specs, testing infrastructure)

**Timeline:**
- MVP: 4-6 weeks
- Enhanced: 2-3 weeks
- Polish: 2-3 weeks
- **Total: ~10-12 weeks to production-ready**

### Testing Resources

**Hardware:**
- Smart trainers for testing (5-10 models)
  - Wahoo KICKR
  - Tacx NEO
  - Elite Direto
  - Saris H3
  - Budget trainer (for compatibility)
  
**Beta Testing:**
- 20-50 users with various trainer models
- Mix of iOS and Android devices
- Different workout types and durations

### Ongoing Support

**Compatibility:**
- New trainer releases (quarterly updates)
- Firmware compatibility testing
- User-reported issues

---

## Risks & Mitigation

### Risk 1: Device Compatibility Issues

**Risk:**
- Trainers don't work as expected
- Brand-specific quirks
- Firmware bugs

**Mitigation:**
- Start with most popular brands
- Extensive compatibility testing
- Clear documentation of supported devices
- Community feedback loop

**Severity:** Medium  
**Likelihood:** High  
**Mitigation Effort:** Ongoing

### Risk 2: Development Complexity

**Risk:**
- Underestimate implementation effort
- Protocol documentation insufficient
- BLE stack issues on mobile platforms

**Mitigation:**
- Leverage existing libraries (react-native-ble-plx)
- Reference open-source implementations
- Allocate buffer time for unknowns
- Start with MVP scope

**Severity:** Medium  
**Likelihood:** Medium  
**Mitigation Effort:** High

### Risk 3: User Adoption

**Risk:**
- Users already have workflow with other apps
- Learning curve for new features
- Feature not valued as expected

**Mitigation:**
- Clear onboarding and tutorials
- Optional feature (doesn't break existing workflows)
- Beta testing for user feedback
- Marketing the complete solution

**Severity:** Low  
**Likelihood:** Medium  
**Mitigation Effort:** Medium

### Risk 4: Battery Drain

**Risk:**
- Constant BLE communication drains battery
- Background processing impact
- User complaints about battery life

**Mitigation:**
- Optimize BLE message frequency
- Efficient state management
- Battery usage monitoring
- User controls for data collection frequency

**Severity:** Low  
**Likelihood:** Medium  
**Mitigation Effort:** Medium

---

## Return on Investment Analysis

### Development Cost

**Engineering Time:**
- 10-12 weeks × 2-3 engineers = ~20-30 person-weeks
- Assume $150K/year salary → ~$3K/week
- **Total Development Cost: ~$60-90K**

**Hardware & Testing:**
- Smart trainers: ~$5K
- Beta testing: ~$2K
- **Total Hardware/Testing: ~$7K**

**Total Investment: ~$70-100K**

### Potential Return

**User Acquisition:**
- Converts indoor training users from competitors
- Appeals to serious cyclists/triathletes
- Complete solution = higher perceived value

**User Retention:**
- Daily touchpoint (indoor workouts 3-5x/week)
- Reduces dependency on other apps
- Higher engagement = better retention
- Estimated retention improvement: +20-30%

**Revenue Impact (if subscription model):**
- More complete product = higher willingness to pay
- Competitive with $20-30/month apps
- User retention improvement = lifetime value increase

**Strategic Value:**
- Product differentiation
- Competitive positioning
- Market expansion (indoor training segment)

**Estimated Payback:**
- With 1,000 active users @ $10/month
- Retention improvement saves customer acquisition costs
- **Payback period: 6-12 months**

---

## Recommendations

### 1. Prioritize Bluetooth Control Implementation

**Rationale:**
- Largest functional gap in product
- High user demand
- Competitive necessity for indoor training market
- Enables complete "plan → execute → analyze" workflow

**Action Items:**
- Conduct technical spike (1 week) to validate feasibility
- Create detailed implementation plan
- Allocate engineering resources
- Establish testing infrastructure

### 2. Start With FTMS MVP

**Rationale:**
- FTMS supports 80%+ of modern trainers
- Well-documented standard protocol
- Lower complexity than brand-specific protocols
- Faster time to market

**Action Items:**
- Implement FTMS device discovery
- Build ERG mode control
- Create basic workout executor
- Test with 3-5 popular trainer models

### 3. Leverage Existing Architecture

**Rationale:**
- React Native BLE PLX already in stack
- Workout structure already defined
- Recording infrastructure in place
- Core package has validation logic

**Action Items:**
- Audit current BLE implementation (if any)
- Map workout structure to BLE commands
- Integrate with existing recording flow
- Ensure core package compatibility

### 4. Plan for Iterative Release

**Rationale:**
- Get user feedback early
- Validate technical approach
- Build compatibility incrementally
- Reduce risk

**Release Strategy:**
- Beta: 20-50 users, 3-5 trainer models
- Limited release: 100-200 users, major brands
- General availability: All users, broad compatibility

### 5. Differentiate From Competitors

**Rationale:**
- Market is crowded with BLE-enabled apps
- GradientPeak has unique strengths to leverage
- Complete ecosystem is key differentiator

**Positioning:**
- "Complete training solution" (plan + execute + analyze)
- "Enterprise-grade analytics" (TSS, CTL/ATL/TSB, power curves)
- "Offline-first" (train anywhere, sync later)
- "Multi-sport" (not just cycling)
- "Data ownership" (local-first architecture)

---

## Conclusion

GradientPeak's activity recording feature has **significant overlap** with Auuki's capabilities, but the **absence of Bluetooth device control** represents a critical gap that prevents users from experiencing seamless structured workout execution.

**Key Findings:**

1. **Strong Foundation:** Recording infrastructure, workout structures, and analytics are already in place
2. **Clear Gap:** Bluetooth control for smart trainers is the missing piece
3. **High Impact:** Adding BLE control would complete the training lifecycle and significantly differentiate GradientPeak
4. **Feasible:** React Native BLE PLX is already in the stack; FTMS protocol is well-documented
5. **Strategic Priority:** This feature is essential for competing in the indoor training market

**The Bottom Line:**

Without Bluetooth control, GradientPeak requires users to:
- Use companion apps (like Auuki) for structured indoor workouts
- Manually control trainer resistance
- Accept suboptimal workout execution

With Bluetooth control, GradientPeak becomes:
- A complete, self-contained training solution
- Competitive with established players (Zwift, TrainerRoad)
- More valuable to users (daily engagement vs weekly)
- Better positioned for user retention and growth

**Recommendation:** Prioritize Bluetooth device control implementation as a high-value feature that leverages existing infrastructure and positions GradientPeak as a comprehensive training platform.
