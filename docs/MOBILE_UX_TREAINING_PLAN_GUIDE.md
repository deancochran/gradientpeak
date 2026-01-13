# Mobile UX Guide - Training Plan Creation
## React Native + Shadcn/Nativewind Implementation

**Tech Stack:**
- React Native + Expo
- Shadcn for React Native (react-native-reusables)
- Nativewind for styling (Tailwind CSS classes)
- Lucide React Native for icons

---

## Core Mobile UX Principles

### 1. Thumb-Friendly Interaction
- Primary actions in bottom third of screen
- All touch targets meet platform accessibility standards
- Critical controls within thumb reach zone
- Support swipe gestures for navigation

### 2. Progressive Disclosure
- One question per screen in wizard flow
- Collapsible sections for advanced options
- Show complexity only when needed
- Keep default paths simple

### 3. Visual Hierarchy
- Graph component always visible at top
- Clear step/section indicators
- Sticky footer for actions
- Obvious progress indicators

---

## App Structure

```
Bottom Tab Navigation
├── Home (Active plans + Create button)
├── Discover (Template browsing)
├── Activities (Workout history)
└── Profile (Settings)

Create Plan Entry Points:
1. Home Tab: "+ Create Plan" → Method Selector
2. Discover Tab: "Use Template" → Pre-configured Review
```

---

## Method Selection Screen

**Components:** Card, Badge, Button
**Icons:** Target, Wrench (from lucide-react-native)

```typescript
import { View } from 'react-native';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Target, Wrench, Info } from 'lucide-react-native';

<View className="flex-1 p-4">
  {/* Header */}
  <View className="mb-6">
    <Text className="text-2xl font-bold">Create Your Training Plan</Text>
    <Text className="text-muted-foreground">Choose how you'd like to begin</Text>
  </View>
  
  {/* Method Cards */}
  <View className="gap-4">
    {/* Guided Setup */}
    <Card>
      <CardHeader>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Target />
            <CardTitle>Guided Setup</CardTitle>
          </View>
          <Badge>Recommended</Badge>
        </View>
        <CardDescription>Answer 5 quick questions</CardDescription>
      </CardHeader>
      <CardContent>
        <Text>We'll build your plan based on your goals and availability</Text>
        <View className="mt-3 gap-1">
          <Text>✓ Auto-generated blocks</Text>
          <Text>✓ Smart TSS targets</Text>
          <Text>✓ Edit after creation</Text>
        </View>
        <Text className="mt-2">2-3 minutes</Text>
      </CardContent>
    </Card>
    
    {/* Custom Build */}
    <Card>
      <CardHeader>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Wrench />
            <CardTitle>Build Custom</CardTitle>
          </View>
          <Badge variant="secondary">Advanced</Badge>
        </View>
        <CardDescription>Full control from scratch</CardDescription>
      </CardHeader>
      <CardContent>
        <Text>Define every block, TSS target, and constraint yourself</Text>
        <View className="mt-3 gap-1">
          <Text>✓ Manual block creation</Text>
          <Text>✓ Precise TSS ranges</Text>
          <Text>✓ Activity-specific rules</Text>
        </View>
        <Text className="mt-2">10+ minutes</Text>
      </CardContent>
    </Card>
  </View>
  
  {/* Templates Callout */}
  <View className="mt-6 flex-row items-start gap-2">
    <Info />
    <Text>
      Looking for proven plans? Browse templates in the{' '}
      <Button variant="link" onPress={navigateToDiscover}>
        Discover
      </Button>{' '}
      tab
    </Text>
  </View>
</View>
```

---

## Discover Tab - Template Browser

**Components:** ScrollView, Card, Input, Badge, Button
**Icons:** Search, ChevronRight, Calendar, Users, Star (from lucide-react-native)

