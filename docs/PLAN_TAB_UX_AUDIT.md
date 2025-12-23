# Plan Tab UI/UX Audit & Pain Points

## Executive Summary

The Plan tab has grown into a complex, nested system requiring users to navigate through multiple pages, modals, and redirects to accomplish basic tasks. This audit documents each flow, visual approach, and specific pain points with recommendations for improvement.

---

## 1. ROOT PLAN PAGE (`/plan/index.tsx`)

### Current Visual
- **The Anchor** (Top 15%): Month header + universal "+" button + week strip with status dots
- **The Stage** (Middle 45%): Selected day with hero cards or ghost card
- **The Horizon** (Bottom 30%): "Up Next" showing next 3-4 days
- **The Ledger** (Footer): Collapsible weekly totals

### What Works Well
✓ Clean, modern "Context → Action → Forecast" structure
✓ Status dots (filled blue = scheduled, empty ring = none, green = completed) are simple and effective
✓ Ghost card makes empty states feel intentional
✓ Single-screen overview eliminates need to navigate away

### Pain Points
❌ **No search/filter for activities** - The "+" button redirects to create_planned_activity, which shows a horizontal scroll of activity plans but no search
❌ **No "quick start" option** - Cannot start an activity immediately and have it auto-record as a planned activity
❌ **No route/template discovery** - No way to browse or search for routes or templates from the main plan view

### Recommended Improvements
1. **Universal "+" should open bottom sheet with 3 options:**
   - "Browse Library" → Opens searchable library modal
   - "Quick Start" → Immediately starts activity recording, prompts to attach plan after
   - "Create New Plan" → Current create_activity_plan flow
2. **Add search bar to The Stage when empty** - "Search activities, routes, or start training..."
3. **Hero cards should show route thumbnail if attached**

---

## 2. SCHEDULE ACTIVITY FLOW (`/plan/create_planned_activity/index.tsx`)

### Current Visual
**Text-heavy form with:**
- Horizontal scroll of activity plan cards (small thumbnails)
- Selected plan shows in a muted card with text-only details
- Date picker button with calendar icon
- Text area for notes
- "Schedule Activity" button at bottom

### Pain Points
❌ **No search/filter for activity plans** - Must scroll horizontally through all plans
❌ **Text-dominant, not visual** - Plans show name, category, duration (text) but no visual structure preview
❌ **No route/template search** - Can only select from existing activity plans, can't search routes
❌ **Redirects to separate page** - Breaks context, should be a modal or bottom sheet
❌ **No visual calendar** - Date picker is native OS modal, not inline visual calendar
❌ **Empty state forces navigation** - If no plans exist, "Create Your First Plan" button redirects to create_activity_plan page

### Recommended Improvements
1. **Convert to bottom sheet modal** instead of separate page
2. **Add search bar at top** - "Search activities, routes, templates..."
3. **Show visual structure thumbnails** in plan cards (mini timeline chart)
4. **Show route map thumbnail** if plan has attached route
5. **Inline week calendar** for date selection instead of native picker
6. **Quick filters** - Run, Bike, Swim, Strength buttons at top
7. **"Quick Start" tab** in modal - Start now, attach plan later

---

## 3. ACTIVITY LIBRARY (`/plan/library/index.tsx`)

### Current Visual
- Top bar: Activity count + filter dropdown (All, Run, Bike, etc.)
- Segmented tabs: "My Plans" | "Samples"
- Vertical scroll of PlanCard components
- FAB (floating action button) in bottom-right corner

### What Works Well
✓ Segmented tabs are clean and clear
✓ Filter dropdown works well
✓ Cards show useful metrics (duration, TSS, step count)

### Pain Points
❌ **No search bar** - Only filter by type, can't search by name/keyword
❌ **Cards are text-heavy** - Show metrics but no visual structure preview
❌ **No route preview** - Can't see if plan has a route attached
❌ **Separate page** - Should be accessible as modal from main plan screen
❌ **FAB opens create_activity_plan** - Another page navigation instead of modal

