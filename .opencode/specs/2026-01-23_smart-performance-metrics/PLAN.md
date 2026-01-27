# Plan: Smart Performance Metrics

## 1. Executive Summary

This plan outlines the implementation of "Smart Performance Metrics" for GradientPeak. The goal is to transition from static profile fields (FTP, Weight) to a historical, event-based tracking system. This enables:

- **Time-Traveling Analytics:** calculating metrics based on the athlete's fitness _at the time of the activity_.
- **Performance Curves:** Visualizing power/pace duration curves.
- **Future-Proofing:** Preparing data structures for AI/ML-driven race predictions and training suggestions.

**Key Changes:**

1.  **Database:** Add `profile_performance_models` for storing computed curves (CP, W').
2.  **Mobile App:** Refactor "Settings" to fetch data from the new logging tables instead of the now-deprecated profile columns. Add a new "Performance Management" UI.
3.  **Backend:** Implement logic to derive models from performance logs.

---

## 2. Database Schema Changes

### 2.1. Missing Table: `profile_performance_models`

We need to create the `profile_performance_models` table to store computed mathematical models (e.g., Critical Power, W'). This table uses a "Slim" schema for the MVP, focusing on essential curve parameters and provenance for validity checks.

```sql
CREATE TABLE IF NOT EXISTS public.profile_performance_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Model type identification
  category activity_category NOT NULL,      -- e.g., 'bike', 'run'
  model_type TEXT NOT NULL,                 -- e.g., 'critical_power', 'critical_speed'

  -- Model parameters (The "Curve")
  critical_value NUMERIC NOT NULL,          -- CP (Watts) or CS (m/s)
  capacity_value NUMERIC NOT NULL,          -- W' (Joules) or D' (Meters)

  -- Provenance & Quality
  effort_count INTEGER NOT NULL,            -- Number of data points used (detects low data)
  max_effort_duration INTEGER,              -- Max duration used (detects lack of endurance data)

  -- Temporal Validity
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_from TIMESTAMPTZ NOT NULL,          -- Date of the *latest* data point used (Freshness)
  valid_until TIMESTAMPTZ                   -- Null = currently valid
);

-- Indexes
CREATE INDEX idx_perf_models_profile_current
  ON profile_performance_models(profile_id, category, model_type, valid_from DESC)
  WHERE valid_until IS NULL;

-- Unique constraint for current active model
CREATE UNIQUE INDEX idx_perf_models_current_unique
  ON profile_performance_models(profile_id, category, model_type)
  WHERE valid_until IS NULL;
```

### 2.2. Verification

- Verify `profile_metric_logs` and `profile_performance_metric_logs` exist (confirmed in recent migrations).
- Ensure RLS policies are set (or disabled) consistent with the project standards.

---

## 3. Backend Logic & Automation

### 3.1. Architecture

We will use **tRPC Procedures** for the calculation logic to keep business logic within the application layer.

**Constraint:** The `profile_performance_models` table is strictly **read-only** for client APIs. Users cannot manually edit the curves; they are only updated via the recalculation trigger described below.

### 3.2. Data Flow: Metric Updates & Rolling Window

When a user manually enters a new FTP or Weight, or when an integration (Strava) provides new bests:

1.  **Input:** Client calls `profilePerformanceMetrics.create`.
2.  **Action:**
    - Insert row into `profile_performance_metric_logs`.
    - **Trigger:** Call an internal helper `recalculatePerformanceModel(profileId, category)`.
3.  **Recalculation Logic (`recalculatePerformanceModel`):**
    - **Rolling Window:** Fetch "best" metrics from `profile_performance_metric_logs` where `recorded_at > NOW() - 90 DAYS`.
    - **Decay Handling:** By strictly filtering for the last 90 days, old high-performance efforts naturally "expire" and are excluded from the calculation. This results in a lower CP/W' if the user has not performed recently.
    - **Compute:** Calculate Critical Power (CP) and W' using a standard regression model.
    - **Validation:** Check `effort_count`. If `< 3` or `max_effort_duration` is too short, flag as low confidence (or skip update if strictly enforcing quality).
    - **Update:**
      - Insert a new row into `profile_performance_models`.
      - Set `valid_from` to the `recorded_at` of the _most recent_ metric used (this serves as the "Freshness Date").
      - Update `valid_until` of the previous model to `NOW()`.

### 3.3. Data Flow: Activity Analysis (Future Integration)

When a FIT file is analyzed (via `analyze-fit-file` Edge Function):

1.  Extract "Mean Max Power" curve.
2.  Compare against current `profile_performance_metric_logs`.
3.  **Suggestion:** If a new best is found (e.g., new 5-min power record), create a "Pending" metric log (or notify user to accept it).
4.  _Note: For Phase 1, we will rely on manual entry or simple extraction._

---

## 4. Mobile Application Changes

### 4.1. Settings Screen Refactor (`apps/mobile/app/(internal)/(standard)/settings.tsx`)

**Problem:** The current Settings screen tries to read `profile.ftp`, `profile.weight_kg`, etc., which were deleted from the database.
**Fix:**

1.  **Fetch Data Correctly:**
    - Use `trpc.profiles.getZones` to get the latest **FTP** and **Threshold HR**.
    - Use `trpc.profileMetrics.getAtDate` (or list with limit 1) to get the latest **Weight**.
2.  **UI Updates:**
    - Display these values with their "Recorded At" dates (e.g., "FTP: 250W (set Jan 12)").
    - Add a **"Performance"** button linking to a new management screen.
    - **Note:** This Settings area (via the new screen) is the **exclusive** place for manual updates post-onboarding.

### 4.2. New Screen: Performance Management

**Location:** `apps/mobile/app/(internal)/performance/index.tsx` (New Route)
**Features:**

- **Tabs/Segments:** "Body" (Weight, etc.) vs "Performance" (FTP, Pace).
- **List View:** Show history of metrics (using `profilePerformanceMetrics.list`).
- **Add Button:** FAB to add a new manual entry (Weight, FTP test result, etc.).
- **Charts:** Simple line chart showing progression of FTP or Weight over time.

### 4.3. Onboarding (`apps/mobile/app/(external)/onboarding.tsx`)

- **Review:** The current onboarding flow already writes to the correct tables (`profilePerformanceMetrics`).
- **Validation:** Ensure the `onboarding.tsx` logic correctly handles the response types and errors. No major schema changes needed here, just verification.
- **Completion:** Upon successful submission of initial metrics, the flow must explicitly set `profiles.onboarded = true` to gate access and unlock the full application.

---

## 5. Visualizations (UI/UX)

### 5.1. Performance Curves

- **Where:** On the new "Performance Management" screen.
- **What:**
  - **Power Duration Curve:** Plot Power (y) vs Time (x, logarithmic).
  - **Data Source:** `profile_performance_metric_logs` (scatter plot of bests) + `profile_performance_models` (line curve for CP model).

---

## 6. Future Roadmap

- **AI/ML Integration:** The `profile_performance_models` table includes quality metrics (`r_squared`). This feeds directly into future "Race Prediction" features where we weigh the model's confidence.
- **Automated Detection:** "You set a new 5k PR! Update your Threshold Pace?" (Notification logic).
- **W' Balancing:** Real-time burn-down of W' during activity recording (requires the CP model we are building now).
