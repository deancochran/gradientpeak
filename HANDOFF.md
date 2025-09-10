Perfect! Let’s translate your vision into a **clear app navigation & layout specification**, similar to what top-tier fitness apps like Strava, Zwift, TrainerRoad, and TrainingPeaks use. I’ll also highlight the routing logic and structural recommendations for your TurboFit Expo app.

---

## **TurboFit Mobile App Navigation & Layout Specification**

### **Custom Tab Bar**

Your bottom tab bar will include:

| Tab / Button | Type                  | Purpose                                                                                                 |
| ------------ | --------------------- | ------------------------------------------------------------------------------------------------------- |
| Home         | Tab Screen            | Overview of user stats, basic trends, completed activities, and access to nested screens or other tabs. |
| Plan         | Tab Screen            | Focused on **profile training plans** and **planned workouts**, TrainingPeaks-style.                    |
| Record       | Modal / Action Button | Launches a modal to **start an activity**, not a persistent tab screen. Can overlay current screen.     |
| Trends       | Tab Screen            | Analysis, predictions, historical data views, and trends. Separate from Plan.                           |
| Settings     | Tab Screen            | User profile & app configuration: units, privacy, permissions, notifications, logout.                   |

**Notes:**

* The **Record button** is central in your tab bar (common UX in fitness apps) but triggers a modal instead of navigating to a tab.
* Tab order recommendation: `Home | Plan | Record | Trends | Settings`.

---

### **Tab Screen Details**

#### **1. Home Screen**

* **Purpose:** Glanceable dashboard for general activity stats and summaries.
* **Content / Features:**

  * Recent activity highlights
  * Basic stats (distance, time, TSS, etc.)
  * Mini trends / charts (weekly load, compliance)
  * Quick links to Plan, Record, or Trends screens
* **Navigation:** Can redirect to:

  * Planned activities (`Plan`)
  * Detailed trends (`Trends`)
  * Start recording activity (`Record` modal)
* **Layout Recommendations:**

  * Card-based summaries for key metrics
  * Use flatlists or scrollable sections for recent activities
  * Consistent use of **core package types** for displaying metrics

#### **2. Plan / Calendar Screen**

* **Purpose:** Manage and view personal training plans and scheduled workouts.
* **Content / Features:**

  * Calendar view with scheduled workouts
  * Daily workout details (validated with core package)
  * Ability to mark completed workouts
  * Integration with planned activities from Drizzle backend
* **Navigation:**

  * Nested screens for detailed workout plans
  * Optional redirect to Home for summary view
* **Layout Recommendations:**

  * Calendar-first view with tap-to-expand workouts
  * Smooth scrolling & offline support with SQLite
  * Use type-safe core package models for all plan data

#### **3. Record Button / Modal**

* **Purpose:** Start an activity quickly.
* **Content / Features:**

  * Start / Pause / Stop buttons
  * Live metrics (HR, power, pace, distance)
  * Basic alert notifications (core package triggers)
* **Implementation Tips:**

  * Modal overlay to remain independent from tabs
  * Ensure background recording persists if the user navigates away
  * Optional shortcut from Home or Plan screens

#### **4. Trends Screen**

* **Purpose:** Deep-dive into historical performance and predictive analytics.
* **Content / Features:**

  * Performance trends (TSS, CTL/ATL/TSB)
  * Power/HR curves
  * Predicted improvements or compliance scoring
  * Filtering by timeframe, activity type, or plan
* **Navigation:** Mostly self-contained; can link to past activities or home overview
* **Layout Recommendations:**

  * Charts and graphs are front and center
  * Use type-safe core package calculations for analytics
  * Scrollable sections for detailed data

#### **5. Settings / Profile Screen**

* **Purpose:** Manage user account and app preferences.
* **Content / Features:**

  * Units of measurement (metric/imperial)
  * Privacy settings & data permissions
  * Notification preferences
  * Logout
* **Navigation:** No nested stacks needed; mostly flat layout
* **Layout Recommendations:**

  * Group settings into sections
  * Clear toggles, dropdowns, and buttons
  * Integration with profile types from core package

---

### **Recommended Navigation Architecture**

```
Bottom Tab Navigator
├── Home (Stack)
│   ├── Overview Screen
│   ├── Recent Activities
│   └── Nested links to Plan / Trends
├── Plan (Stack)
│   ├── Calendar View
│   ├── Daily Workout Details
│   └── Nested Plan Management Screens
├── Record (Modal)
│   └── Activity Recording Modal
├── Trends (Stack)
│   ├── Performance Trends
│   ├── Historical Analytics
│   └── Prediction / Compliance Views
└── Settings (Stack or Flat)
    ├── Account Settings
    ├── Units & Preferences
    └── Notifications & Privacy
```

**Notes:**

* Home, Plan, Trends, and Settings are **stack navigators inside a bottom tab navigator**.
* Record is a **modal** that overlays the current screen.
* Nested screens under Home and Plan ensure drill-down without cluttering the tab bar.

---

### **Core Package Integration**

* All stats, trends, and calculations use **`@turbofit/core`**.
* Ensure offline-first support for Plan and Record screens.
* Use Drizzle API for fetching/updating planned activities and syncing user metrics.

---

If you want, I can **create a visual diagram** of this navigation structure showing tabs, stacks, and modals like a Strava/TrainerRoad clone, so you can compare it directly to your current Expo implementation.

Do you want me to do that next?
