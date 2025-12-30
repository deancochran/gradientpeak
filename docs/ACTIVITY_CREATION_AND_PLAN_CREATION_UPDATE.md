# Reimagined Activity Builder: Product Vision

## The Problem We're Solving

Today, creating a workout in our app feels like filling out a tax form. Users navigate through multiple screens, input data into text fields, and struggle to visualize what their workout will actually feel like. The experience is administrative and disconnected from the reality of training—athletes don't think in forms, they think in intervals, hills, and race-day scenarios.

**The disconnect is clear:**
- Creating a 60-minute interval workout takes 5+ minutes of form filling
- Users can't see their workout structure until after they've built it
- Route information exists separately from workout planning
- Making adjustments requires navigating back through multiple screens
- The cognitive load is high; the experience is frustrating

## The Vision: From Data Entry to Workout Design

We're transforming workout creation from an administrative task into an intuitive, visual design experience. Think of it like the difference between writing HTML code versus using a modern website builder—same outcome, completely different experience.

### Technical Foundation: Interval-Based Architecture

Under the hood, our new workout builder is powered by a simplified **interval-based data structure**. Unlike the old flat-step approach where intervals were expanded into dozens of individual steps, the new architecture treats intervals as first-class objects:

**Every workout is composed of intervals:**
- Each interval has a **name** (e.g., "Warmup", "VO2 Max Intervals", "Cooldown")
- Each interval contains **one or more steps** (e.g., "Hard 3min", "Recovery 3min")
- Each interval has a **repetition count** (default: 1)

**Example:**
```
Workout Structure:
├─ Warmup (×1)
│  └─ Easy Pace · 10min @ 65% FTP
├─ VO2 Max Intervals (×5)
│  ├─ Hard · 3min @ 110% FTP
│  └─ Recovery · 3min @ 55% FTP
└─ Cooldown (×1)
   └─ Easy · 10min @ 60% FTP
```

This structure eliminates the confusion of "add step vs add interval" — everything is an interval. A single step is simply an interval with 1 repetition. This matches how athletes think: "I'm doing 5 hard intervals" not "I'm adding 10 individual steps."

---

## How It Works: The User Experience

### Starting Point: Quick Start

When users want to create a new activity, they're welcomed with a **Quick Start screen** that offers three immediate paths:

**Recent Workouts**
Visual cards showing their last few activities. One tap duplicates the workout as a starting point—no need to rebuild from scratch.

**Templates**
Pre-built workout structures created by coaches and the community. Examples: "Sweet Spot Builder," "FTP Test Protocol," "Recovery Spin." Each template shows a visual preview of the workout structure so users know exactly what they're getting.

**Blank Canvas**
For users who want to build from scratch—but even here, the experience is visual and intuitive, not form-based.

---

### The Workout Builder: Visual and Tactile

Once a user selects their starting point, they enter the **Workout Builder**—a full-screen, interactive canvas that makes workout structure tangible.

#### The Interactive Chart

The heart of the builder is a **colorful bar chart** that represents the workout structure. Each bar is a segment of the workout:

- **Blue bars** = Warm-up (low intensity)
- **Green bars** = Steady endurance  
- **Yellow bars** = Build efforts
- **Orange bars** = Hard intervals
- **Red bars** = Maximum efforts

The width of each bar shows duration; the height shows intensity. At a glance, users see the entire workout flow.

#### Direct Manipulation

Users interact with the workout by **touching the bars directly**:

- **Tap a bar** → Opens a quick editor to adjust duration, intensity, or other details
- **Long-press and drag** → Reorders segments (move the intervals before the warm-up? Sure!)
- **Tap the + button** between bars → Inserts a new segment exactly where needed
- **Pinch to zoom** → For longer workouts, zoom in on specific sections

Every change updates the chart instantly—no saving, no waiting, no confusion.

#### Interval Pills

Below the chart, **colored pills** represent workout intervals:

- "Warmup (×1) · 5min"
- "VO2 Max (×5) · 30min"  
- "Steady State (×1) · 20min"
- "Cooldown (×1) · 10min"

Each pill shows:
- The interval name
- The repetition count (×N)
- The total duration for that interval (including all repetitions)

Tapping a pill highlights that interval in the chart and jumps straight to it. This makes navigation effortless, especially in longer workouts with many intervals.

#### Real-Time Metrics

At the bottom of the screen, key metrics update live as users build:
- Total duration
- Estimated training load (TSS)
- Intensity factor
- Total intervals

Users always know what they're building—no surprises.

---

### The Interval Editor: Adjustments Made Simple

