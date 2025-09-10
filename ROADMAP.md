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

## 1. **Real Data Integration** (Priority 1)

### **Connect Performance Metrics to Real Activities**

#### 1.1 Fix Home Screen Data Flow
- [ ] **Replace Mock Performance Data**
  - Update `usePerformanceMetrics` hook to query real activities from database
  - Connect CTL/ATL/TSB calculations to actual user activity metadata
  - Display real weekly/monthly TSS from user's activity history
  - Show actual training load progression instead of mock data

- [ ] **Real Activity History Display**
  - Implement `useActivities` query integration in home screen
  - Display actual recorded activities instead of mock data
  - Show real activity sync status indicators
  - Add real activity metrics (distance, duration, TSS) to activity cards

#### 1.2 Fix Trends Screen Analytics
- [ ] **Connect Victory Native Charts to Real Data**
  - Replace mock chart data with actual activity queries by date range
  - Implement time period filtering (7D, 30D, 90D, 1Y) with real database queries
  - Connect training load progression charts to actual CTL/ATL/TSB history
  - Display real power/HR trends from user's activity streams

- [ ] **Performance Analytics from JSON**
  - Process JSON activity data through @repo/core calculations
  - Generate real power curves from activity JSON streams
  - Calculate actual training zone distribution from recorded activities
  - Show comparative analysis using real historical data

#### 1.3 Database Query Implementation
- [ ] **Activity Data Queries**
  - Implement efficient activity list queries with pagination
  - Add activity filtering by date range, sport type, and metrics
  - Create activity summary statistics queries
  - Build training load historical data queries

- [ ] **Performance Metrics Calculation**
  - Connect @repo/core TSS calculations to real activity data
  - Implement CTL/ATL/TSB progression from activity metadata
  - Calculate real training zones usage from activity streams
  - Generate performance trends from historical JSON data

---

## 2. **Training Plan System** (Priority 2)

### **Implement Real Training Plans**

#### 2.1 Training Plan Infrastructure
- [ ] **Plan Templates & Assignment**
  - Create basic training plan templates (beginner, intermediate, advanced)
  - Implement plan assignment to user profiles
  - Build plan scheduling logic for weekly/daily workout distribution
  - Add plan duration and periodization structure

- [ ] **Connect Plan Screen to Real Data**
  - Replace mock planned activities with real `planned_activities` queries
  - Display actual scheduled workouts from user's assigned plan
  - Show real plan progress and completion status
  - Implement workout scheduling and calendar integration

#### 2.2 Structured Workout Support
- [ ] **Workout Structure Integration**
  - Enhance activity recorder to follow structured workout steps
  - Add workout step guidance during recording (intervals, rest periods, zones)
  - Implement workout progress tracking within recording session
  - Create workout step completion validation

- [ ] **Workout Compliance & Feedback**
  - Build workout completion analysis using @repo/core algorithms
  - Implement plan adherence scoring based on completed vs planned workouts
  - Add workout effectiveness analysis (actual vs target metrics)
  - Create plan adaptation recommendations based on performance

#### 2.3 Workout Library
- [ ] **Common Workout Types**
  - Create library of standard workout structures (intervals, tempo, endurance)
  - Implement workout structure validation using @repo/core schemas
  - Add workout intensity target calculations (HR zones, power zones)
  - Build workout duration and TSS estimation algorithms

---

## 3. **Activity Management & History** (Priority 3)

### **Complete Activity Experience**

#### 3.1 Activity History & Detail Views
- [ ] **Comprehensive Activity List**
  - Build full activity history screen with real data
  - Implement activity search and filtering capabilities
  - Add activity sorting by date, sport, distance, duration
  - Create activity list virtualization for large datasets

- [ ] **Activity Detail Screens**
  - Display complete activity analysis from JSON data
  - Show detailed metrics, splits, and zone analysis
  - Add activity map visualization for GPS activities
  - Create activity editing capabilities (name, notes, sport type)

#### 3.2 Activity Analysis Features
- [ ] **Advanced Activity Analytics**
  - Process activity JSON through @repo/core for detailed analysis
  - Generate activity power/HR curves and zone distribution
  - Calculate activity-specific metrics (VI, IF, TSS) from JSON data
  - Show activity segments and split analysis

- [ ] **Personal Records Tracking**
  - Identify and track personal bests from activity data
  - Create PR categories (fastest 5K, longest ride, highest TSS)
  - Build PR progression tracking over time
  - Add achievement notifications for new PRs

#### 3.3 Activity Data Management
- [ ] **Activity Operations**
  - Implement activity deletion with JSON cleanup
  - Add activity export functionality (JSON, TCX formats)
  - Create activity tagging and categorization system
  - Build activity privacy and sharing controls

- [ ] **Data Integrity & Sync**
  - Ensure activity JSON and metadata consistency
  - Implement conflict resolution for offline-recorded activities
  - Add data validation for activity JSON structures
  - Create activity data repair and cleanup utilities

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

### **Week 1-2: Real Data Integration**
- Connect home screen to actual activity data
- Fix trends screen with real analytics
- Implement core activity queries and performance calculations

### **Week 3-4: Training Plan System**
- Build basic training plan templates and assignment
- Connect plan screen to real planned activities
- Add structured workout recording capabilities

### **Week 5-6: Activity Management**
- Complete activity history and detail screens
- Implement activity analysis and personal records
- Add activity data management operations

### **Week 7: Integration & Polish**
- End-to-end testing of complete activity workflow
- Performance optimization and bug fixes
- UI/UX refinements and loading states

---

## 🎯 MVP Success Criteria

### **Core Functionality Requirements**
- [ ] Users can record activities with complete JSON data storage
- [ ] Real training load analytics (CTL/ATL/TSB) from actual recorded activities
- [ ] Working training plan system with structured workout following
- [ ] Complete activity history with detailed analysis from JSON data
- [ ] Offline-first functionality with reliable JSON-based sync

### **Competitive Feature Parity**
- [ ] Activity recording quality matches or exceeds Strava
- [ ] Training analytics provide actionable insights like TrainingPeaks
- [ ] Plan adherence tracking and workout structure following
- [ ] Personal record tracking and achievement recognition
- [ ] Data export compatibility with major platforms

### **Technical Quality Standards**
- [ ] All activity data flows through JSON-first architecture
- [ ] @repo/core package calculations work on real user data
- [ ] Robust offline recording with reliable cloud sync
- [ ] Type-safe data handling throughout the stack
- [ ] Performance suitable for users with extensive activity histories

---

## 🚀 Post-MVP Roadmap

### **Phase 2: Advanced Features**
- Strava/TrainingPeaks data export integration
- Social sharing and basic social features
- Advanced analytics and performance modeling
- Workout plan adaptation based on performance

### **Phase 3: Platform Features**
- Web dashboard completion with advanced analytics
- Coach/athlete relationship management
- Advanced social features and community building
- Third-party integrations and API development

---

**Target**: Complete, competitive fitness tracking platform that provides real alternatives to Strava and TrainingPeaks with superior offline-first architecture and JSON-based data integrity.