```typescript
import { ScrollView, View, Text } from 'react-native';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Search, ChevronRight, Calendar, Users, Star } from 'lucide-react-native';

<ScrollView className="flex-1">
  {/* Header */}
  <View className="p-4">
    <Text className="text-2xl font-bold">Discover Training Plans</Text>
    <Text className="text-muted-foreground">Proven templates from coaches and athletes</Text>
  </View>
  
  {/* Search */}
  <View className="px-4 mb-4">
    <View className="relative">
      <Search className="absolute left-3 top-3" />
      <Input 
        placeholder="Search templates..."
        className="pl-10"
      />
    </View>
  </View>
  
  {/* Filter Chips */}
  <ScrollView horizontal className="px-4 mb-4">
    <View className="flex-row gap-2">
      <Badge>All</Badge>
      <Badge variant="outline">Running</Badge>
      <Badge variant="outline">Cycling</Badge>
      <Badge variant="outline">Triathlon</Badge>
      <Badge variant="outline">Beginner</Badge>
      <Badge variant="outline">Intermediate</Badge>
      <Badge variant="outline">Advanced</Badge>
    </View>
  </ScrollView>
  
  {/* Template List */}
  <View className="px-4 gap-4">
    {templates.map(template => (
      <Card key={template.id} onPress={() => viewTemplate(template)}>
        <CardHeader>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View>{/* Sport icon based on template.sport */}</View>
              <View className="flex-1">
                <Text className="font-semibold">{template.name}</Text>
                <Text className="text-sm text-muted-foreground">
                  {template.durationWeeks.recommended} weeks · {template.experienceLevel.join(", ")}
                </Text>
              </View>
            </View>
            <ChevronRight />
          </View>
        </CardHeader>
        <CardContent>
          <Text numberOfLines={2}>{template.description}</Text>
          
          {/* Phase breakdown visualization */}
          <View className="flex-row mt-3 h-2 gap-1">
            {template.phases.map(phase => (
              <View 
                key={phase.name}
                style={{ flex: phase.weeksPercentage }}
                className="rounded"
              />
            ))}
          </View>
          
          {/* Stats */}
          <View className="flex-row mt-3 gap-4">
            <View className="flex-row items-center gap-1">
              <Users size={16} />
              <Text className="text-sm">{template.usageCount}K</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Star size={16} />
              <Text className="text-sm">{template.rating}</Text>
            </View>
          </View>
        </CardContent>
      </Card>
    ))}
  </View>
</ScrollView>
```

### Template Detail & Customization

When user taps "Use Template", show bottom sheet with minimal inputs:

```typescript
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

<BottomSheet>
  <View className="p-4">
    <Text className="text-xl font-bold mb-4">Customize {template.name}</Text>
    
    {/* Event Name */}
    <View className="mb-4">
      <Text className="font-medium mb-1">Event Name</Text>
      <Input placeholder="e.g., Boston Marathon" />
    </View>
    
    {/* Event Date */}
    <View className="mb-4">
      <Text className="font-medium mb-1">Event Date</Text>
      <DatePicker />
    </View>
    
    {/* Current Fitness */}
    <View className="mb-4">
      <Text className="font-medium mb-1">Current Fitness</Text>
      <Tabs defaultValue="hours">
        <TabsList>
          <TabsTrigger value="ctl">CTL</TabsTrigger>
          <TabsTrigger value="hours">Weekly Hours</TabsTrigger>
        </TabsList>
        <TabsContent value="hours">
          <Slider 
            min={0} 
            max={20} 
            step={0.5}
            value={weeklyHours}
          />
        </TabsContent>
      </Tabs>
    </View>
    
    <Button onPress={generatePlanFromTemplate}>
      Generate Plan
    </Button>
  </View>
</BottomSheet>
```

---

## Path 1: Wizard Flow

**Navigation:** Stack navigator with 6 steps
**Pattern:** Swipe left/right between steps, back button available

### Wizard Step Structure

```typescript
// Base wizard step component
<View className="flex-1">
  {/* Progress Indicator */}
  <View className="px-4 py-2">
    <Text className="text-sm text-muted-foreground">Step {currentStep} of {totalSteps}</Text>
    <View className="flex-row mt-1 gap-1">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View 
          key={i} 
          className={cn(
            "flex-1 h-1 rounded",
            i <= currentStep ? "bg-primary" : "bg-muted"
          )}
        />
      ))}
    </View>
  </View>
  
  {/* Minimized Graph Preview */}
  <View className="px-4 py-2">
    <GraphPreview height={120} minimized />
  </View>
  
  {/* Question Content */}
  <ScrollView className="flex-1 px-4">
    {/* Step-specific content */}
  </ScrollView>
  
  {/* Sticky Footer Actions */}
  <View className="p-4 border-t">
    <View className="flex-row gap-2">
      <Button variant="outline" onPress={handleBack}>
        Back
      </Button>
      <Button className="flex-1" onPress={handleNext}>
        Next
      </Button>
    </View>
  </View>
</View>
```

### Step 1: What are you training for?

**Components:** Input, ScrollView (horizontal chips), DatePicker
**Icons:** Target, Calendar