### Recommended Improvements
1. **Add search bar below filter** - "Search by name or description..."
2. **Add visual timeline thumbnail** to each card (small horizontal chart)
3. **Show route map thumbnail** if attached
4. **Convert to bottom sheet modal** accessible from main plan page
5. **Add "Schedule" button on each card** for quick scheduling without opening detail modal

---

## 4. ACTIVITY PLAN CREATION (`/plan/create_activity_plan/index.tsx`)

### Current Visual
**Single-screen form with:**
- Row 1: Activity category icon (big button) + Name input
- Row 2: Activity location selector (Outdoor/Indoor buttons)
- Row 3: Description textarea
- Row 4: Route selector card (dropdown + upload button)
- Row 5: Structure + Metrics card (shows timeline chart or "No structure defined")

### What Works Well
✓ Compact single-screen layout
✓ Visual timeline chart preview
✓ Route selector with map preview

### Pain Points
❌ **No template/route search** - Route selector is dropdown only, no search
❌ **"Edit Structure" redirects to separate page** - Breaks flow, should be modal or inline
❌ **Route selector requires navigating to upload page** - Should be inline search with results
❌ **No "quick templates"** - Can't select from pre-built structure templates
❌ **Structure card is small** - Hard to see detail in 120px chart

### Recommended Improvements
1. **Add "Start from Template" button at top** - Opens searchable template library
2. **Route selector should be searchable modal** - Type to search, shows map previews
3. **Make structure editing inline with bottom sheet** - Don't redirect to separate page
4. **Expandable structure card** - Tap to expand full screen preview
5. **Quick structure templates** - "Intervals", "Long Run", "Recovery", "Tempo" buttons

---

## 5. STRUCTURE EDITOR (`/plan/create_activity_plan/structure/index.tsx`)

### Current Visual
**Separate page with:**
- Header: Back button + "Structure" title + "+" button
- Metrics bar: Steps count, Duration, Segments count (text)
- Timeline chart preview (horizontal strip)
- Scrollable list of segments (collapsible sections)
- Each segment has draggable StepCard items

### What Works Well
✓ Draggable reordering works well
✓ Timeline chart gives good overview
✓ Segment grouping helps organize complex structures

### Pain Points
❌ **"+" button opens modal with "Single Step" or "Interval Set" choice** - Extra tap, should be single button with default
❌ **"Interval Set" opens IntervalWizard modal** - Complex wizard when it should be simple inline
❌ **Redundant step/interval distinction** - User noted "a step is really an interval with only one repeat cycle"
❌ **Separate page** - Breaks context from main creation flow
❌ **Segments are manually named** - No auto-naming like "Warmup", "Main Set", "Cooldown"

### Recommended Improvements
1. **Single "Add Block" button** - Default to interval with repeat = 1 (which is a step)
2. **Repeat defaulted to 1** - User can increase if needed
3. **Inline block editing** - Bottom sheet instead of full-page modal
4. **Smart segment naming** - Auto-suggest "Warmup" for first, "Cooldown" for last
5. **Convert to bottom sheet modal** - Keep context with main creation page

---

## 6. INTERVAL WIZARD (`/components/ActivityPlan/IntervalWizard.tsx`)

### Current Visual
**Large modal with:**
- Segment name input
- Repeat count input
- Work Phase section (card with name, duration+unit, intensity inputs)
- Rest Phase section (card with name, duration+unit, intensity inputs)
- Preview section (SVG bar chart, summary stats)

### Pain Points
❌ **Forces two-step pattern** - Work + Rest only, but user wants "multiple steps per interval"
❌ **Separate modal dialog** - Should be inline with structure editor
❌ **Complex for simple use cases** - Too many fields for "just add a 10min warmup"
❌ **No support for complex intervals** - Can't do 3+ steps in a single interval block

