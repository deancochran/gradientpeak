# TurboFit Mobile App - MVP Roadmap

## 🎯 MVP Focus

This roadmap focuses on the **three essential features** needed to compete with Strava/TrainingPeaks as a viable fitness tracking alternative. All features are designed around the **JSON-first architecture** where activities are stored as complete JSON objects in Supabase Storage.

---

## 📊 Current State Analysis

### ✅ **Solid Foundation Already Built**
- **Authentication System**: Complete Supabase auth with all screens
- **Activity Recording**: Advanced GPS tracking, BLE sensors, fault-tolerant recording
- **Local-First Architecture**: Expo SQLite with JSON storage and cloud sync
- **UI Infrastructure**: NativeWind styling, tab navigation, reusable components
- **Core Business Logic**: Database-independent @repo/core package with calculations
- **Profile Management**: User profiles, FTP, threshold HR, training zones

### 🔄 **Architecture Strengths**
- **JSON Source of Truth**: Activities stored as complete JSON in Supabase Storage
- **Database-Independent Core**: Pure TypeScript calculations without ORM dependencies
- **Offline-First**: Local SQLite recording with intelligent cloud sync
- **Metadata Generation**: Activity records and streams derived from JSON post-upload

### 🎯 **MVP Gap Analysis**
The mobile app has **excellent infrastructure** but displays **mock data**. The main work is **connecting real data flows** through the existing well-designed system.

---

## 🚀 MVP Feature Completion

## 1. **Real Data Integration** (Priority 1) ⚠️ **Partially Complete**

### **Connect Performance Metrics to Real Activities**

#### 1.1 Home Screen Data Flow ✅
- [x] **Replace Mock Performance Data**
  - ✅ Enhanced `usePerformanceMetrics` hook to process real activity data from `ActivityService`
  - ✅ Connected CTL/ATL/TSB calculations to actual user activity metadata via `@repo/core` package
  - ✅ Display real weekly/monthly TSS from user's activity history with TSS estimation
  - ✅ Show actual training load progression instead of mock data

- [x] **Real Activity History Display**
  - ✅ Display actual recorded activities instead of mock data on home screen
  - ✅ Show real activity sync status indicators from `ActivityService`
  - ✅ Added real activity metrics (distance, duration, TSS) to activity cards
  - ✅ Connected to existing `useActivityManager` hook for data fetching

#### 1.2 Core Data Integration ✅
- [x] **Database Query Implementation**
  - ✅ Connected @repo/core TSS calculations to real activity data
  - ✅ Implemented CTL/ATL/TSB progression from activity metadata using `analyzeTrainingLoad`
  - ✅ Calculate real performance metrics from recorded activities with smart TSS estimation
  - ✅ Added proper TypeScript types for `PerformanceMetrics` in core package

### ⚠️ **Major Gaps Identified in Section 1**

#### 1.3 Activity Recording System (Priority 1A)
- [ ] **Complete Activity Recording Modal**
  - ✅ Current record screen needs major improvements for GPS tracking
  - ✅ BLE sensor integration needs completion (needs to handle hr, power, cadence, speed, etc...)
  - ✅ Real-time activity data capture and display during recording
  - ✅ Real time clock needs to correctly display time elapsed during recording (the duration value)
  - ✅ Structured activity following (intervals, rest periods) if user chooses a structured planned activity
  - ✅ Activity completion flow and JSON generation

#### 1.4 Trends Screen Implementation (Priority 1B)
- [ ] **Complete Victory Native Charts Implementation**
  - ⚠️ Basic chart structure exists but uses mock data
  - ❌ Training load progression charts need real data integration
  - ❌ Power/HR zone distribution charts missing
  - ❌ Performance curve analysis not implemented

#### 1.5 Activity Detail Views (Priority 1C)
- [ ] **Activity History and Detail Screens**
  - ❌ No individual activity detail modal/screen exists
  - ❌ Cannot view completed activity analysis, splits, maps
  - ❌ No activity editing capabilities (name, notes, sport type)
  - ❌ Missing activity comparison and PR tracking
  - ❌ No activity export functionality (JSON, TCX)

---

## 2. **Complete Core Activity Features** (Priority 2)

### **Activity Recording & Management**

#### 2.1 Enhanced Activity Recording
- [ ] **GPS & Sensor Integration**
  - Improve real-time GPS tracking accuracy and display
  - Complete BLE sensor integration (HR, power, cadence)
  - Add activity pausing/resuming functionality
  - Implement auto-pause for stopped periods

- [ ] **Recording Interface Improvements**
  - Real-time metrics display during recording
  - Lap/split recording functionality
  - Audio/vibration alerts for intervals
  - Battery optimization for long activities

#### 2.2 Activity Detail & Analysis
- [ ] **Individual Activity Screens**
  - Create detailed activity analysis screen
  - Show activity map with GPS route
  - Display splits, laps, and zone analysis
  - Activity editing (name, sport type, notes, privacy)

- [ ] **Activity Management**
  - Activity deletion with confirmation
  - Bulk operations (delete multiple, export)
  - Activity search and filtering
  - Personal records tracking and display

#### 2.3 Enhanced Trends & Analytics
- [ ] **Complete Chart Implementations**
  - Power/HR zone distribution pie charts
  - Training peaks and performance curves
  - Comparison charts (week over week, year over year)
  - Interactive chart features with drill-down

- [ ] **Advanced Analytics**
  - Fitness progression modeling
  - Training effectiveness scoring
  - Recovery recommendations
  - Performance predictions

---