```typescript
<View className="gap-4">
  <Text className="text-xl font-bold">What are you training for?</Text>
  
  {/* Search input with suggestions */}
  <Input 
    placeholder="Marathon, triathlon, or just fitness?"
    onChangeText={handleSearch}
  />
  
  {/* Quick selection chips */}
  <ScrollView horizontal className="gap-2">
    <Badge onPress={() => selectGoalType('marathon')}>Marathon</Badge>
    <Badge onPress={() => selectGoalType('half_marathon')}>Half Marathon</Badge>
    <Badge onPress={() => selectGoalType('5k')}>5K</Badge>
    <Badge onPress={() => selectGoalType('triathlon')}>Triathlon</Badge>
    <Badge onPress={() => selectGoalType('cycling')}>Century Ride</Badge>
    <Badge onPress={() => selectGoalType('fitness')}>Just getting fit</Badge>
  </ScrollView>
  
  {/* Goal details - shown after selection */}
  {selectedGoal && (
    <View className="gap-4">
      <View>
        <Text className="font-medium mb-1">Event Name</Text>
        <Input value={eventName} placeholder="e.g., Boston Marathon" />
      </View>
      
      <View>
        <Text className="font-medium mb-1">Event Date</Text>
        <DatePicker value={eventDate} />
      </View>
    </View>
  )}
</View>
```

### Step 2: Current Fitness

**Components:** Tabs, Slider, Input
**Pattern:** Toggle between CTL / Weekly Hours / Weekly TSS

```typescript
<View className="gap-4">
  <View>
    <Text className="text-xl font-bold">What's your current fitness?</Text>
    <Text className="text-muted-foreground">Choose the easiest way to describe it</Text>
  </View>
  
  <Tabs defaultValue="hours">
    <TabsList>
      <TabsTrigger value="ctl">CTL</TabsTrigger>
      <TabsTrigger value="hours">Weekly Hours</TabsTrigger>
      <TabsTrigger value="tss">Weekly TSS</TabsTrigger>
    </TabsList>
    
    <TabsContent value="hours" className="mt-4">
      <View className="gap-2">
        <Text className="text-lg font-semibold text-center">
          {weeklyHours} hours per week
        </Text>
        <Slider 
          min={0} 
          max={20} 
          step={0.5}
          value={weeklyHours}
          onValueChange={setWeeklyHours}
        />
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted-foreground">0</Text>
          <Text className="text-sm text-muted-foreground">5</Text>
          <Text className="text-sm text-muted-foreground">10</Text>
          <Text className="text-sm text-muted-foreground">15</Text>
          <Text className="text-sm text-muted-foreground">20+</Text>
        </View>
        <Text className="text-sm text-muted-foreground mt-2">
          Estimated CTL: {estimateCTL(weeklyHours)}
        </Text>
      </View>
    </TabsContent>
    
    <TabsContent value="ctl" className="mt-4">
      <View className="gap-2">
        <Input 
          keyboardType="numeric"
          placeholder="Enter your CTL"
        />
        <View className="bg-muted p-3 rounded">
          <Text className="text-sm">
            Don't know your CTL? Switch to "Weekly Hours" - it's easier!
          </Text>
        </View>
      </View>
    </TabsContent>
  </Tabs>
</View>
```

### Step 3: Sport Mix

**Components:** Slider (per activity), Button (add activity), Badge (presets)
**Pattern:** Sliders that sum to 100%

```typescript
<View className="gap-4">
  <Text className="text-xl font-bold">What activities will you do?</Text>
  
  {/* Activity list with sliders */}
  <View className="gap-4">
    {activities.map(activity => (
      <View key={activity.id} className="gap-2">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            {activity.icon}
            <Text className="font-medium">{activity.name}</Text>
          </View>
          <Text className="font-semibold">{percentages[activity.id]}%</Text>
        </View>
        <Slider 
          min={0} 
          max={100}
          value={percentages[activity.id]}
          onValueChange={(val) => updatePercentage(activity.id, val)}
        />
      </View>
    ))}
  </View>
  
  <Button variant="outline" onPress={addActivity}>
    + Add Activity
  </Button>
  
  {/* Total indicator */}
  <View className="p-3 rounded bg-muted">
    <Text className="text-center">
      Total: {total}%
      {total !== 100 && <Text className="text-destructive"> (Must equal 100%)</Text>}
    </Text>
  </View>
  
  {/* Quick presets */}
  <View>
    <Text className="text-sm font-medium mb-2">Quick presets:</Text>
    <View className="flex-row flex-wrap gap-2">
      <Badge variant="outline" onPress={() => applyPreset('running_only')}>
        Running only
      </Badge>
      <Badge variant="outline" onPress={() => applyPreset('run_focused')}>
        Run-focused
      </Badge>
      <Badge variant="outline" onPress={() => applyPreset('triathlon')}>
        Triathlon
      </Badge>
    </View>
  </View>
</View>
```

### Step 4: Your Availability

**Components:** Input, Collapsible, Badge (day selector), Stepper
**Pattern:** Simple by default, advanced collapsible

