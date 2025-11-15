# 📱 Mobile Activity Builder - User Guide

**Version**: 1.0  
**Platform**: React Native (Expo) Mobile App  
**Status**: Phases 1-4 Complete

---

## 🎯 Overview

The Activity Builder lets you create structured workout plans with visual feedback and smart defaults. Create a complete workout in under 60 seconds with just 3-5 taps!

---

## 🚀 Getting Started

### Opening the Builder

1. Open the app
2. Navigate to **Plan** tab
3. Tap **Create Activity Plan**

---

## 📖 Creating Your First Activity

### Step 1: Name Your Activity

- Tap the activity name at the top
- Enter a descriptive name (e.g., "Morning Run", "Hill Repeats")
- Name auto-saves as you type

### Step 2: Select Activity Type

Swipe through the horizontal activity type selector:

- 🏃 **Outdoor Run** - Running outdoors with GPS
- 🚴 **Outdoor Bike** - Cycling outdoors with GPS
- 🏃 **Treadmill** - Indoor running
- 🚴 **Bike Trainer** - Indoor cycling
- 💪 **Strength** - Resistance training
- 🏊 **Swimming** - Pool or open water

**Smart Defaults**: Each activity type uses appropriate defaults:
- **Run/Bike**: Time-based with heart rate or power targets
- **Swim**: Distance-based with RPE (Rate of Perceived Exertion)
- **Strength**: Repetition-based with RPE

### Step 3: Add Steps

Tap the **"+ Step"** button to add workout segments:

#### First Step (Warmup)
- Automatically named "Warm-up" (or "Easy Swim" for swimming)
- Pre-filled with appropriate duration (10 minutes)
- Set to easy intensity (60% of max)

#### Middle Steps (Main Work)
- Automatically named "Interval 1", "Interval 2", etc.
- Pre-filled with main workout duration (20 minutes)
- Set to moderate-high intensity (75-80%)

#### Last Step (Cooldown)
- Automatically named "Cool-down" (or "Easy Swim")
- Pre-filled with recovery duration (5 minutes)
- Set to easy intensity (55%)

### Step 4: Add Intervals (Optional)

Tap the **"Repeat"** button to create interval blocks:

**Example**: 5x (2min Work / 1min Rest)
- Creates a repetition block with 5 repeats
- Contains two steps: Work and Rest
- Pre-filled with appropriate intensities
- Shows as expandable block in timeline

### Step 5: Visual Timeline

The **color-coded timeline** shows your entire workout:

- **Blue/Cyan**: Recovery/Easy (Zone 1-2)
- **Green**: Endurance (Zone 2)
- **Yellow**: Tempo (Zone 3)
- **Orange**: Threshold (Zone 4)
- **Red**: VO2max/High intensity (Zone 5)

**Bar Width**: Proportional to step duration
**Tap bars**: Select that step
**Visual overview**: See workout structure at a glance

### Step 6: Review & Save

- Check the **Duration** card (auto-calculated)
- Check the **Steps** count
- Tap the **Save icon** (💾) when ready

---

## 🎨 Understanding the Interface

### Header Bar
```
[X] Activity Name [💾 Save]
```
- **X**: Cancel and go back
- **Activity Name**: Tap to edit
- **Save**: Validates and saves workout

### Activity Type Bar
```
[🏃 Run] [🚴 Bike] [💪 Strength] →
```
- Horizontal scrollable chips
- Selected type highlighted
- Tap to change activity type

### Metrics Cards
```
┌─────────────┐ ┌─────────────┐
│ Duration    │ │ Steps       │
│ 45min       │ │ 8           │
└─────────────┘ └─────────────┘
```
- **Duration**: Total time (auto-calculated)
- **Steps**: Total step count (including flattened intervals)

### Timeline Chart
```
┌────────────────────────────────┐
│ [████▓▓██████████▓▓]          │
│ 8 steps              45min     │
└────────────────────────────────┘
```
- Visual representation of workout
- Color-coded by intensity
- Proportional bar widths
- Tap to select steps

### Step Cards
```
┌─────────────────────────────────┐
│ ⣿ │ Warm-up          10min   [X]│
│   │ 60% MaxHR                   │
└─────────────────────────────────┘
```
- **Grip icon**: Long-press to drag
- **Color bar**: Intensity zone indicator
- **Step name**: Primary identifier
- **Duration**: How long
- **Target**: Intensity target
- **Delete button**: Remove step

### Action Buttons
```
[+ Step] [Repeat]
```
- **+ Step**: Add single step
- **Repeat**: Add interval block

---

## ⚡ Quick Actions

### Reordering Steps

1. **Long-press** the step card (300ms)
2. Device will vibrate (haptic feedback)
3. **Drag** the card up or down
4. **Release** to drop in new position
5. Timeline updates automatically

### Deleting Steps

1. Tap the **X** button on step card
2. Confirm deletion in dialog
3. Step removed, timeline updates

### Selecting Steps

1. Tap any step card
2. Card highlights with blue border
3. Timeline bar highlights
4. Tap again to deselect

---

## 💡 Smart Default Examples

### Running Workout
```
Activity Type: Outdoor Run

Step 1: Warm-up
- Duration: 10 minutes
- Target: 60% MaxHR

Step 2: Interval 1
- Duration: 20 minutes  
- Target: 75% MaxHR

Step 3: Cool-down
- Duration: 5 minutes
- Target: 55% MaxHR
```

