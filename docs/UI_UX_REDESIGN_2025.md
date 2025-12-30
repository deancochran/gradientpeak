# Application UI/UX Redesign: Task-Based Architecture
## January 2025

---

## Executive Summary

This document outlines a fundamental shift in the application's user interface and user experience—a transition from a **feature-based architecture** to a **task-based architecture**. This redesign consolidates navigation, reduces cognitive load, and aligns each screen with a singular user intent.

**Core Philosophy:**
> High-retention endurance tools converge toward task-based design. Users don't think in features; they think in actions.

**Primary Changes:**
- **5-tab navigation:** Home · Discover · Record · Plan · Settings
- **Trends page eliminated:** All analytics consolidated into Home dashboard
- **Record page simplified:** Discovery features removed, execution-only focus
- **New Discover page:** Unified search and exploration hub (not yet implemented)
- **Plan page preserved:** Already aligned with task-based design

---

## Table of Contents

1. [The Problem: Feature-Based Design](#the-problem-feature-based-design)
2. [The Solution: Task-Based Architecture](#the-solution-task-based-architecture)
3. [Tab-by-Tab Breakdown](#tab-by-tab-breakdown)
4. [User Intent Mapping](#user-intent-mapping)
5. [Information Architecture](#information-architecture)
6. [Migration Strategy](#migration-strategy)
7. [Implementation Phases](#implementation-phases)
8. [Design Principles](#design-principles)
9. [Success Metrics](#success-metrics)
10. [Technical Implications](#technical-implications)

---

## The Problem: Feature-Based Design

### Current State Analysis

The existing navigation structure splits functionality across too many destinations:

**Problems:**
- **Cognitive Load:** Users must remember which tab contains which feature
- **Navigation Friction:** Frequent tab-switching to complete common workflows
- **Feature Orphaning:** Related functionality scattered across multiple screens
- **Unclear Intent:** Tabs named after features, not user goals
- **Context Switching:** Users lose flow when bouncing between destinations

**Example of Poor Flow:**
```
User wants to do yesterday's workout again:
1. Open Trends → find activity
2. Tap activity → view details
3. Tap "Use as Template" → creates draft
4. Switch to Plan → find draft
5. Tap draft → edit details
6. Save → schedule
7. Switch to Record → start activity
```

**7 steps across 3 tabs.** This is administrative overhead, not training.

---

## The Solution: Task-Based Architecture

### Design Philosophy

Each tab answers a **single user question:**

| Tab | User Question | Purpose |
|-----|---------------|---------|
| **Home** | "What's going on with me?" | Status, trends, metrics, insights |
| **Discover** | "What can I do?" | Search, explore, filter, duplicate, record now, plan now, share |
| **Record** | "I'm doing something now" | Execution mode, quick start, connect devices on the fly, start whatever activity you want |
| **Plan** | "What am I doing next?" | Future intent, training plan, schedule, reorder, modify planned activities |
| **Settings** | "Who am I & how does this work?" | Identity, configuration |

### Why This Works

**Intention-Driven:**
Users navigate by intent, not by feature name. "I want to see how I'm doing" → Home. "I want to find a workout" → Discover.

**Minimal Context Switching:**
Related actions live together. All search functionality in one place. All execution in one place.

**Mental Model Alignment:**
The structure matches how athletes think about training:
- "How am I doing?" (status)
- "What should I do?" (planning)
- "Let's go" (execution)

**Scalable:**
New features have clear homes. If you can't answer "which tab owns this?" the feature isn't ready.

---

## Tab-by-Tab Breakdown

### 🏠 Home — Status & Insight

**First screen users see when opening the app.**

#### Purpose
The Home page is the user's central dashboard—a single source of truth for their current training state. It surfaces the most important information first and allows deeper exploration without requiring navigation to separate destinations.

#### What Home Owns

**1. Today's Focus**
- Today's planned activity (or rest day indicator)
- Large, obvious CTA: "Start Activity" / "View Plan" / "Edit"
- Quick preview of upcoming activities (next 2-3 days)

**2. Trend Snapshots (Not Full Charts)**

This is the critical change: all Trends page content migrates here in **condensed, glanceable format**.

Present 2-4 key metrics as cards:
- **Fitness Trend:** 7/28/90-day rolling average (line chart thumbnail)
- **Weekly Volume:** Current week vs average (bar comparison)
- **Load vs Recovery:** Training stress balance (gauge or simple indicator)
- **Recent PR or Streak:** Achievement highlight

Each card shows:
- Metric name and current value
- Micro-visualization (tiny chart, gauge, or icon)
- Directional indicator (trending up/down/stable)
- **Tap to expand** → Opens full chart view in modal or overlay

**3. Recent Activity**
- Last 1-3 completed activities
- Thumbnail preview with key stats
- Tap to view full activity details

**4. Readiness Indicators**
- Fatigue level (if tracked)
- Sleep quality (if integrated)
- Upcoming race/event countdown (if scheduled)

#### What Home Does NOT Own
- Search functionality
- Workout editing
- Template browsing

#### Design Principle: Answers, Not Explanations

> **Home shows answers. Deeper pages show explanations.**

Users glance at Home to know their status. If they need to understand *why* something changed, they tap to expand.
- expansions open modals that quickly show relevant information without requiring additional taps or navigation.
- modal overlays provide detailed explanations and insights, allowing users to explore further without leaving the current context.

#### User Scenarios

**Morning Check-In:**
> Sarah opens the app over coffee. Home shows: today's 60min sweet spot ride, her fitness trending up +3% this week, and yesterday's run logged. She taps The todays activity to review interval structure and view the gps route and elevation profile, then closes the app. **Time: 15 seconds.**

**Post-Workout Review:**
> Marcus finishes a long run, uploads it, and checks Home. He sees his weekly volume is 15% above target. He taps the volume card to see the full breakdown and realizes he should take tomorrow easy. **Time: 30 seconds.**

---

### 🔍 Discover — Search & Exploration

**Not yet implemented. This section defines the vision.**

#### Purpose
Discover is the unified hub for finding and reusing content. It replaces scattered discovery features currently in Record and eliminates the need for separate template/route browsing screens.

#### What Discover Owns

**1. Universal Search Bar**
Always visible at the top. Search across:
- Templates (coach-created workouts, system templates)


**2. Filter & Sort**
Contextual filters based on search category:
==
- **Templates:** Training focus (endurance, intervals, recovery), difficulty, duration, elevation, intensity, sport type etc
==
**3. Content Preview**
Each result shows:
- **Templates:** Interval structure preview, creator, popularity, description, tags, difficulty, duration, elevation, intensity, sport type etc

**4. Action CTAs**
Every result has clear next actions:
- **Templates:** "Customize" → opens plan tab and pre-populates with template details
- **Templates:** "Schedule" → opens plan tab and pre-populates with template details for scheduling
- **Templates:** "Record" → opens record tab and pre-populates with template details for recording
- **Templates:** "Share" → opens share tab and pre-populates with template details for sharing
- **Templates:** "clicked" → opens modal with full details and options for further actions

#### What Discover Does NOT Own
- Activity execution (that's Record)
- Calendar/scheduling (that's Plan)
- User's own activity history (that's Home)
- Analytics/trends (that's Home)

#### Design Principle: Utility, Not Social Feed

> **Discover is a tool, not a content platform (yet).**

The name "Discover" emphasizes intent-driven search over passive scrolling. Users come here to **find** something specific, not to browse aimlessly.

**Why Not "Explore"?**
- "Explore" suggests open-ended browsing (Strava, Instagram)
- "Discover" implies purposeful searching (Spotify, YouTube)
- Our users are goal-oriented athletes, not casual browsers

#### User Scenarios

**Reusing a Friend's Workout:**
> Carlos saw his friend posted a great VO2 max session. He opens Discover, searches his friend's name, finds the activity, taps "Use as Template," makes minor adjustments in the visual builder, and schedules it. **Time: 90 seconds.**

**Coach Assigning Template:**
> Coach Mike needs to assign "Threshold Tuesday" to 10 athletes. He opens Discover, searches "threshold," selects his template, taps "Assign to Athletes," selects the group, and confirms. **Time: 30 seconds.**

---

### 🔴 Record — Execution Mode

**Significantly simplified from current implementation. No launcher screen.**

#### Purpose
Record is pure execution mode—the moment of action. Tapping the Record tab takes users **directly** to the full-screen recording interface. No intermediate launcher, no browsing, no decision paralysis. Everything else disappears.

#### Core Philosophy: Direct to Action

**CRITICAL CHANGE:** The Record tab no longer shows a launcher page with Quick Start/Templates/Planned tabs. Instead:
- **Tapping the Record tab immediately opens the full-screen recording interface**
- Users select their activity type (if quick starting) or
- Activity is pre-loaded (if coming from Plan, Home, or Discover)
- **All discovery/browsing features moved to Discover tab**

#### What Record Owns

**1. Full-Screen Recording Interface (ONLY)**
The record tab now directly shows:
- Full-screen activity execution view
- Sensor connection status
- Live metrics carousel (dashboard, map, plan, heart rate, power, etc.)
- Start/Pause/Resume/Finish controls
- Trainer control (if applicable)

**2. Quick Start Activity Selection**
When opening Record tab directly (no pre-loaded activity):
- Inline sport selector at top of screen
- Location toggle (indoor/outdoor)
- Immediate "Start" button once selection made
- No separate launcher screen

**3. Pre-Loaded Activity Execution**
When navigating from Plan, Discover, or Home:
- Activity automatically loaded into full-screen interface
- Interval structure displayed
- Sensors auto-paired (if previously connected)
- Single tap to begin

**4. Live Metrics Dashboard**
- Swipeable carousel cards
- Real-time data updates
- Map view (for outdoor activities)
- Plan/interval view (for structured workouts)
- Power/HR zones

**5. Sensor Management**
- Quick access to sensor pairing via icon button
- Connection status indicators
- Reconnection alerts

#### What Record Does NOT Own (Removed from Current Design)

**Removed completely - now in Discover:**
- ~~Record launcher page~~
- ~~"Browse templates" tab~~
- ~~"Browse planned activities" tab~~
- ~~Template preview cards~~
- ~~Quick start grid with descriptions~~

**Removed completely - now in Plan:**
- ~~"Edit upcoming workouts"~~
- ~~Calendar view~~

#### Design Principle: Zero-Click to Action

> **"No launcher. No browsing. Just execute."**

**Previous Flow (REMOVED):**
```
Record tab → Launcher screen → Select Quick Start/Templates/Planned → Choose activity → Load → Start
5 steps, 4 taps
```

**New Flow:**
```
Record tab → Recording screen (activity selection inline if needed) → Start
2 steps, 1-2 taps
```

The recording interface is always visible. If you're here, you're ready to train.

#### Navigation Flow

**From Plan:**
```
Plan tab → Tap scheduled workout → "Start Now" → Opens Record tab with activity pre-loaded → Tap "Start"
```

**From Home:**
```
Home tab → Today's activity card → "Start Now" → Opens Record tab with activity pre-loaded → Tap "Start"
```

**From Discover:**
```
Discover tab → Find template → "Record Now" → Opens Record tab with template pre-loaded → Tap "Start"
```

**Direct Tab Access (Quick Start):**
```
Tap Record tab → Full-screen interface shows → Select sport inline → Select location → Tap "Start"
```

#### User Scenarios

**Planned Workout:**
> Sarah opens the app, sees today's planned ride on Home, taps "Start Activity." The Record tab opens immediately with her interval structure loaded in full-screen view. Sensors connect automatically. She taps "Start" and begins. **Time: 5 seconds, 2 taps.**

**Spontaneous Run:**
> Marcus taps the Record tab. The full-screen recording interface opens with an inline sport selector at the top. He taps "Run," confirms "Outdoor," and taps "Start." Recording begins immediately. **Time: 3 seconds, 3 taps.**

**Template from Discover:**
> Jennifer finds a "VO2 Max Builder" template in Discover. She taps "Record Now." The Record tab opens with the workout pre-loaded in the plan view. She reviews the intervals, taps "Start," and begins. **Time: 4 seconds, 2 taps.**

#### Implementation Notes

**Record Tab Behavior:**
1. **When tapped directly (no context):** Shows full-screen recording interface, defaults to Outdoor Run
2. **When navigated from Plan/Home/Discover:** Opens with activity pre-loaded from context
3. **State is preserved:** If user switches tabs during recording, returns to active recording on re-tap

**Activity Selection (Quick Start):**
- **Defaults to Outdoor Run** when Record tab tapped directly (most common use case)
- **Modal-based selection** triggered by tapping activity icon button (bottom left)
- Replaces the back button with activity type icon (shows current sport)
- Modal shows: Sport selection (Run, Bike, Swim, Strength, Other) → Location (Indoor/Outdoor)
- Confirms selection and closes modal automatically
- Can change activity type anytime before starting recording

**Button Layout:**
- **Bottom Left:** Activity type icon button (opens selection modal)
- **Bottom Right:** Bluetooth sensor button
- **Center:** Large "Start" button (or "Select Activity" if not chosen)
- **Top Left (Floating):** Close button (X) - only visible before recording starts
- **Close button disappears** once recording begins

**No Ceremony:**
- No "Welcome to Record" screens
- No intermediate pages
- No "Are you ready?" prompts
- Just the interface, waiting for you to start

---

### 📅 Plan — Future Intent

**Largely unchanged—already well-designed.**

#### Purpose
Plan is where users organize their future training. It's the command center for scheduling, editing, and adjusting workouts.

#### What Plan Owns

**1. Calendar View**
- Weekly/monthly layout
- Drag-and-drop rescheduling
- Today indicator
- Volume/load visualization per week

**2. Training Plan Progression**
For users following structured plans:
- Current phase indicator
- Completed vs upcoming workouts
- Plan adherence metrics

**3. Activity Creation**
- **Visual builder** (per PlanOutline.md)
- Quick add (duplicate, template, blank)
- Interval editor with real-time preview

**4. Scheduled Activity Management**
- Edit upcoming workouts
- Delete/reschedule
- Mark as complete (if logged manually)

#### What Plan Does NOT Own
- Search/discovery (that's Discover)
- Execution (that's Record)
- Historical data (that's Home)

#### Design Principle: Future-Focused

> **Planning is not creation-heavy. Creation is a side effect of planning.**

Users come to Plan to organize what's coming, not to architect complex workouts from scratch. The visual builder (per PlanOutline.md) makes creation fast, so users spend more time planning than building.

#### User Scenarios

**Weekly Planning:**
> Jennifer opens Plan on Sunday evening, looks at the week ahead, and sees Monday is a rest day. She drags Tuesday's workout to Monday, adds a new interval session on Wednesday from a template, and adjusts Thursday's long run duration. **Time: 2 minutes.**

**Pre-Race Taper:**
> Carlos has a race in 2 weeks. He opens Plan, views the calendar, and reduces volume on all remaining workouts by 20% using batch edit. **Time: 60 seconds.**

---

### ⚙️ Settings — Identity & Configuration

**Minimal changes required.**

#### Purpose
Settings is the control panel for user identity, preferences, and system configuration.

#### What Settings Owns

**1. Profile**
- Name, photo, bio
- Public/private toggle
- Athlete type (cyclist, runner, triathlete)

**2. Equipment**
- Bike setup (power zones, FTP)
- Running zones (pace, HR)
- Sensor library

**3. Privacy**
- Activity visibility
- Social sharing defaults
- Data export options

**4. Units & Display**
- Metric/imperial
- Time format (12/24hr)
- First day of week

**5. Integrations**
- Strava, TrainingPeaks, Wahoo, etc.
- Connected services
- Import/export tools

#### What Settings Does NOT Own
- Any activity-related functionality
- Analytics or trends
- Search or discovery

#### Design Principle: One-Time Setup

> **Settings is configured once and rarely revisited.**

Most users visit Settings during onboarding and only return when adding equipment or connecting new services.

---

## User Intent Mapping

### How Users Think → Where They Go

| User Thought | Current Behavior | New Behavior |
|--------------|------------------|--------------|
| "How am I doing this week?" | Open Trends tab → scroll through charts | Open Home (default) → see dashboard |
| "I want to do yesterday's ride again" | Trends → find activity → details → template → Plan | Home → recent activity → "Use Again" → Plan |
| "I need a 60-minute sweet spot workout" | Record → browse (?) or Plan → create from scratch | Discover → search "sweet spot 60min" → add to Plan |
| "Time to start today's workout" | Plan → find activity → start | Home → "Start Activity" → Record |
| "What routes are nearby?" | ??? (not implemented) | Discover → "Routes near me" |
| "Let me check my fitness trend" | Trends → find chart → analyze | Home → fitness card → tap to expand |

---

## Information Architecture

### Hierarchical Structure

```
Application
│
├─ Home (Landing Screen)
│  ├─ Today's Activity
│  ├─ Trend Snapshots
│  │  ├─ Fitness Trend → [Tap] → Full Chart Modal
│  │  ├─ Weekly Volume → [Tap] → Full Chart Modal
│  │  ├─ Load Balance → [Tap] → Full Chart Modal
│  │  └─ Achievement → [Tap] → Detail View
│  ├─ Recent Activities → [Tap] → Activity Detail
│  └─ Readiness Indicators
│
├─ Discover (New)
│  ├─ Search Bar (Universal)
│  ├─ Filters (Contextual)
│  ├─ Results
│  │  ├─ Activities → [Tap] → Preview → "Use as Template" → Plan
│  │  ├─ Templates → [Tap] → Preview → "Customize" → Visual Builder → Plan
│  │  ├─ Routes → [Tap] → Preview → "Add to Activity" → Plan
│  │  └─ Users → [Tap] → Profile
│  └─ Location-Based Discovery
│
├─ Record (Simplified)
│  ├─ Quick Start (No Plan)
│  │  ├─ Sport Selector
│  │  └─ Start Button
│  ├─ Planned Activity (Pre-loaded)
│  │  ├─ Interval Display
│  │  └─ Start Button
│  ├─ Live Metrics Dashboard
│  ├─ Sensor Pairing
│  └─ Trainer Control
│
├─ Plan (Unchanged)
│  ├─ Calendar View
│  ├─ Training Plan Progression
│  ├─ Activity Creation
│  │  └─ Visual Builder (See PlanOutline.md)
│  └─ Scheduled Activity Management
│
└─ Settings (Unchanged)
   ├─ Profile
   ├─ Equipment
   ├─ Privacy
   ├─ Units & Display
   └─ Integrations
```

---

## Migration Strategy

### For Existing Features

#### Trends Page → Home Dashboard

**Challenge:**
Trends currently exists as a dedicated tab with multiple full-screen charts. Migrating to Home without creating clutter requires careful information hierarchy.

**Solution:**

**Phase 1: Consolidate Core Metrics**
- Identify the 4 most-viewed charts from usage analytics
- Redesign as compact dashboard cards
- Show micro-visualizations (thumbnail charts)
- Add "Tap to expand" affordance

**Phase 2: Expandable Detail Views**
- Tapping a card opens full chart in modal
- Modal shows same detail level as current Trends page
- Swipe down to dismiss, returns to Home

**Phase 3: Deprecate Trends Tab**
- Remove from navigation
- Monitor user feedback
- Add quick link in Settings ("View detailed analytics") if needed

**Example Card Design:**

```
┌─────────────────────────────┐
│ 📈 Fitness Trend        ↗️  │
│                             │
│   [Tiny line chart]         │
│                             │
│   Current: 65 (+3 pts)      │
│   90-day avg: 62            │
│                             │
│   Tap for details →         │
└─────────────────────────────┘
```

#### Record Page Discovery Features → Discover Tab

**Challenge:**
Current Record page may contain template browsing or route discovery (to be confirmed).

**Solution:**

**Phase 1: Audit Current Record Screen**
- Document all discovery-related features
- Identify user flows that depend on them

**Phase 2: Build Discover Tab**
- Implement universal search
- Migrate browsing features
- Add filters and sorting

**Phase 3: Simplify Record**
- Remove all discovery UI
- Keep only execution controls
- Add navigation hints: "Looking for workouts? Try Discover →"

**Phase 4: Update User Flows**
- Change deep links to point to Discover
- Update onboarding to introduce Discover
- Monitor drop-off in Record usage (should increase as page is clearer)

---

### For Users

#### Communication Strategy

**In-App Announcement:**
> "We've redesigned the app to make your training flow better. Your home screen now shows everything you need at a glance, and the new Discover tab helps you find workouts and routes faster than ever."

**Feature Tour (First Open After Update):**
```
Screen 1: "Welcome to the new Home"
→ Shows trend cards and today's activity

Screen 2: "Find anything in Discover"
→ Shows search bar and filter options

Screen 3: "Record made simple"
→ Shows streamlined execution mode

Screen 4: "You're all set!"
→ "Tap anywhere to start"
```

**Transition Period:**
- Show tooltips on first interaction with each tab
- Display "New" badge on Discover tab for 2 weeks
- Provide feedback button for users to report issues

#### Data Migration

**No data migration required.** This is a UI/UX change only. All existing activities, plans, and settings remain intact.

**Schema Impact:**
- No database changes
- No API changes
- Only frontend routing and component structure changes

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
**Goal: Establish new navigation structure**

**Tasks:**
- Update tab bar to 5-tab layout
- Create placeholder Discover screen
- Simplify Record screen (remove discovery features)
- Update routing and deep links

**Success Criteria:**
- All tabs render correctly
- Navigation flows are functional
- No regressions in Plan or Settings

---

### Phase 2: Home Dashboard (Weeks 3-4)
**Goal: Consolidate Trends into Home**

**Tasks:**
- Design dashboard card components
- Implement micro-visualizations
- Build expandable chart modals
- Migrate 4 core metrics from Trends

**Success Criteria:**
- Home loads in <1 second
- Cards display accurate data
- Modals expand/dismiss smoothly
- User testing shows improved comprehension

---

### Phase 3: Discover Implementation (Weeks 5-8)
**Goal: Build unified search/discovery hub**

**Tasks:**
- Implement universal search backend
- Build filter/sort UI
- Create result card components
- Integrate with Plan (add to calendar flow)
- Add location-based discovery

**Success Criteria:**
- Search returns results in <500ms
- Filters work correctly
- Users can add found content to Plan
- Template library accessible via Discover

---

### Phase 4: Record Simplification (Weeks 9-10)
**Goal: Streamline execution mode**

**Tasks:**
- Remove discovery features (now in Discover)
- Simplify quick start interface
- Improve sensor pairing UX
- Optimize for planned activity flow

**Success Criteria:**
- Time to start activity reduced by 30%
- User confusion metrics drop
- Quick start conversion improves

---

### Phase 5: Polish & Analytics (Weeks 11-12)
**Goal: Refine based on user feedback**

**Tasks:**
- A/B test dashboard card layouts
- Optimize load times
- Add transitions and animations
- Instrument analytics events
- User interviews and surveys

**Success Criteria:**
- User satisfaction scores improve
- Task completion times decrease
- Retention metrics stabilize or improve

---

## Design Principles

### 1. No Orphan Features

**Rule:**
Every feature must have a clear owner tab. If the answer to "where does this live?" is unclear, the feature is not ready.

**Examples:**
- Trends → Home (as dashboard cards)
- Activity reuse → Discover → Plan
- Execution → Record
- Future planning → Plan
- System config → Settings

**Test:**
Before implementing any new feature, ask: "Which tab owns this?" If you hesitate, the feature needs clearer definition.

---

### 2. Answers First, Explanations Second

**Rule:**
The primary view shows answers. Deeper views explain how we got there.

**Examples:**
- Home shows "Fitness: 65 (+3)" → Tap to see full 90-day trend
- Home shows "Today: 60min Sweet Spot" → Tap to see interval breakdown
- Plan shows scheduled activities → Tap to see full workout structure

**Test:**
Can a user glance at the screen and know their status in 3 seconds? If not, simplify.

---

### 3. Intent-Driven Navigation

**Rule:**
Navigation should match user mental models, not developer organization.

**Bad Example:**
"Tap 'Workouts' to see templates, then tap 'Browse' to search routes, then go to 'Calendar' to schedule."

**Good Example:**
"Tap Discover to find anything. Tap Plan to schedule what you found."

**Test:**
Ask a non-technical user: "Where would you go to [do task]?" If they don't pick the right tab immediately, the navigation is wrong.

---

### 4. Singular Screen Purpose

**Rule:**
Each screen should do one thing extremely well. Resist the urge to add "just one more feature."

**Examples:**
- Record does execution, period. No browsing, no planning.
- Discover does search, period. No analytics, no execution.
- Plan does scheduling, period. No live recording.

**Test:**
Can you describe the screen's purpose in 5 words or less? If not, it's doing too much.

---

### 5. Reduce Ceremony, Increase Flow

**Rule:**
Remove steps that don't add value. Every tap, swipe, or navigation is friction.

**Examples:**
- Old flow: Trends → Activity → Details → Use Template → Plan → Save → Schedule
- New flow: Home → "Use Again" → Schedule

**Test:**
Count the steps to complete common tasks. Can you remove any without losing clarity?

---

## Success Metrics

### User Engagement

**Task Completion Time:**
- **Home Review:** Measure time from app open to understanding today's status
  - Target: <5 seconds (down from ~15 seconds)
- **Workout Discovery:** Measure time from intent to scheduled activity
  - Target: <90 seconds (down from ~5 minutes)
- **Activity Start:** Measure time from opening app to beginning recording
  - Target: <10 seconds (down from ~30 seconds)

**Feature Usage:**
- **Home Engagement:** % of sessions that view Home dashboard
  - Target: 85%+ (up from ~40% viewing Trends)
- **Discover Adoption:** % of new activities sourced from Discover
  - Target: 40%+ within 3 months
- **Record Simplicity:** Drop in Record page bounce rate
  - Target: 30% reduction

---

### User Satisfaction

**NPS (Net Promoter Score):**
- Survey after 2 weeks of using new design
- Target: +15 point increase

**Task Success Rate:**
- Observe users completing key tasks in moderated testing
- Tasks: "Find a sweet spot workout," "Check your weekly progress," "Start today's planned activity"
- Target: 90%+ success rate without assistance

**Support Tickets:**
- Count of "Where do I...?" questions
- Target: 40% reduction in navigation-related tickets

---

### Business Metrics

**Retention:**
- 7-day retention for users who experience new design
- Target: +5% improvement

**Premium Conversion:**
- % of users who upgrade after using Discover (template library gating)
- Target: 2% conversion rate

**Session Length:**
- Average session duration (should decrease as efficiency improves)
- Target: 15% reduction (users accomplish more in less time)

**Session Frequency:**
- Number of sessions per week
- Target: +10% increase (lower friction = more check-ins)

---

## Technical Implications

### Frontend Architecture

#### Routing Changes

**Current Structure:**
```typescript
// Old tab structure
<Tabs>
  <Tab name="home" />
  <Tab name="trends" />
  <Tab name="record" />
  <Tab name="plan" />
  <Tab name="settings" />
</Tabs>
```

**New Structure:**
```typescript
// New tab structure
<Tabs>
  <Tab name="home" />        // Expanded, includes trends
  <Tab name="discover" />    // New tab
  <Tab name="record" />      // Simplified
  <Tab name="plan" />        // Unchanged
  <Tab name="settings" />    // Unchanged
</Tabs>
```

**Route Mapping:**
```typescript
// Redirect old routes to new destinations
const ROUTE_REDIRECTS = {
  '/trends': '/home',
  '/trends/fitness': '/home?expand=fitness',
  '/trends/volume': '/home?expand=volume',
  '/record/templates': '/discover?filter=templates',
  '/record/routes': '/discover?filter=routes',
}
```

#### Component Architecture

**Home Dashboard Components:**
```typescript
// New component hierarchy
<HomeScreen>
  <TodayActivityCard />
  <TrendDashboard>
    <FitnessTrendCard onExpand={() => showModal('fitness')} />
    <VolumeTrendCard onExpand={() => showModal('volume')} />
    <LoadBalanceCard onExpand={() => showModal('load')} />
    <AchievementCard />
  </TrendDashboard>
  <RecentActivitiesSection />
  <ReadinessIndicators />
</HomeScreen>

// Modal system for expanded charts
<ChartModal 
  type="fitness" 
  visible={modalState === 'fitness'}
  onClose={() => setModalState(null)}
/>
```

**Discover Components:**
```typescript
// New Discover tab structure
<DiscoverScreen>
  <UniversalSearchBar />
  <FilterBar />
  <ResultsList>
    {results.map(item => (
      <ResultCard 
        type={item.type}  // activity, template, route, user
        data={item}
        onAction={(action) => handleAction(action, item)}
      />
    ))}
  </ResultsList>
</DiscoverScreen>
```

---

### State Management

**New Stores Required:**

```typescript
// Home dashboard state
interface HomeDashboardState {
  todayActivity: Activity | null
  trendSnapshots: TrendSnapshot[]
  recentActivities: Activity[]
  readiness: ReadinessMetrics
  expandedChart: ChartType | null
}

// Discover search state
interface DiscoverState {
  query: string
  filters: FilterOptions
  results: SearchResult[]
  loading: boolean
  activeCategory: 'activities' | 'templates' | 'routes' | 'users'
}
```

**Existing Stores Modified:**

```typescript
// Record store simplified (remove discovery features)
interface RecordState {
  // Remove:
  // - templateBrowser: Template[]
  // - routeLibrary: Route[]
  
  // Keep:
  isRecording: boolean
  currentActivity: Activity | null
  sensorConnections: Sensor[]
  liveMetrics: Metrics
}
```

---

### Backend Considerations

**New API Endpoints:**

```typescript
// Universal search
GET /api/v2/search
  ?q={query}
  &type={activities|templates|routes|users}
  &filters={json}
  &location={lat,lon}
  
// Template library
GET /api/v2/templates
  ?category={endurance|intervals|recovery}
  &duration={min}-{max}
  
// Route discovery
GET /api/v2/routes/nearby
  ?lat={lat}
  &lon={lon}
  &radius={km}
  &sport={bike|run}
```

**Existing Endpoints Modified:**

```typescript
// Home dashboard aggregation
GET /api/v2/home/dashboard
  // Returns:
  // - today's activity
  // - trend snapshots (pre-computed)
  // - recent activities (last 3)
  // - readiness metrics
  
// Response includes micro-chart data (optimized)
{
  trends: {
    fitness: {
      current: 65,
      change: +3,
      microChart: [60, 61, 62, 63, 64, 65]  // Last 6 data points
    }
  }
}
```

---

### Performance Optimization

**Critical Rendering Paths:**

**Home Dashboard:**
- Must load in <1 second on 4G connection
- Lazy load chart modals (don't fetch full data until expanded)
- Cache trend snapshots for 15 minutes
- Use stale-while-revalidate for non-critical metrics

**Discover Search:**
- Debounce search input (300ms)
- Return results incrementally (first 10, then load more)
- Pre-fetch popular templates on app start
- Cache route data with service worker

**Record Screen:**
- Pre-load planned activity data when navigating from Plan/Home
- Keep sensor pairing logic in memory (don't re-initialize)
- Optimize live metrics update frequency (1Hz display, not 10Hz)

---

### Analytics Instrumentation

**Critical Events to Track:**

```typescript
// Navigation
analytics.track('tab_viewed', { tab: 'home' | 'discover' | 'record' | 'plan' | 'settings' })
analytics.track('screen_duration', { screen: string, seconds: number })

// Home interactions
analytics.track('trend_card_tapped', { cardType: 'fitness' | 'volume' | 'load' })
analytics.track('trend_modal_expanded', { chartType: string })
analytics.track('activity_started_from_home', { activityId: string })

// Discover interactions
analytics.track('search_performed', { query: string, resultsCount: number })
analytics.track('filter_applied', { filterType: string, value: string })
analytics.track('result_tapped', { resultType: 'activity' | 'template' | 'route' })
analytics.track('content_added_to_plan', { source: 'discover', contentType: string })

// Record interactions
analytics.track('quick_start_used', { sport: string })
analytics.track('planned_activity_started', { activityId: string, source: 'home' | 'plan' })
analytics.track('time_to_start_recording', { seconds: number })

// Conversion funnels
analytics.track('funnel_step', { 
  funnel: 'discover_to_plan' | 'home_to_record',
  step: number,
  completed: boolean
})
```

---

## Visual Design Guidelines

### Layout Principles

**Hierarchy:**
- Primary actions: Large, high-contrast buttons
- Secondary info: Subtle, smaller typography
- Tertiary details: Expandable, hidden by default

**Spacing:**
- Generous whitespace between sections
- Consistent padding (16px, 24px, 32px scale)
- Card-based layout with clear boundaries

**Typography:**
- Headlines: Bold, 24-28pt
- Body: Regular, 16pt
- Captions: Light, 14pt

---

### Color Strategy

**Tab Bar:**
- Active tab: Primary brand color (vibrant)
- Inactive tabs: Neutral gray (60% opacity)

**Home Dashboard Cards:**
- Fitness: Blue gradient
- Volume: Green gradient
- Load: Orange/Red spectrum (visual load indicator)
- Achievement: Gold accent

**Discover Results:**
- Activities: Blue
- Templates: Purple
- Routes: Green
- Users: Gray

**Record Mode:**
- Live recording: Red accent
- Paused: Yellow accent
- Completed: Green accent

---

### Interaction Patterns

**Tap Targets:**
- Minimum 44×44pt (Apple HIG)
- Cards: Entire card is tappable
- Buttons: Clear affordance (shadows, borders)

**Gestures:**
- Swipe down: Dismiss modals
- Swipe left/right: Navigate between tabs (optional)
- Long press: Contextual actions (e.g., quick edit)
- Pull to refresh: Update data on Home

**Feedback:**
- Haptic feedback on button presses
- Loading states: Skeleton screens, not spinners
- Success states: Checkmark animation + haptic
- Error states: Shake animation + error message

---

## Migration Checklist

### Pre-Launch

- [ ] Audit current feature usage (analytics)
- [ ] Identify most-used Trends charts
- [ ] Map all existing user flows to new structure
- [ ] Create redirect rules for old routes
- [ ] Design and prototype new screens
- [ ] User test with 10-15 athletes
- [ ] Implement analytics instrumentation
- [ ] Write migration guide for users

### Launch

- [ ] Deploy new navigation structure
- [ ] Show feature tour on first open
- [ ] Monitor error rates and crashes
- [ ] Track user feedback (in-app + support)
- [ ] A/B test dashboard card layouts
- [ ] Optimize based on performance metrics

### Post-Launch (Week 1-4)

- [ ] Survey users on new experience
- [ ] Analyze task completion metrics
- [ ] Identify friction points from analytics
- [ ] Iterate on Discover search relevance
- [ ] Refine Home dashboard card hierarchy
- [ ] Publish blog post explaining changes

### Long-Term (Month 2-6)

- [ ] Compare retention vs old design
- [ ] Measure premium conversion impact
- [ ] Plan Phase 2 features (AI, social)
- [ ] Consider mobile web adaptation
- [ ] Expand template library
- [ ] Build coach/team features in Discover

---

## Appendix: User Journey Comparison

### Journey 1: Review Weekly Progress

**Before (Current):**
```
1. Open app (lands on Home)
2. Tap "Trends" tab
3. Scroll to find "Weekly Volume" chart
4. Tap chart to expand (if needed)
5. Scroll to find "Fitness Trend" chart
6. Tap chart to expand (if needed)
7. Return to Home tab

Steps: 7 | Taps: 5 | Time: ~20 seconds
```

**After (New Design):**
```
1. Open app (lands on Home)
2. View dashboard cards (all visible)
3. Tap "Weekly Volume" card to expand (optional)
4. Tap "Fitness Trend" card to expand (optional)

Steps: 4 | Taps: 2 (optional) | Time: ~5 seconds
```

**Improvement: 75% faster, 60% fewer taps**

---

### Journey 2: Find and Schedule a Workout

**Before (Current):**
```
1. Open app
2. Tap "Record" or "Plan" (unclear which)
3. Tap "Create Activity" (maybe?)
4. Search for templates (if feature exists)
   OR start building from scratch
5. Fill out form fields (5+ minutes)
6. Navigate to Plan tab
7. Add to calendar

Steps: 7+ | Time: 5-8 minutes
```

**After (New Design):**
```
1. Open app
2. Tap "Discover" tab
3. Search "sweet spot 60min"
4. Tap result to preview
5. Tap "Add to Plan"
6. Select date on calendar

Steps: 6 | Taps: 5 | Time: ~90 seconds
```

**Improvement: 70-85% faster, clearer intent**

---

### Journey 3: Start Today's Planned Workout

**Before (Current):**
```
1. Open app
2. Tap "Plan" tab
3. Find today's workout in calendar
4. Tap workout to view details
5. Tap "Start Activity"
6. Navigates to Record tab
7. Tap "Begin Recording"

Steps: 7 | Taps: 4 | Time: ~25 seconds
```

**After (New Design):**
```
1. Open app (lands on Home)
2. See today's workout card
3. Tap "Start Activity"
4. Tap "Begin Recording" (or auto-start)

Steps: 4 | Taps: 2 | Time: ~8 seconds
```

**Improvement: 68% faster, 50% fewer taps**

---

## Conclusion

This UI/UX redesign represents a fundamental shift from a **feature-based** application to a **task-based** application. By consolidating navigation, aligning screens with user intent, and eliminating friction, we're transforming the app into a tool that athletes *want* to use, not one they *have* to use.

**Core Outcomes:**
- **Clarity:** Each tab has a singular, obvious purpose
- **Efficiency:** Common tasks completed in 50-75% less time
- **Scalability:** Clear ownership rules prevent feature creep
- **Retention:** Lower friction drives higher engagement

**The Bottom Line:**
> Users don't think in features—they think in tasks. This redesign aligns our interface with how athletes actually train.

---

## Document Metadata

**Version:** 1.0  
**Date:** January 2025  
**Author:** Product Team  
**Related Documents:**
- [`PlanOutline.md`](file:///home/deancochran/GradientPeak/PlanOutline.md) — Visual Activity Builder Implementation
- [`ACTIVITY_CREATION_AND_PLAN_CREATION_UPDATE.md`](file:///home/deancochran/GradientPeak/ACTIVITY_CREATION_AND_PLAN_CREATION_UPDATE.md) — Reimagined Activity Builder Vision
- [`SCHEMA_MIGRATION_CHECKLIST.md`](file:///home/deancochran/GradientPeak/SCHEMA_MIGRATION_CHECKLIST.md) — Database Schema Updates

**Status:** Draft → Awaiting Review → Implementation Planning

---

**Next Steps:**
1. Review with design team
2. Validate with user research
3. Create detailed mockups
4. Begin Phase 1 implementation
5. Prepare analytics infrastructure
6. Plan user communication strategy