```typescript
<View className="gap-4">
  <Text className="text-xl font-bold">When can you train?</Text>
  
  {/* Simple inputs */}
  <View className="gap-4">
    <View>
      <Text className="font-medium mb-1">Hours per week</Text>
      <Input 
        keyboardType="numeric"
        value={maxHours}
        placeholder="0"
      />
    </View>
    
    <View>
      <Text className="font-medium mb-1">Sessions per week</Text>
      <Input 
        keyboardType="numeric"
        value={maxSessions}
        placeholder="0"
      />
    </View>
  </View>
  
  {/* Advanced options - collapsible */}
  <Collapsible>
    <CollapsibleTrigger className="flex-row items-center gap-2">
      <ChevronRight className={cn(isOpen && "rotate-90")} />
      <Text className="font-medium">More Options</Text>
    </CollapsibleTrigger>
    
    <CollapsibleContent className="mt-4 gap-4">
      <View>
        <Text className="font-medium mb-2">Available Days</Text>
        <View className="flex-row flex-wrap gap-2">
          {DAYS.map(day => (
            <Badge
              key={day}
              variant={selectedDays.includes(day) ? "default" : "outline"}
              onPress={() => toggleDay(day)}
            >
              {day.slice(0, 3)}
            </Badge>
          ))}
        </View>
      </View>
      
      <View>
        <Text className="font-medium mb-2">Minimum rest days per week</Text>
        <View className="flex-row items-center gap-2">
          <Button size="icon" onPress={() => setMinRestDays(Math.max(0, minRestDays - 1))}>
            <Minus />
          </Button>
          <Text className="flex-1 text-center font-semibold">{minRestDays}</Text>
          <Button size="icon" onPress={() => setMinRestDays(Math.min(3, minRestDays + 1))}>
            <Plus />
          </Button>
        </View>
      </View>
    </CollapsibleContent>
  </Collapsible>
  
  {/* Lifestyle presets */}
  <View>
    <Text className="text-sm font-medium mb-2">Or choose a preset:</Text>
    <View className="flex-row flex-wrap gap-2">
      <Badge variant="outline" onPress={() => applyPreset('casual')}>
        Casual (4-5 hrs/wk)
      </Badge>
      <Badge variant="outline" onPress={() => applyPreset('weekend_warrior')}>
        Weekend Warrior
      </Badge>
      <Badge variant="outline" onPress={() => applyPreset('serious')}>
        Serious (12+ hrs/wk)
      </Badge>
    </View>
  </View>
</View>
```

### Step 5: Experience Level

**Components:** Card (selectable cards)
**Icons:** Sprout, Activity, Trophy (from lucide-react-native)

```typescript
import { Sprout, Activity, Trophy } from 'lucide-react-native';

<View className="gap-4">
  <View>
    <Text className="text-xl font-bold">What's your experience level?</Text>
    <Text className="text-muted-foreground">This helps us set appropriate progression</Text>
  </View>
  
  {/* Experience cards */}
  <View className="gap-3">
    <Card 
      className={cn(level === 'beginner' && "border-primary")}
      onPress={() => setLevel('beginner')}
    >
      <CardContent className="pt-4">
        <View className="flex-row items-start gap-3">
          <Sprout />
          <View className="flex-1">
            <Text className="font-bold">Beginner</Text>
            <Text className="text-sm text-muted-foreground mb-2">
              New to structured training or this sport
            </Text>
            <View className="gap-1">
              <Text className="text-xs">• Conservative progression</Text>
              <Text className="text-xs">• Focus on consistency</Text>
              <Text className="text-xs">• 5% weekly increase</Text>
            </View>
          </View>
        </View>
      </CardContent>
    </Card>
    
    <Card 
      className={cn(level === 'intermediate' && "border-primary")}
      onPress={() => setLevel('intermediate')}
    >
      <CardContent className="pt-4">
        <View className="flex-row items-start gap-3">
          <Activity />
          <View className="flex-1">
            <Text className="font-bold">Intermediate</Text>
            <Text className="text-sm text-muted-foreground mb-2">
              Regular training, some event experience
            </Text>
            <View className="gap-1">
              <Text className="text-xs">• Moderate progression</Text>
              <Text className="text-xs">• Varied intensity</Text>
              <Text className="text-xs">• 7% weekly increase</Text>
            </View>
          </View>
        </View>
      </CardContent>
    </Card>
    
    <Card 
      className={cn(level === 'advanced' && "border-primary")}
      onPress={() => setLevel('advanced')}
    >
      <CardContent className="pt-4">
        <View className="flex-row items-start gap-3">
          <Trophy />
          <View className="flex-1">
            <Text className="font-bold">Advanced</Text>
            <Text className="text-sm text-muted-foreground mb-2">
              Years of training, competitive goals
            </Text>
            <View className="gap-1">
              <Text className="text-xs">• Aggressive progression</Text>
              <Text className="text-xs">• High volume tolerance</Text>
              <Text className="text-xs">• 10% weekly increase</Text>
            </View>
          </View>
        </View>
      </CardContent>
    </Card>
  </View>
  
  {/* Optional intensity preset */}
  <Collapsible>
    <CollapsibleTrigger className="flex-row items-center gap-2">
      <ChevronRight className={cn(showAdvanced && "rotate-90")} />
      <Text className="font-medium">Advanced: Intensity Distribution</Text>
    </CollapsibleTrigger>
    
    <CollapsibleContent className="mt-3">
      <View className="flex-row flex-wrap gap-2">
        <Badge 
          variant={intensityPreset === 'polarized' ? 'default' : 'outline'}
          onPress={() => setIntensityPreset('polarized')}
        >
          Polarized (80/10/10)
        </Badge>
        <Badge 
          variant={intensityPreset === 'pyramidal' ? 'default' : 'outline'}
          onPress={() => setIntensityPreset('pyramidal')}
        >
          Pyramidal (70/20/10)
        </Badge>
        <Badge 
          variant={intensityPreset === 'threshold' ? 'default' : 'outline'}
          onPress={() => setIntensityPreset('threshold')}
        >
          Threshold (60/30/10)
        </Badge>
      </View>
    </CollapsibleContent>
  </Collapsible>
</View>
```