### Cycling Workout
```
Activity Type: Outdoor Bike

Step 1: Warm-up
- Duration: 10 minutes
- Target: 60% FTP

Step 2: Interval 1
- Duration: 20 minutes
- Target: 80% FTP

Step 3: Cool-down
- Duration: 5 minutes
- Target: 55% FTP
```

### Swimming Workout
```
Activity Type: Swimming

Step 1: Easy Swim
- Duration: 200 meters
- Target: RPE 4

Step 2: Interval 1
- Duration: 400 meters
- Target: RPE 7

Step 3: Easy Swim
- Duration: 100 meters
- Target: RPE 3
```

### Interval Training
```
Activity Type: Outdoor Run

Step 1: Warm-up (10min, 60% MaxHR)

Step 2: Repeat 5x
  - Work: 2min, 85% MaxHR
  - Rest: 1min, 60% MaxHR

Step 3: Cool-down (5min, 55% MaxHR)

Total: 28 minutes
```

---

## 🎯 Pro Tips

### Faster Workflow

1. **Pick activity type first** - Smart defaults adapt
2. **Add steps in order** - First step becomes warmup
3. **Trust the defaults** - They're context-aware
4. **Refine later** - Get structure first, details later

### Activity Type Selection

- **Use specific types**: "Treadmill" vs "Outdoor Run" for accurate defaults
- **Bike Trainer**: Gets power-based targets (FTP)
- **Outdoor Bike**: Gets power-based targets (FTP)
- **Running**: Gets heart rate targets (MaxHR)
- **Swimming**: Gets RPE (subjective effort)

### Timeline Usage

- **Quick overview**: Glance at entire workout structure
- **Balance check**: See if warmup/cooldown are appropriate
- **Intensity distribution**: Check color variety
- **Duration visualization**: Spot steps that are too short/long

### Repetition Blocks

- **Use for intervals**: Work/Rest patterns
- **Pre-configured**: 5 repeats of 2min/1min
- **Expandable view**: See internal structure
- **Counts as multiple steps**: Flattened in timeline

---

## 📋 Validation

The app validates your workout before saving:

### Required Fields
- ✅ Activity name (not empty)
- ✅ Activity type (selected)
- ✅ At least one step

### Automatic Checks
- ✅ Step names (1-100 characters)
- ✅ Duration values (positive numbers)
- ✅ Intensity targets (within valid ranges)
- ✅ Repetition counts (1-50)
- ✅ Steps per repetition (1-20)

### Error Messages

If validation fails:
- Red error message appears
- Console shows detailed errors
- Fix issues and try saving again

---

## 🎨 Visual Indicators

### Intensity Colors
- **Cyan (#06b6d4)**: Recovery/Very Easy (< 55%)
- **Green (#16a34a)**: Easy/Endurance (56-74%)
- **Yellow (#ca8a04)**: Moderate/Tempo (75-84%)
- **Orange (#ea580c)**: Hard/Threshold (85-94%)
- **Red (#dc2626)**: Very Hard/VO2max (95%+)

### Haptic Feedback
- **Light tap**: Button press, step selection
- **Medium vibration**: Long-press to drag
- **Success**: Step added/deleted
- **Warning**: Deletion confirmation

---

## ❓ FAQ

### Q: Can I edit a step after creating it?
**A**: Currently, delete and re-add with better defaults. Step editor coming in Phase 5.

### Q: How do I add multiple intensity targets?
**A**: Currently, one target per step. Additional targets coming in Phase 5.

### Q: Can I save templates?
**A**: Not yet. Template library planned for Phase 6.

### Q: What if I make a mistake?
**A**: Tap the X button to delete the step and add a new one.

### Q: How accurate is the duration calculation?
**A**: Very accurate for time-based steps. Distance steps use estimated pace.

### Q: Can I import workouts from files?
**A**: Not yet. Import feature (.fit, .zwo) planned for Phase 6.

### Q: Does it work offline?
**A**: Yes! All creation happens locally. Sync when connected.

---

## 🐛 Troubleshooting

### Issue: Can't save workout
- **Check**: Activity name is filled in
- **Check**: At least one step added
- **Check**: No validation errors in console

### Issue: Timeline not updating
- **Try**: Tap another field to trigger re-render
- **Try**: Add/remove a step to force update

### Issue: Drag not working
- **Check**: Long-press for 300ms
- **Check**: Using touch (not mouse on simulator)
- **Check**: Not in scrolling list

### Issue: Haptic feedback not working
- **Check**: Using physical device (not simulator)
- **Check**: Device settings allow haptics
- **Check**: Not in silent mode (iOS)

---

## 🚀 Coming Soon

### Phase 5: Step Editor (In Development)
- Edit existing steps
- Multiple intensity targets
- Notes field per step
- Advanced duration options

### Phase 6: Polish & Advanced Features
- TSS (Training Stress Score) calculation
- IF (Intensity Factor) calculation
- Workout templates library
- Import from .fit, .zwo files
- Export to various formats

---

## 📞 Support

**Found a bug?** Report it to the development team  
**Feature request?** Add it to the roadmap  
**Questions?** Check the planning docs in the repo

---

## 📚 Related Documentation

- `Plan.md` - Full design specification
- `IMPLEMENTATION_CHECKLIST.md` - Development progress
- `IMPLEMENTATION_SUMMARY.md` - Technical implementation details
- `MOBILE_BUILDER_QUICKSTART.md` - Developer quick start

---

**Version**: 1.0  
**Last Updated**: 2024  
**Status**: Production Ready (Phases 1-4 Complete)