When a user taps an interval bar to edit it, a **drawer slides up from the bottom** (it doesn't cover the whole chart—users can still see their changes happening above).

Inside the drawer:

**Interval Name Field**
Quick text input to name the interval: "Warmup", "Threshold Intervals", "Sprint Repeats", etc.

**Repetition Stepper**
A simple counter with [-] and [+] buttons to adjust how many times this interval repeats. This is the key to the new architecture—users can easily create "5 intervals" by setting repetitions to 5, not by manually adding 10 steps.

**Steps Within Interval**
Below, a list of steps that make up one cycle of the interval:
- "Hard · 3min @ 110% FTP"
- "Recovery · 3min @ 55% FTP"

Users can:
- **Tap a step** to edit it (opens step editor with sliders for duration, intensity, cadence)
- **Tap "+ Add Step"** to add another step to this interval
- **Long-press and drag** to reorder steps within the interval
- **Swipe left** to delete a step

**Visual Sliders (Per Step)**
When editing an individual step within the interval:
- Drag the **Duration slider** to adjust from 30 seconds to 60 minutes
- Drag the **Intensity slider** to set power from 50% to 200% FTP
- Drag the **Cadence slider** (for cycling) to set pedaling rhythm

As users drag, the bars in the chart above **update in real-time**. They see the change immediately—no guesswork.

**Quick Actions**
- **Duplicate this interval** (instant copy with all steps and repetitions)
- **Delete this interval** (with confirmation)
- **Convert to template** (save this interval pattern for reuse)

Swipe down on the drawer to dismiss and return to the full chart.

#### Why This Matters Technically

The old approach required expanding "5×(Hard + Rest)" into 10 individual database entries. Editing the repetition count meant deleting all 10 and recreating them. 

The new approach stores intervals natively:
```json
{
  "id": "uuid-123",
  "name": "VO2 Max Intervals",
  "repetitions": 5,
  "steps": [
    {"name": "Hard", "duration": {"type": "time", "seconds": 180}, ...},
    {"name": "Rest", "duration": {"type": "time", "seconds": 180}, ...}
  ]
}
```

Changing repetitions from 5 to 6? Update one field. Adding a recovery step? Insert into the `steps` array. The data model matches the mental model.

---

### Adding Route Context

Many outdoor workouts benefit from geographic context. Users can optionally **attach a route** to their workout.

#### Route Selection

Users tap "Add Route" and choose from:
- **Saved routes** from their library
- **Import** a GPX file from another platform
- **Record live** (starts GPS tracking)
- **Skip** (for indoor workouts)

#### The Route & Plan Overview Screen

When a route is selected, users enter a new screen that brings together geography and workout structure.

**The Map**
At the top, a full map displays the route with clear visual markers. Users see exactly where they'll be riding or running.

**Elevation Profile**
Below the map, the route's elevation profile shows every hill, descent, and flat section. This is critical for outdoor training—knowing where climbs happen changes workout strategy.

**Workout Overlay**
Here's where the magic happens: the colorful workout bars **overlay directly onto the elevation profile**. Users see exactly where each interval falls on the route:

- Will the hard intervals hit during the big climb?
- Does the recovery segment align with the descent?
- Are the steady sections on flat roads?

This visualization transforms abstract workout planning into concrete, actionable training.

**Alignment Controls**

Users can adjust where the workout starts on the route using a **visual slider**:
- Drag to shift the entire workout earlier or later along the route
- Use "Snap to Hills" to automatically align high-intensity intervals with climbs
- Use "Snap to Flat" to place intervals on level terrain

As they adjust, the workout overlay updates in real-time, showing the new placement.

**Contextual Summary**

At the bottom, a mini overview shows the entire workout structure scaled to fit the route. This "zoomed-out" view helps users understand how their workout fits the geography at a glance.

---

### Finishing Up: Schedule and Save

Once the workout is built and (optionally) aligned to a route, users have clear next steps:

**Schedule Activity**
Opens a calendar picker to assign the workout to a specific date and time.

**Save as Template**
Adds this workout to the template library so the user (or their coach/community) can reuse it later.

**Start Now**
Immediately launches the workout in activity tracking mode.

**Save Draft**
Saves the workout for future refinement.

---

## The Difference: Before and After

### Before (Current Experience)

1. Open "Create Activity" form
2. Type activity name
3. Select category from dropdown
4. Type description
5. Navigate to "Edit Structure"
6. Tap "Add Step"
7. Fill out step form (name, duration, intensity, cadence)
8. Tap "Save"
9. Repeat steps 6-8 for every segment (could be 20+ times)
10. Navigate back to main form
11. Optionally attach route (separate screen)
12. Save activity
13. Hope it looks right when actually doing the workout

**Time: 5-8 minutes**  
**Feeling: Tedious, uncertain**

---

### After (Reimagined Experience)

1. Tap "New Activity"
2. Select template or recent workout (or start blank)
3. See full workout structure immediately as colorful bars
4. Tap bars to adjust durations/intensities with sliders
5. Drag bars to reorder if needed
6. Optionally add route
7. See workout overlaid on elevation profile
8. Adjust alignment if needed
9. Tap "Schedule Activity"

**Time: 1-2 minutes**  
**Feeling: Confident, intuitive**

---

## Why This Matters

### For Athletes

**Reduced Cognitive Load**
Visual representation matches how athletes think about training. "4 hard intervals with recovery in between" is immediately visible, not buried in a list.

**Faster Workflow**
What took 5-8 minutes now takes 1-2 minutes. Athletes can plan workouts on the fly without frustration.

**Better Planning**
Seeing intervals overlaid on elevation helps athletes prepare mentally and physically. They know exactly what's coming and where.

**Increased Confidence**
Real-time previews eliminate guesswork. Athletes see changes as they make them, reducing errors and second-guessing.

### For Coaches

**Template Library**
Coaches can create template workouts once and share them with all athletes. No need to rebuild the same workout structure 50 times.

**Visual Communication**
Sending a workout plan becomes clearer. The visual chart communicates structure better than text descriptions ever could.

**Faster Adjustments**
When an athlete needs a workout modified, coaches can duplicate, adjust, and reassign in seconds.

### For the Business

**Differentiation**
Most fitness apps still use form-based workout creation. This visual, tactile builder sets us apart and becomes a key selling point.

**Higher Engagement**
Users who can create workouts easily will create more workouts. More workouts = more platform usage = better retention.

**Premium Feature Potential**
Advanced features (template library, route overlay, AI alignment) can be gated as premium offerings.

**Reduced Support Load**
Intuitive UI means fewer "how do I...?" support tickets.

---

## User Scenarios

### Scenario 1: Busy Professional Cyclist

**Sarah has 45 minutes before work to squeeze in a trainer workout.**

She opens the app, taps "New Activity," selects the "45min Sweet Spot" template, and sees the full structure in seconds: 10min warmup, 3×10min intervals, 5min cool down.

She wants the intervals slightly harder, so she taps the orange interval bars and drags the intensity slider from 88% to 92% FTP. The chart updates instantly.

She taps "Start Now" and begins her workout, confident it's exactly what she needs.

**Time to create: 30 seconds**

---

### Scenario 2: Trail Runner Planning a Hilly Long Run

**Marcus is planning Sunday's 20-mile trail run.**

He taps "New Activity," selects "Blank Canvas," then "Add Route" and chooses his favorite mountain trail from the library.

The route appears with its elevation profile showing three major climbs. He taps around the chart to add segments:
- 15min easy warmup
- 4×8min tempo efforts (aligned to the four climbs using "Snap to Hills")
- Easy recovery between each climb
- 10min cool down

As he builds, he watches the workout bars overlay the elevation. The tempo efforts fall perfectly on the climbs. He can visualize exactly where he'll be working hard.

He taps "Schedule Activity," picks Sunday morning, and he's done.

**Time to create: 2 minutes**

---

### Scenario 3: Coach Assigning Weekly Workouts

**Coach Jennifer manages 30 athletes.**

Every Monday, she assigns the week's workouts. Instead of writing text descriptions or rebuilding workouts from scratch, she:

1. Opens the template library
2. Duplicates "Threshold Tuesday"  
3. Adjusts intensity slightly for athlete skill level (slides intensity up 5%)
4. Assigns to athletes with one tap
5. Repeats for other days' workouts

What used to take 2 hours now takes 20 minutes. Her athletes receive visual workout plans that are clear and actionable.

**Time saved: 100 minutes/week**

---

## Success Metrics

We'll measure success through:

**Efficiency**
- Average time to create a workout drops from 5 minutes to under 2 minutes
- Number of workouts created per user per week increases

**Satisfaction**
- User satisfaction scores (NPS) for workout creation improve
- Support tickets related to workout building decrease

**Engagement**
- Template usage reaches 40%+ of all workouts created
- Route overlay feature used in 30%+ of outdoor activities

**Retention**
- Users who create workouts using the new builder show higher retention
- Premium conversion increases as advanced features drive upgrades

---

## Rollout Philosophy

This isn't just a feature update—it's a fundamental reimagining of how users interact with our platform.

**Phase 1: Core Visual Builder**
Launch the interactive chart and quick editor. Users can build workouts visually without forms.

**Phase 2: Route Integration**
Add the route overlay and elevation alignment features. Geographic context enhances outdoor workout planning.

**Phase 3: Templates & Sharing**
Build out the template library and enable workout sharing. Coaches and community power user engagement.

**Phase 4: AI Enhancements**
Introduce smart suggestions, automatic alignment, and progressive overload recommendations.

Each phase delivers immediate value while building toward the complete vision.

---

## The Bottom Line

We're not just improving a feature—we're transforming how athletes plan their training.

The reimagined activity builder turns workout creation from a chore into a creative, intuitive experience. Users see what they're building in real-time, interact with visual representations that match how they think, and gain confidence that their training plan will execute exactly as envisioned.

This is workout planning that feels like workout planning—visual, tactile, geographic, and real.

**It's the difference between filling out paperwork and designing a training session.**

And that difference is everything.