### Step 6: Review & Customize

**THE CONVERGENCE POINT** - Both wizard and template users arrive here

**Components:** ScrollView, Card, Button, Badge
**Pattern:** Full graph at top, scrollable summary cards, editable blocks

```typescript
import { LineChart } from '@/components/ui/chart'; // or your chart library
import { Calendar, TrendingUp, Activity, MapPin } from 'lucide-react-native';

<View className="flex-1">
  {/* Source indicator (if from template) */}
  {source === 'template' && (
    <View className="px-4 py-2 bg-muted">
      <View className="flex-row items-center gap-2">
        <Info size={16} />
        <Text className="text-sm">Based on {templateName}</Text>
      </View>
    </View>
  )}
  
  {/* Full Interactive Graph */}
  <View className="px-4 py-4">
    <View className="flex-row items-center justify-between mb-2">
      <Text className="text-lg font-bold">Your Training Plan</Text>
      <Text className="text-muted-foreground">{totalWeeks} weeks</Text>
    </View>
    
    <CTLGraph
      height={250}
      data={ctlData}
      blocks={blocks}
      interactive
    />
    
    <View className="flex-row gap-4 mt-2">
      <View className="flex-row items-center gap-1">
        <View className="w-3 h-3 rounded bg-primary" />
        <Text className="text-xs">Actual</Text>
      </View>
      <View className="flex-row items-center gap-1">
        <View className="w-3 h-3 rounded border-2 border-primary" />
        <Text className="text-xs">Predicted</Text>
      </View>
    </View>
  </View>
  
  {/* Summary Cards - Horizontal Scroll */}
  <ScrollView horizontal className="px-4 mb-4">
    <View className="flex-row gap-3">
      <Card className="w-40">
        <CardContent className="pt-4">
          <Calendar className="mb-2" />
          <Text className="text-sm text-muted-foreground">Goal</Text>
          <Text className="font-bold">{goalName}</Text>
          <Text className="text-xs text-muted-foreground">{formatDate(goalDate)}</Text>
        </CardContent>
      </Card>
      
      <Card className="w-40">
        <CardContent className="pt-4">
          <TrendingUp className="mb-2" />
          <Text className="text-sm text-muted-foreground">Fitness Gain</Text>
          <Text className="font-bold">{startingCTL} → {targetCTL}</Text>
          <Text className="text-xs text-muted-foreground">+{ctlIncrease} CTL</Text>
        </CardContent>
      </Card>
      
      <Card className="w-40">
        <CardContent className="pt-4">
          <Activity className="mb-2" />
          <Text className="text-sm text-muted-foreground">Training Load</Text>
          <Text className="font-bold">{avgWeeklyTSS} TSS/wk</Text>
          <Text className="text-xs text-muted-foreground">{avgSessions} sessions</Text>
        </CardContent>
      </Card>
      
      <Card className="w-40">
        <CardContent className="pt-4">
          <MapPin className="mb-2" />
          <Text className="text-sm text-muted-foreground">Activities</Text>
          <Text className="font-bold">{primaryActivity}</Text>
          <Text className="text-xs text-muted-foreground">{activityMix}</Text>
        </CardContent>
      </Card>
    </View>
  </ScrollView>
  
  {/* Blocks Preview */}
  <ScrollView className="flex-1 px-4">
    <View className="flex-row items-center justify-between mb-3">
      <Text className="font-bold">Training Blocks</Text>
      <Button variant="ghost" size="sm" onPress={editBlocks}>
        Edit
      </Button>
    </View>
    
    <View className="gap-3">
      {blocks.map(block => (
        <Card key={block.id} onPress={() => editBlock(block)}>
          <CardContent className="pt-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="font-semibold">{block.name}</Text>
              <Text className="text-sm text-muted-foreground">
                {getWeeks(block)} weeks
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Badge variant="secondary">{block.phase}</Badge>
              <Text className="text-sm text-muted-foreground">
                {block.target_weekly_tss_range.min}-{block.target_weekly_tss_range.max} TSS/wk
              </Text>
            </View>
          </CardContent>
        </Card>
      ))}
    </View>
  </ScrollView>
  
  {/* Sticky Footer */}
  <View className="p-4 border-t">
    <View className="flex-row gap-2">
      <Button variant="outline" onPress={goBack}>
        Adjust
      </Button>
      <Button className="flex-1" onPress={createPlan}>
        Create Plan
      </Button>
    </View>
  </View>
</View>
```