### Recommended Improvements
1. **Remove IntervalWizard entirely** - Replace with simple "Block" concept
2. **Block = 1 or more steps with shared repeat count**
3. **Inline editing in structure list** - Not separate modal
4. **Draggable steps within block** - Add/remove/reorder freely
5. **Quick presets** - "Warmup", "Main Set", "Cooldown" buttons with smart defaults

---

## 7. STEP EDITOR (`/components/ActivityPlan/StepEditorDialog.tsx`)

### Current Visual
**Modal dialog with:**
- Step name input
- Description input
- Segment name input
- Duration type dropdown (Time/Distance/Reps/Until Finished)
- Duration value + unit inputs
- Intensity targets section (can add up to 3 targets)
- Each target has type dropdown + value input + delete button
- Notes textarea

### What Works Well
✓ Comprehensive fields for advanced users
✓ Multiple intensity targets is powerful
✓ Duration flexibility (time/distance/reps) is good

### Pain Points
❌ **Too many fields for simple use cases** - Just want to add "10min easy" quickly
❌ **Segment name field is redundant** - Already editing within a segment
❌ **Description and Notes are redundant** - Should be single "Notes" field
❌ **Modal takes full height** - Feels heavy for quick edits

### Recommended Improvements
1. **Add "Quick Mode" toggle** - Shows only name, duration, intensity (single field)
2. **Remove segment name field** - Inherit from parent block
3. **Merge description and notes** - Single "Notes" field
4. **Convert to bottom sheet** - Slide up from bottom, dismissible
5. **Quick intensity presets** - "Easy (60-70%)", "Tempo (80-90%)", "Threshold (95-105%)", "VO2 Max (110-120%)"

---

## 8. TRAINING PLAN CALENDAR (`/plan/training-plan/calendar.tsx`)

### Current Visual
- Week navigator (left/right arrows, week range)
- Weekly summary bar (TSS, duration, distance)
- Grid of day cards (7 columns)
- Each day shows activity cards or empty state
- "+" button on each day to add activity

### Pain Points
❌ **Separate page from main plan/index** - Duplicate functionality
❌ **Opens AddActivityModal** - Another modal layer for scheduling
❌ **No visual structure preview** - Activity cards are text-only
❌ **Redundant with new plan/index The Stage + Horizon** - Same functionality, different UI

### Recommended Improvements
1. **Deprecate training-plan/calendar** - Consolidate into main plan/index
2. **Use The Stage + Horizon pattern** everywhere
3. **If keeping calendar, add structure thumbnails** to activity cards

---

## 9. PLANNED ACTIVITIES LIST (`/plan/planned_activities/index.tsx`)

### Current Visual
- Activity count header
- Scrollable list grouped by date
- Each activity shows: name, date, time, category icon
- FAB to schedule new activity (redirects to library)

### Pain Points
❌ **Text-heavy list** - No visual structure preview
❌ **No search/filter** - Can't find specific activities quickly
❌ **FAB redirects to library page** - Should open library modal instead
❌ **Redundant with main plan view** - Same activities shown in different format

### Recommended Improvements
1. **Add search bar** - "Search scheduled activities..."
2. **Add structure thumbnails** - Mini timeline chart for each activity
3. **Add route map thumbnails** - If attached
4. **FAB opens library modal** - Don't redirect to page
5. **Consider deprecating** - If main plan/index provides enough functionality

---

## 10. REPEAT EDITOR (`/plan/create_activity_plan/structure/repeat/index.tsx`)

### Current Visual
**Separate page with:**
- Header: Cancel + title + Save
- Repeat count input row
- Timeline preview (shows 1 cycle)
- Pattern steps list (draggable)
- Add Step button

### Pain Points
❌ **Separate page** - Should be inline or bottom sheet
❌ **Confusing concept** - User expects "blocks with repeat counts", not separate repeat editor
❌ **Forces pattern extraction** - If editing existing repeat, tries to extract pattern which can be confusing
❌ **No way to see expanded result** - Only shows 1 cycle, not all expanded steps