## 3. **Training Plan System** (Priority 3)

### **Implement Real Training Plans**

#### 2.1 Training Plan Infrastructure
- [ ] **Plan Templates & Assignment**
  - Create basic training plan templates (beginner, intermediate, advanced)
  - Implement plan assignment to user profiles
  - Build plan scheduling logic for weekly/daily activity distribution
  - Add plan duration and periodization structure

- [ ] **Connect Plan Screen to Real Data**
  - Replace mock planned activities with real `planned_activities` queries
  - Display actual scheduled workouts from user's assigned plan
  - Show real plan progress and completion status
  - Implement activity scheduling and calendar integration

#### 2.2 Structured Activity Support
- [ ] **Activity Structure Integration**
  - Enhance activity recorder to follow structured activity steps
  - Add activity step guidance during recording (intervals, rest periods, zones)
  - Implement activity progress tracking within recording session
  - Create activity step completion validation

- [ ] **Activity Compliance & Feedback**
  - Build activity completion analysis using @repo/core algorithms
  - Implement plan adherence scoring based on completed vs planned workouts
  - Add activity effectiveness analysis (actual vs target metrics)
  - Create plan adaptation recommendations based on performance

#### 2.3 Activity Library
- [ ] **Common Activity Types**
  - Create library of standard activity structures (intervals, tempo, endurance)
  - Implement activity structure validation using @repo/core schemas
  - Add activity intensity target calculations (HR zones, power zones)
  - Build activity duration and TSS estimation algorithms

---

## 4. **Advanced Features** (Priority 4)

### **Social & Sharing Features**

#### 4.1 Activity Sharing
- [ ] **Basic Social Features**
  - Activity sharing to social media
  - Public activity feeds
  - Follow/unfollow other users
  - Activity comments and kudos

#### 4.2 Data Export & Integration
- [ ] **Platform Integrations**
  - Strava export/sync functionality
  - TrainingPeaks integration
  - TCX/FIT file export
  - Health app synchronization

---

## 🛠 Technical Implementation Notes

### **JSON-First Architecture Considerations**
- All activity analysis derives from JSON stored in Supabase Storage
- Activity metadata records are generated locally and synced post-JSON upload
- Activity streams are created from JSON data after successful cloud storage
- @repo/core package processes JSON independently of database structure

### **Database Independence**
- @repo/core package remains completely database-agnostic
- All business logic calculations work on JSON data structures
- Database queries handled by Drizzle package, not core package
- Type safety maintained through JSON schema validation

### **Performance Optimization**
- Cache frequently accessed activity JSON for offline analysis
- Implement efficient JSON parsing and calculation pipelines
- Use React Query for intelligent data caching and synchronization
- Optimize large activity dataset handling with virtualization

---

## 📅 MVP Timeline

### **Week 1-2: Complete Activity Recording**
- Finish activity recording modal with GPS tracking
- Complete BLE sensor integration
- Implement real-time recording interface
- Add activity completion flow

### **Week 3-4: Activity Detail & Analysis**
- Build individual activity detail screens
- Implement activity editing and management
- Add activity maps and split analysis
- Create personal records tracking

### **Week 5-6: Enhanced Trends & Charts**
- Complete Victory Native chart implementations
- Add power/HR zone distribution charts
- Implement interactive chart features
- Build advanced analytics views

### **Week 7-8: Training Plans & Polish**
- Implement basic training plan system
- Add planned activity management
- Complete remaining UI components
- End-to-end testing and optimization

---

## 🎯 MVP Success Criteria

### **Critical MVP Requirements**
- [x] ✅ Real training load analytics (CTL/ATL/TSB) from actual recorded activities
- [ ] ❌ Complete activity recording with GPS/sensor integration
- [ ] ❌ Individual activity detail screens with maps and analysis
- [ ] ❌ Functional trends screen with real charts and analytics
- [ ] ❌ Basic training plan system with structured workouts
- [ ] ❌ Activity management (edit, delete, export)

### **MVP Success Criteria**
- [ ] Users can record complete activities end-to-end
- [ ] Activity detail screens rival Strava's analysis depth
- [ ] Training trends provide actionable fitness insights
- [ ] Basic plan following for structured workouts
- [ ] Personal record tracking and achievements

### **Current State Assessment**

**✅ What's Working:**
- Home screen displays real performance metrics (CTL/ATL/TSB)
- Data flows from SQLite → Core calculations → UI
- Performance metrics calculate from actual recorded activities
- Basic app navigation and authentication

**❌ Major Gaps:**
- Activity recording modal needs complete rebuild
- Trends screen shows basic charts but lacks implementation
- No activity detail views exist
- Training plans system not started
- Missing core user workflows (record → analyze → improve)

---

## 🔄 **Updated Priority Focus**

### **Immediate Next Steps (Critical Path)**

1. **Complete Activity Recording (Week 1-2)**
   - Fix GPS tracking and real-time display
   - Finish BLE sensor integration
   - Complete recording workflow

2. **Build Activity Detail Screens (Week 3-4)**
   - Individual activity analysis
   - Maps, splits, metrics display
   - Activity editing and management

3. **Implement Real Charts (Week 5-6)**
   - Connect trends to real data
   - Zone distribution analysis
   - Performance progression charts

The app has a solid foundation with real data integration, but needs these core user-facing features to be MVP-ready for competing with Strava/TrainingPeaks.

---

**Target**: Complete, competitive fitness tracking platform that provides real alternatives to Strava and TrainingPeaks with superior offline-first architecture and JSON-based data integrity.