---

## Path 2: Custom Plan Builder

**Pattern:** Start simple, progressively add complexity
**Components:** Card, Button, Modal, Collapsible

```typescript
<View className="flex-1">
  {/* Quick Setup Section */}
  <View className="p-4 border-b">
    <Text className="text-lg font-bold mb-1">Quick Setup</Text>
    <Text className="text-muted-foreground text-sm">
      Fill in the basics, then customize individual blocks
    </Text>
  </View>
  
  {/* Quick wizard (3 steps) */}
  <QuickSetupWizard />
  
  {/* Blocks Section */}
  <ScrollView className="flex-1">
    <View className="p-4">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-lg font-bold">Training Blocks</Text>
        <Button size="sm" onPress={addBlock}>
          <Plus size={16} />
        </Button>
      </View>
      
      <View className="gap-3">
        {blocks.map((block, index) => (
          <Card key={block.id}>
            <CardContent className="pt-4">
              <View className="flex-row items-start gap-3">
                <View className="mt-1">
                  <GripVertical /> {/* Drag handle */}
                </View>
                
                <View className="flex-1">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center gap-2">
                      <Text className="font-medium">{index + 1}</Text>
                      <Text className="font-semibold">{block.name}</Text>
                    </View>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onPress={() => editBlock(block)}
                    >
                      <Pencil size={16} />
                    </Button>
                  </View>
                  
                  <View className="gap-1 mb-2">
                    <View className="flex-row items-center gap-2">
                      <Calendar size={14} />
                      <Text className="text-sm text-muted-foreground">
                        {formatDateRange(block.start_date, block.end_date)}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Activity size={14} />
                      <Text className="text-sm text-muted-foreground">
                        {block.target_weekly_tss_range.min}-{block.target_weekly_tss_range.max} TSS
                      </Text>
                    </View>
                  </View>
                  
                  <View className="flex-row gap-2">
                    <Badge>{block.phase}</Badge>
                    {block.goal_ids.length > 0 && (
                      <Badge variant="outline">
                        <Target size={12} /> {block.goal_ids.length} goal(s)
                      </Badge>
                    )}
                  </View>
                </View>
              </View>
            </CardContent>
          </Card>
        ))}
      </View>
    </View>
    
    {/* Goals Section */}
    <View className="p-4 border-t">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-lg font-bold">Goals</Text>
        <Button size="sm" onPress={addGoal}>
          <Plus size={16} />
        </Button>
      </View>
      
      <View className="gap-2">
        {goals.map(goal => (
          <Card key={goal.id} onPress={() => editGoal(goal)}>
            <CardContent className="py-3 flex-row items-center gap-3">
              <View className="w-6 h-6 rounded-full items-center justify-center bg-primary">
                <Text className="text-primary-foreground font-bold text-xs">
                  {goal.priority}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="font-semibold">{goal.name}</Text>
                <Text className="text-xs text-muted-foreground">
                  {formatDate(goal.target_date)}
                </Text>
              </View>
              <ChevronRight size={16} />
            </CardContent>
          </Card>
        ))}
      </View>
    </View>
  </ScrollView>
  
  {/* Footer Actions */}
  <View className="p-4 border-t">
    <View className="flex-row gap-2">
      <Button variant="outline" onPress={previewPlan}>
        Preview
      </Button>
      <Button className="flex-1" onPress={savePlan}>
        Save Plan
      </Button>
    </View>
  </View>
</View>
```

### Block Editor Modal

**Pattern:** Full-screen modal with tabs
**Components:** Tabs, Input, Slider, DatePicker, MultiSelect