### Recommended Improvements
1. **Remove repeat editor page entirely** - Replace with inline block concept
2. **Block should show all steps with visual repeat indicator** - "Steps 1-5 × 3 repeats"
3. **Drag to reorder blocks** - Not individual steps inside repeated blocks
4. **Visual "repeat bar"** - Shows which steps are part of repeat group

---

## CONSOLIDATED PAIN POINTS SUMMARY

### 🔴 Critical Issues

1. **No Search/Discovery**
   - Can't search activity plans when scheduling
   - Can't search routes when creating plans
   - Can't search templates or pre-built structures
   - No global search for "I want to do a 5k tempo run with hills"

2. **Too Many Page Redirects**
   - create_planned_activity → separate page (should be modal)
   - library → separate page (should be modal)
   - create_activity_plan → separate page (could be modal)
   - structure editor → separate page (should be bottom sheet)
   - repeat editor → separate page (should be inline)

3. **No Visual Previews**
   - Activity cards are text-only (no structure chart thumbnail)
   - No route map thumbnails in cards
   - Schedule activity form is text-dominant
   - Planned activities list has no visual structure

4. **Redundant Step/Interval Concept**
   - IntervalWizard forces 2-step pattern (work/rest)
   - Can't create 3+ steps per interval
   - Step is really just interval with repeat=1
   - Should be unified "Block" concept

5. **No Quick Start Flow**
   - Can't start activity immediately and record as planned
   - Must schedule first, then start later
   - No "freestyle → attach plan later" option

### 🟡 Medium Issues

6. **Text-Heavy Forms**
   - StepEditorDialog has too many fields for simple use
   - Description vs Notes redundancy
   - Segment name input when already in segment

7. **Date Selection**
   - Native date picker modal instead of inline calendar
   - No visual week view for scheduling
   - Can't see what's already scheduled when picking date

8. **Route Attachment**
   - Route selector is dropdown-only
   - Must redirect to upload page to add new route
   - No inline search with map previews

---

## RECOMMENDED IMPLEMENTATION PRIORITY

### Phase 1: Critical UX Fixes (High Impact, Medium Effort)

1. **Add Universal Search**
   - Search bar in The Stage (when empty): "Search activities, routes, templates..."
   - Opens bottom sheet with tabs: Activities | Routes | Templates
   - Real-time search results with thumbnails

2. **Convert Pages to Modals**
   - create_planned_activity → Bottom sheet modal
   - library → Bottom sheet modal  
   - structure editor → Bottom sheet modal

3. **Add Visual Thumbnails**
   - Structure timeline thumbnail (120×40px) in all activity cards
   - Route map thumbnail (80×80px) in all cards with routes
   - Update PlanCard, ActivityCard, PlannedActivityCard components

### Phase 2: Structure Editing Simplification (High Impact, High Effort)

4. **Replace Step/Interval with Block Concept**
   - Remove IntervalWizard component
   - Single "Add Block" button (default repeat = 1)
   - Inline editing with bottom sheet
   - Draggable steps within block
   - Draggable blocks for reordering

5. **Remove Repeat Editor Page**
   - Inline repeat count on each block
   - Visual repeat indicator in structure list
   - Edit pattern inline, not separate page

### Phase 3: Quick Start & Templates (Medium Impact, Medium Effort)

6. **Quick Start Flow**
   - "Start Now" button in main plan view
   - Immediately begins activity recording
   - Prompts to attach/create plan after activity completes
   - Auto-schedules to current date

7. **Structure Templates**
   - "Start from Template" in create_activity_plan
   - Pre-built templates: Intervals, Long Run, Recovery, Tempo, Fartlek
   - One-tap apply, then customize

### Phase 4: Polish & Refinement (Low Impact, Low Effort)