```typescript
<Modal>
  <View className="flex-1 bg-background">
    {/* Header */}
    <View className="flex-row items-center justify-between p-4 border-b">
      <Button variant="ghost" onPress={closeModal}>
        Cancel
      </Button>
      <Text className="font-bold">Edit Block</Text>
      <Button variant="ghost" onPress={saveBlock}>
        Done
      </Button>
    </View>
    
    {/* Tabs */}
    <Tabs defaultValue="basics" className="flex-1">
      <View className="border-b">
        <TabsList>
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="volume">Volume</TabsTrigger>
          <TabsTrigger value="intensity">Intensity</TabsTrigger>
        </TabsList>
      </View>
      
      {/* Basics Tab */}
      <TabsContent value="basics" className="flex-1 p-4">
        <ScrollView className="gap-4">
          <View>
            <Text className="font-medium mb-1">Block Name</Text>
            <Input value={block.name} />
          </View>
          
          <View>
            <Text className="font-medium mb-1">Phase</Text>
            <Select value={block.phase} onValueChange={setPhase}>
              <SelectTrigger>
                <SelectValue placeholder="Select phase" />
              </SelectTrigger>
              <SelectContent>
                {PHASES.map(phase => (
                  <SelectItem key={phase} value={phase}>
                    {phase}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </View>
          
          <View>
            <Text className="font-medium mb-1">Date Range</Text>
            <View className="flex-row gap-2">
              <DatePicker value={block.start_date} className="flex-1" />
              <DatePicker value={block.end_date} className="flex-1" />
            </View>
          </View>
          
          <View>
            <Text className="font-medium mb-1">Linked Goals</Text>
            <MultiSelect
              items={goals}
              selected={block.goal_ids}
              onSelectionChange={setGoalIds}
            />
          </View>
        </ScrollView>
      </TabsContent>
      
      {/* Volume Tab */}
      <TabsContent value="volume" className="flex-1 p-4">
        <ScrollView className="gap-4">
          <View>
            <Text className="font-medium mb-2">Weekly TSS Range</Text>
            <View className="gap-2">
              <Text className="text-center font-semibold">
                {tssRange.min} - {tssRange.max} TSS
              </Text>
              <RangeSlider
                min={0}
                max={1000}
                values={[tssRange.min, tssRange.max]}
                onValuesChange={setTSSRange}
              />
            </View>
          </View>
          
          <View>
            <Text className="font-medium mb-2">Sessions Per Week</Text>
            <View className="gap-2">
              <Text className="text-center font-semibold">
                {sessionsRange.min} - {sessionsRange.max} sessions
              </Text>
              <RangeSlider
                min={0}
                max={14}
                values={[sessionsRange.min, sessionsRange.max]}
                onValuesChange={setSessionsRange}
              />
            </View>
          </View>
        </ScrollView>
      </TabsContent>
      
      {/* Intensity Tab */}
      <TabsContent value="intensity" className="flex-1 p-4">
        <ScrollView className="gap-4">
          <View className="gap-3">
            {/* Easy */}
            <View>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="font-medium">Easy</Text>
                <Text className="font-semibold">{Math.round(intensity.easy * 100)}%</Text>
              </View>
              <Slider
                min={0}
                max={100}
                value={intensity.easy * 100}
                onValueChange={(val) => updateIntensity('easy', val / 100)}
              />
            </View>
            
            {/* Moderate */}
            <View>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="font-medium">Moderate</Text>
                <Text className="font-semibold">{Math.round(intensity.moderate * 100)}%</Text>
              </View>
              <Slider
                min={0}
                max={100}
                value={intensity.moderate * 100}
                onValueChange={(val) => updateIntensity('moderate', val / 100)}
              />
            </View>
            
            {/* Hard */}
            <View>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="font-medium">Hard</Text>
                <Text className="font-semibold">{Math.round(intensity.hard * 100)}%</Text>
              </View>
              <Slider
                min={0}
                max={100}
                value={intensity.hard * 100}
                onValueChange={(val) => updateIntensity('hard', val / 100)}
              />
            </View>
          </View>
          
          {/* Presets */}
          <View>
            <Text className="font-medium mb-2">Quick Presets</Text>
            <View className="flex-row flex-wrap gap-2">
              <Button variant="outline" onPress={() => applyPreset('polarized')}>
                Polarized
              </Button>
              <Button variant="outline" onPress={() => applyPreset('pyramidal')}>
                Pyramidal
              </Button>
              <Button variant="outline" onPress={() => applyPreset('threshold')}>
                Threshold
              </Button>
            </View>
          </View>
        </ScrollView>
      </TabsContent>
    </Tabs>
  </View>
</Modal>
```