8. **Inline Date Selection**
   - Visual week calendar in schedule bottom sheet
   - Shows existing activities on each day
   - Swipe to navigate weeks

9. **Smart Defaults & Presets**
   - Auto-suggest segment names (Warmup, Main Set, Cooldown)
   - Intensity presets (Easy, Tempo, Threshold, VO2 Max)
   - Quick Mode toggle in StepEditorDialog

10. **Route Search & Discovery**
    - Inline route search in RouteSelector
    - Map preview thumbnails in results
    - Filter by distance, elevation, surface type

---

## VISUAL MOCKUP RECOMMENDATIONS

### Universal Search Bottom Sheet
```
┌─────────────────────────────────────┐
│ 🔍 Search activities, routes...     │
│ ───────────────────────────────────  │
│                                      │
│ Activities │ Routes │ Templates     │ ← Tabs
│ ─────────────────────────────────   │
│                                      │
│ ┌──────────────────────────────┐   │
│ │ [Chart] 5K Tempo Run          │   │ ← Visual thumbnail
│ │ 40 min · 8 steps · 250 TSS    │   │
│ │ [Map] Oak Park Loop attached  │   │
│ └──────────────────────────────┘   │
│                                      │
│ ┌──────────────────────────────┐   │
│ │ [Chart] Hill Repeats          │   │
│ │ 60 min · 12 steps · 180 TSS   │   │
│ └──────────────────────────────┘   │
│                                      │
└─────────────────────────────────────┘
```

### Schedule Bottom Sheet with Calendar
```
┌─────────────────────────────────────┐
│ ⚙️ 5K Tempo Run                     │
│ ───────────────────────────────────  │
│                                      │
│ < Apr 2024 >                         │ ← Inline week calendar
│ M  T  W  T  F  S  S                 │
│ 1  2  3  4  5  6  7                 │
│ ●  ○  ●  ○  ✓  ●  ○                │ ← Status dots
│                                      │
│ Selected: Thu, Apr 4                 │
│ Already scheduled: Easy Run (6mi)   │ ← Warning
│                                      │
│ [Schedule Anyway] [Choose Another]  │
└─────────────────────────────────────┘
```

### Block-Based Structure Editor
```
┌─────────────────────────────────────┐
│ Structure                      [+]   │
│ ───────────────────────────────────  │
│                                      │
│ ┌─ Warmup ──────────────────────┐   │
│ │ ⋮⋮ 10min Easy (60% FTP)       │   │ ← Drag handle
│ │    Repeat: 1                   │   │
│ └───────────────────────────────┘   │
│                                      │
│ ┌─ Main Set ×5 ─────────────────┐   │ ← Shows repeat count
│ │ ⋮⋮ 2min Hard (95% FTP)         │   │
│ │ ⋮⋮ 1min Easy (55% FTP)         │   │
│ │    Repeat: 5 [↓]               │   │ ← Inline repeat control
│ └───────────────────────────────┘   │
│                                      │
│ ┌─ Cooldown ────────────────────┐   │
│ │ ⋮⋮ 10min Easy (55% FTP)        │   │
│ │    Repeat: 1                   │   │
│ └───────────────────────────────┘   │
│                                      │
│ [Add Block]                          │
└─────────────────────────────────────┘
```

---

## CONCLUSION

The Plan tab has strong foundational architecture (Context → Action → Forecast), but suffers from:
- Over-nested navigation (too many pages/redirects)
- Lack of search and discovery features
- Text-heavy, non-visual presentation
- Confusing step/interval/repeat conceptual model
- No quick start or freestyle recording option

By implementing the recommended phases, the Plan tab can become:
- **Single-screen focused** - Modals instead of page redirects
- **Visual-first** - Structure charts and route maps everywhere
- **Searchable** - Universal search for activities, routes, templates
- **Simplified** - Block concept replaces step/interval/repeat confusion
- **Flexible** - Quick start for casual users, deep editing for athletes