---

## Graph Component

**Library:** Use Victory Native or similar React Native chart library
**Pattern:** Interactive, responsive, touch-enabled

```typescript
import { VictoryChart, VictoryLine, VictoryArea, VictoryAxis } from 'victory-native';
import { Defs, LinearGradient, Stop } from 'react-native-svg';

<View className="w-full" style={{ height: graphHeight }}>
  <VictoryChart
    width={width}
    height={graphHeight}
    padding={{ top: 20, bottom: 40, left: 50, right: 20 }}
  >
    {/* Y-axis */}
    <VictoryAxis
      dependentAxis
      label="CTL"
    />
    
    {/* X-axis */}
    <VictoryAxis
      tickFormat={(date) => format(date, 'MMM')}
    />
    
    {/* Block regions */}
    {blocks.map(block => (
      <VictoryArea
        key={block.id}
        data={getBlockRegion(block)}
        style={{
          data: { 
            fill: getPhaseColor(block.phase),
            fillOpacity: 0.1,
          }
        }}
      />
    ))}
    
    {/* Actual CTL line */}
    <VictoryLine
      data={actualCTL}
      style={{
        data: { 
          stroke: 'var(--primary)',
          strokeWidth: 2
        }
      }}
    />
    
    {/* Predicted CTL line */}
    <VictoryLine
      data={predictedCTL}
      style={{
        data: { 
          stroke: 'var(--secondary)',
          strokeWidth: 2,
          strokeDasharray: '5,5'
        }
      }}
    />
    
    {/* Goal markers */}
    {goals.map(goal => (
      <VictoryScatter
        key={goal.id}
        data={[{ x: goal.target_date, y: goal.target_ctl }]}
        size={6}
      />
    ))}
  </VictoryChart>
</View>
```

---

## Mobile Navigation Structure

```
Bottom Tab Navigation:
├── Home
│   ├── Active Plan View
│   └── "+ Create Plan" → Method Selector
├── Discover
│   ├── Template Browser
│   └── Template Detail → Quick Customization → Review
├── Activities
└── Profile

Create Plan Flows:

WIZARD PATH (Home → Method Selector → Wizard)
Step 1: Goal
Step 2: Fitness
Step 3: Activities
Step 4: Availability
Step 5: Experience
Step 6: Review ← CONVERGENCE POINT

TEMPLATE PATH (Discover → Template → Customization)
3 inputs → Review ← CONVERGENCE POINT

CUSTOM PATH (Home → Method Selector → Custom Builder)
Manual block creation → Review ← CONVERGENCE POINT
```

---

## Key UX Patterns

### 1. Information Architecture
- **Templates in Discover** - Browsing experience, not creation blocker
- **Two creation paths** - Wizard (guided) or Custom (advanced)
- **One review screen** - All paths converge for final review

### 2. Mobile-First Interactions
- **Swipe between steps** - Natural mobile gesture
- **Sticky footer actions** - Always accessible
- **Bottom sheets** - For supplemental content
- **Full-screen modals** - For complex editing
- **Horizontal scrolling cards** - For summary data
- **Collapsible sections** - Hide complexity

### 3. Component Usage
- Use shadcn components consistently
- Leverage Tailwind classes via Nativewind
- Use Lucide icons throughout
- Follow platform conventions (iOS/Android)

### 4. Accessibility
- All touch targets meet size requirements
- Support for screen readers
- Keyboard navigation where applicable
- Respect system font scaling
- Dark mode support via Tailwind classes

### 5. Performance
- Lazy load template data
- Optimize graph rendering
- Cache form state
- Debounce slider inputs
- Use React Native's performance tools

---

## Recommended Component Structure

```
src/
├── components/
│   ├── ui/ (shadcn components)
│   │   ├── card.tsx
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── badge.tsx
│   │   ├── tabs.tsx
│   │   ├── slider.tsx
│   │   ├── collapsible.tsx
│   │   └── ...
│   ├── plan/
│   │   ├── CTLGraph.tsx
│   │   ├── BlockCard.tsx
│   │   ├── GoalCard.tsx
│   │   └── WizardStep.tsx
│   └── discover/
│       ├── TemplateCard.tsx
│       └── TemplateDetail.tsx
├── screens/
│   ├── create/
│   │   ├── MethodSelector.tsx
│   │   ├── WizardNavigator.tsx
│   │   ├── CustomBuilder.tsx
│   │   └── PlanReview.tsx
│   └── discover/
│       └── DiscoverTab.tsx
└── lib/
    ├── utils.ts (cn helper)
    └── training-plan.ts (schema & helpers)
```

This structure keeps your UI clean, maintainable, and fully themed with your shadcn/Nativewind setup.
