# GradientPeak Mobile App

A cross-platform fitness tracking mobile app built with Expo, React Native, and modern tooling. Features a lightweight, offline-first architecture with robust cloud sync, fault-tolerant activity recording, multi-sensor BLE integration, planned activity guidance, and real-time analytics.

## 🚀 Tech Stack Overview

### Core Framework & Runtime
- **Expo SDK 54** - Development platform with new architecture enabled
- **React Native 0.81.4** - Cross-platform mobile framework with React 19
- **Expo Router v6** - File-based routing with fully typed routes
- **TypeScript 5.9** - Full type safety and enhanced developer experience
- **Bun Runtime** - Fast JavaScript runtime for development and tooling

### State Management & Data Flow
- **Zustand 5.0.8** - Lightweight state management with middleware support
- **TanStack React Query v5** - Server state management with caching, invalidation, and optimistic updates
- **tRPC v11** - End-to-end type-safe API layer with React Query integration
- **Immer 10.1.3** - Immutable state updates with mutable syntax

### Styling & UI Components
- **NativeWind v4** - Tailwind CSS for React Native with dark mode support
- **React Native Reusables** - Shadcn/ui-inspired component library
- **Lucide React Native** - Comprehensive icon library
- **React Native Reanimated v3** - Smooth animations and gestures
- **React Native Skia** - High-performance 2D graphics for charts and visualizations

### Offline-First Architecture
- **Expo SQLite** - Local database for offline data persistence
- **Expo FileSystem** - Fault-tolerant local storage for activity recordings
- **Async Storage** - Persistent storage for auth state and user preferences
- **Drizzle ORM** - Type-safe database queries with SQLite support

### Authentication & Cloud Services
- **Supabase** - PostgreSQL backend with real-time capabilities
- **Supabase Auth** - Secure authentication with email/password and social providers
- **Supabase Storage** - Secure file uploads and downloads
- **tRPC Auth Integration** - Type-safe authentication procedures

### Bluetooth & Sensor Integration
- **React Native BLE PLX v3** - Bluetooth Low Energy device communication
- **Expo Location** - High-precision GPS tracking for outdoor activities
- **Expo TaskManager** - Background task management for continuous recording
- **React Native Worklets** - Performance-critical code execution

## 🔄 Service Instance Management

The mobile app uses a **lifecycle-scoped service architecture** for activity recording, ensuring clean state and reliable performance across recording sessions.

### Architecture Overview

The `ActivityRecorderService` is created **only when the user navigates to the recording screen** and is automatically cleaned up when they navigate away. This ensures:

```typescript
// Service lifecycle is tied to screen navigation
// Navigate to /modals/record → service created
// Navigate away → service cleaned up and deallocated

function RecordModal() {
  const { profile } = useRequireAuth();

  // Service created here, cleaned up on unmount
  const service = useActivityRecorder(profile);

  const state = useRecordingState(service);
  const metrics = useLiveMetrics(service);
  // ... use service
}
```

### Service Lifecycle States

- **`pending`** - Service created, waiting to start recording
- **`ready`** - All permissions and sensors ready, can start recording
- **`recording`** - Active recording in progress
- **`paused`** - Recording paused, can resume or finish
- **`finished`** - Recording complete, final calculations done

### Benefits

✅ **Simplicity** - Service lifecycle follows screen lifecycle
✅ **Reliability** - Guaranteed clean state for each recording session
✅ **Performance** - No global services, better memory management
✅ **Developer Experience** - Automatic cleanup via React hooks, no manual management needed
✅ **Type Safety** - Service is always available within recording screen (profile guaranteed)

### Usage Example

```typescript
// In /modals/record/index.tsx
function RecordModal() {
  const { profile } = useRequireAuth();

  // 1. Service Creation (automatic)
  const service = useActivityRecorder(profile);

  // 2. Subscribe to state
  const state = useRecordingState(service);
  const metrics = useLiveMetrics(service);
  const { sensors, count } = useSensors(service);
  const { plan, progress, activityType } = usePlan(service);

  // 3. Get actions
  const { start, pause, resume, finish } = useRecorderActions(service);

  // 4. Use in UI
  return (
    <View>
      <Text>State: {state}</Text>
      <Text>HR: {metrics.heartrate} bpm</Text>
      <Button onPress={start}>Start</Button>
    </View>
  );
  // Service automatically cleaned up when modal unmounts
}
```

### Development Experience & Tooling

#### Build & Development Tools
- **Turborepo** - High-performance build system for monorepo
- **Expo Dev Client** - Custom development builds with native modules
- **Babel Preset Expo** - Optimized transpilation for React Native
- **Prettier + Tailwind Plugin** - Consistent code formatting

#### Linting & Type Checking
- **ESLint with Expo Config** - Comprehensive code quality rules
- **TypeScript Project References** - Fast incremental type checking
- **Shared ESLint Config** - Consistent linting across monorepo
- **TypeScript Path Mapping** - Clean import paths with aliases

#### Testing Infrastructure
- **Unit Testing** - Component and utility testing setup
- **Integration Testing** - Cross-module integration tests
- **E2E Testing** - Full application testing capabilities
- **Test Coverage** - Comprehensive coverage reporting

### Analytics & Visualization
- **Victory Native** - Responsive charting and data visualization
- **React Native Chart Kit** - Additional charting capabilities
- **Custom Analytics Engine** - Training load and performance metrics

### Navigation & Routing
- **Expo Router** - File-based navigation with deep linking
- **React Navigation** - Tab and stack navigation patterns
- **Type-Safe Routes** - Compile-time route validation


## 🏗️ Architecture Highlights

- **Offline-First Design** - Works seamlessly without internet connection
- **Real-Time Sync** - Automatic data synchronization when online
- **Type Safety** - End-to-end type safety from database to UI
- **Modular Design** - Clean separation of concerns with shared packages
- **Fault Tolerance** - Graceful error handling and recovery

### Activity Recording Architecture

The mobile app features an optimized activity recording system designed for realtime sensor data processing:

#### Core Components
- **ActivityRecorderService** (`src/lib/services/ActivityRecorder/`) - Core service handling sensor management, GPS tracking, and data buffering
- **Consolidated Hooks** (`src/lib/hooks/useActivityRecorder.ts`) - 7 core hooks for service interaction with event-driven reactivity
- **Recording Modals** (`src/app/modals/record/`) - UI components for activity selection, sensor management, and live recording display

#### Performance Optimizations
- **Event-Driven Updates** - Components only re-render when their subscribed events fire
- **Surgical Re-renders** - Optimized for 1-4Hz sensor data updates without UI lag
- **Granular Hooks** - Use specific hooks (`useLiveMetrics`, `useSensors`, `usePlan`) instead of subscribing to everything

#### Key Features
- **Bluetooth Sensor Integration** - Heart rate monitors, power meters, cadence sensors
- **GPS Tracking** - Real-time location and route recording for outdoor activities
- **Interval Training** - Support for structured activity plans and templates
- **Background Recording** - Continues tracking when app is backgrounded
- **Offline Data Storage** - Local SQLite storage with cloud sync when available

#### Usage Example
```typescript
// ✅ Optimal - only re-renders when metrics update
function HeartRateCard({ service }: { service: ActivityRecorderService | null }) {
  const metrics = useLiveMetrics(service);
  return <Text>{metrics.heartrate} bpm</Text>;
}

// ✅ Good - multiple hooks for different concerns
function RecordingDashboard({ service }: { service: ActivityRecorderService | null }) {
  const state = useRecordingState(service);
  const metrics = useLiveMetrics(service);
  const { count: sensorCount } = useSensors(service);
  const { start, pause, finish } = useRecorderActions(service);

  return (
    <View>
      <Text>State: {state}</Text>
      <Text>HR: {metrics.heartrate} bpm</Text>
      <Text>Sensors: {sensorCount}</Text>
      <Button onPress={start}>Start</Button>
    </View>
  );
}

// ✅ Excellent - separation of concerns
function PlanProgressCard({ service }: { service: ActivityRecorderService | null }) {
  const { plan, progress } = usePlan(service);
  const { advanceStep } = useRecorderActions(service);

  if (!plan) return null;

  return (
    <View>
      <Text>{progress?.currentStepIndex}/{progress?.totalSteps}</Text>
      <Button onPress={advanceStep}>Next Step</Button>
    </View>
  );
}
```

## 🛠️ Development Commands

```bash
# Start development server
bun run dev

# Build for production
bun run build

# Run linting
bun run lint

# Run tests
bun run test

# Type checking
bun run check-types

# Format code
bun run format
```

## 📦 Core Packages & Dependencies

### State Management
- `zustand` - Minimal state management with persistence
- `@tanstack/react-query` - Server state with caching
- `immer` - Immutable updates made simple

### UI & Styling
- `nativewind` - Tailwind for React Native
- `@rn-primitives/*` - Accessible component primitives
- `lucide-react-native` - Beautiful icons

### Navigation
- `expo-router` - File-based routing
- `@react-navigation/*` - Navigation components

### Database & Storage
- `expo-sqlite` - Local database
- `expo-file-system` - File storage
- `@react-native-async-storage/async-storage` - Key-value storage

### Utilities
- `date-fns` - Date manipulation
- `lodash` - Utility functions
- `clsx` + `tailwind-merge` - Conditional styling

## 🎨 Style Guide & Component Styling

### React Native Reusables + NativeWind Specifics

#### Key Differences from Web/Shadcn UI
- **No Cascading Styles**: Each element must be styled directly (Text doesn't inherit from parent)
- **No Data Attributes**: Variants use props/state instead of data-* attributes
- **Portal Requirement**: Modals/menus require PortalHost component
- **Programmatic Control**: Some components use refs instead of open/onOpenChange props
- **Icon Wrapper**: Use `<Icon as={LucideIcon} />` pattern for icons

#### Core Principles
- **Utility-First**: Use NativeWind classes for consistent styling
- **Mobile-First**: Design specifically for mobile constraints
- **Dark Mode**: Support both themes using `dark:` prefix with React Navigation integration
- **Direct Styling**: Every element must be explicitly styled

#### Layout & Spacing
```tsx
// Container layouts (no cascading styles - each element styled individually)
<View className="flex-1 p-4 bg-background">
  <Text className="text-foreground">Content</Text> {/* Must style Text directly */}
</View>

<View className="flex-row items-center justify-between p-6">
<View className="flex-col gap-4"> {/* Use gap instead of space-y for better RN support */}

// Platform-specific spacing
<View className="ios:pt-12 android:pt-6">
<View className="px-4 safe-area-top"> {/* Safe area handling */}
```

#### Typography & Text Styling
```tsx
// Text styles - MUST style every Text element individually
<Text className="text-2xl font-bold text-foreground">Title</Text>
<Text className="text-base text-muted-foreground">Description</Text>
<Text className="text-sm font-medium text-destructive">Error message</Text>

// Text alignment (no inheritance - each Text must be styled)
<Text className="text-center text-foreground">Centered</Text>
<Text className="text-right text-foreground">Right aligned</Text>

// Platform-specific text styling
<Text className="text-lg ios:font-semibold android:font-medium">
```

#### Colors & Themes (React Navigation Integrated)
```tsx
// Using React Navigation theme with NativeWind
import { useTheme } from "@/lib/stores/theme-store";
import { NAV_THEME } from "@/lib/theme";

// Background colors from theme.ts
<View className="bg-background">      // Primary background (hsl(var(--background)))
<View className="bg-muted">           // Secondary background (hsl(var(--muted)))
<View className="bg-card">            // Card background (hsl(var(--card)))
<View className="bg-popover">         // Popover background (hsl(var(--popover)))
<View className="bg-destructive">     // Error/destructive (hsl(var(--destructive)))

// Text colors - MUST style each Text element
<Text className="text-foreground">    // Primary text (hsl(var(--foreground)))
<Text className="text-muted-foreground"> // Secondary text (hsl(var(--muted-foreground)))
<Text className="text-primary">       // Brand/accent text (hsl(var(--primary)))
<Text className="text-destructive">   // Error text (hsl(var(--destructive-foreground)))

// Border colors
<View className="border border-border"> // hsl(var(--border))
<View className="border border-input">  // hsl(var(--input))
```

#### Buttons & Interactive Elements (React Native Reusables)
```tsx
import { Button } from "@/components/ui/button";

// Primary button with React Native Reusables
<Button variant="default" size="default">
  <Text className="text-primary-foreground">Primary Button</Text>
</Button>

// Secondary button with direct styling override
<Button variant="secondary" size="sm">
  <Text className="text-secondary-foreground">Secondary</Text>
</Button>

// Custom button with Pressable (when not using Reusables)
<Pressable className="bg-primary px-4 py-2 rounded-lg active:opacity-80">
  <Text className="text-primary-foreground text-center font-medium">Custom Button</Text>
</Pressable>

// Disabled state
<Pressable className="bg-muted px-4 py-2 rounded-lg" disabled>
  <Text className="text-muted-foreground text-center">Disabled</Text>
</Pressable>
```

#### Forms & Inputs (React Native Reusables)
```tsx
import { Input, Label, Textarea } from "@/components/ui/input";

// Text input with React Native Reusables
<Label nativeID="email" className="text-sm font-medium text-foreground">Email</Label>
<Input
  aria-labelledby="email"
  placeholder="Enter your email"
  className="border-input bg-background text-foreground placeholder:text-muted-foreground"
/>

// Input with error state
<Input
  aria-invalid={true}
  className="border-destructive bg-background text-foreground"
/>

// Label + input combination with proper spacing
<View className="gap-2"> {/* Use gap instead of space-y */}
  <Label nativeID="username" className="text-sm font-medium text-foreground">Username</Label>
  <Input aria-labelledby="username" className="border-input" />
</View>

// Textarea component
<Textarea
  placeholder="Enter description"
  className="min-h-[100px] border-input bg-background text-foreground"
/>
```

#### Cards & Containers (React Native Reusables)
```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Basic card with React Native Reusables
<Card className="bg-card border-border">
  <CardHeader>
    <CardTitle className="text-card-foreground">Card Title</CardTitle>
    <CardDescription className="text-muted-foreground">Description</CardDescription>
  </CardHeader>
  <CardContent>
    <Text className="text-card-foreground">Card content</Text>
  </CardContent>
</Card>

// Custom card with direct styling
<View className="bg-card border border-border rounded-xl p-6">
  <Text className="text-xl font-semibold text-card-foreground">Custom Card</Text>
  <Text className="text-muted-foreground mt-2">Content</Text> {/* Must style each Text */}
</View>

// Card with shadow (React Native specific)
<View className="bg-card border border-border rounded-xl p-6 shadow-sm shadow-black/10">
</View>
```

#### React Native Reusables Components with NativeWind

##### Button Components with Styling
```tsx
import { Button } from "@/components/ui/button";

// Primary button with custom styling
<Button variant="default" size="default" className="bg-primary">
  <Text className="text-primary-foreground font-semibold">Primary</Text>
</Button>

// Secondary button with size variants
<Button variant="secondary" size="sm">
  <Text className="text-secondary-foreground">Small</Text>
</Button>

<Button variant="secondary" size="default">
  <Text className="text-secondary-foreground">Default</Text>
</Button>

<Button variant="secondary" size="lg">
  <Text className="text-secondary-foreground">Large</Text>
</Button>

// Destructive button
<Button variant="destructive">
  <Text className="text-destructive-foreground">Delete</Text>
</Button>

// Outline button
<Button variant="outline">
  <Text className="text-foreground">Outline</Text>
</Button>

// Ghost button (minimal styling)
<Button variant="ghost">
  <Text className="text-muted-foreground">Ghost</Text>
</Button>

// Link-style button
<Button variant="link">
  <Text className="text-primary underline">Link</Text>
</Button>
```

##### Form Components with NativeWind Integration
```tsx
import { Input, Label, Textarea } from "@/components/ui/input";

// Label + Input with full styling
<Label
  nativeID="email"
  className="text-sm font-medium text-foreground mb-2"
>
  Email
</Label>
<Input
  aria-labelledby="email"
  placeholder="Enter your email"
  className="border-input bg-background text-foreground placeholder:text-muted-foreground"
/>

// Textarea with custom dimensions
<Textarea
  placeholder="Enter description"
  className="min-h-[100px] border-input bg-background text-foreground"
/>

// Input with error state and accessibility
<Input
  aria-invalid={true}
  aria-errormessage="email-error"
  className="border-destructive bg-background text-foreground"
/>

// Form group with proper spacing
<View className="gap-4">
  <Label nativeID="name" className="text-foreground">Name</Label>
  <Input aria-labelledby="name" className="border-input" />

  <Label nativeID="message" className="text-foreground">Message</Label>
  <Textarea aria-labelledby="message" className="min-h-[120px] border-input" />
</View>
```

##### Card Components with Theme Integration
```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

<Card className="bg-card border-border"> {/* Must set bg and border */}
  <CardHeader className="pb-3"> {/* Custom spacing */}
    <CardTitle className="text-card-foreground text-xl">Card Title</CardTitle>
    <CardDescription className="text-muted-foreground">
      Card description with muted text
    </CardDescription>
  </CardHeader>
  <CardContent>
    <Text className="text-card-foreground">Card content goes here</Text>
  </CardContent>
</Card>

// Card with custom styling override
<Card className="bg-popover border-popover-foreground/20">
  <CardHeader>
    <CardTitle className="text-popover-foreground">Popover Card</CardTitle>
  </CardHeader>
</Card>
```

##### Alert Components with Custom Styling
```tsx
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

<Alert variant="default" className="bg-background border-border">
  <AlertTitle className="text-foreground font-semibold">Information</AlertTitle>
  <AlertDescription className="text-muted-foreground">
    This is an informational alert with custom styling.
  </AlertDescription>
</Alert>

<Alert variant="destructive" className="bg-destructive border-destructive">
  <AlertTitle className="text-destructive-foreground font-semibold">Error</AlertTitle>
  <AlertDescription className="text-destructive-foreground/90">
    Something went wrong. Please try again.
  </AlertDescription>
</Alert>

// Alert with icon (using React Native Reusables pattern)
<Alert variant="default">
  <Alert.Icon as={InfoIcon} className="text-primary" />
  <AlertTitle className="text-foreground">With Icon</AlertTitle>
  <AlertDescription className="text-muted-foreground">
    Alert with custom icon using the `as` prop pattern.
  </AlertDescription>
</Alert>
```

#### Dark Mode Support with React Navigation
```tsx
// Using React Navigation theme integration
import { useTheme } from "@/lib/stores/theme-store";
import { NAV_THEME } from "@/lib/theme";

// Automatic dark mode with NativeWind
<View className="bg-background dark:bg-background-dark">
<Text className="text-foreground dark:text-foreground-dark">

// Component-specific dark mode using theme colors
<View className="bg-card dark:bg-card-dark border-border dark:border-border-dark">

// Using theme store for programmatic control
import { useTheme } from "@/lib/stores/theme-store";

const { theme, setTheme } = useTheme();
<View className={theme === 'dark' ? "bg-gray-900" : "bg-white"}>

// React Navigation theme provider integration
import { ThemeProvider } from "@react-navigation/native";

// In your root layout:
<ThemeProvider value={NAV_THEME[isDark ? 'dark' : 'light']}>
  {/* App content */}
</ThemeProvider>
```

#### Responsive Design & Platform Specificity
```tsx
// Breakpoint-based responsive design (limited in React Native)
<View className="flex-col min-w-md:flex-row"> {/* Custom breakpoints in tailwind.config */}
<Text className="text-base min-w-lg:text-lg">

// Platform-specific styling (essential for React Native)
<View className="ios:pt-12 android:pt-6">
<View className="ios:rounded-lg android:rounded-md">
<Text className="ios:font-semibold android:font-medium">

// Safe area handling
<View className="pt-safe-top pb-safe-bottom">
<View className="px-safe-left pr-safe-right">

// Device orientation specific
<View className="portrait:flex-col landscape:flex-row">
```

#### Animation & Transitions with Reanimated
```tsx
// Using react-native-reanimated for smooth animations
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming
} from 'react-native-reanimated';

// NativeWind animation classes (limited support)
<Animated.View className="bg-primary opacity-0 animate-fade-in">
<View className="animate-pulse bg-muted"> {/* Loading skeleton */}

// Custom animations with Reanimated
const animatedStyle = useAnimatedStyle(() => ({
  opacity: withTiming(isVisible ? 1 : 0, { duration: 300 }),
  transform: [{ scale: withSpring(isVisible ? 1 : 0.95) }]
}));

<Animated.View style={animatedStyle} className="bg-card p-4 rounded-lg">
  <Text className="text-foreground">Animated content</Text>
</Animated.View>

// Gesture handling with Reanimated
<PanGestureHandler onGestureEvent={gestureHandler}>
  <Animated.View style={animatedStyle} className="bg-primary rounded-full p-4">
    <Text className="text-primary-foreground">Draggable</Text>
  </Animated.View>
</PanGestureHandler>
```

#### React Native Reusables Best Practices

1. **No Cascading Styles**: Every Text element must be styled individually
2. **PortalHost Requirement**: Always include `<PortalHost />` in root layout for modals
3. **Icon Wrapper Pattern**: Use `<Icon as={LucideIcon} />` for all icons
4. **Ref-based Control**: Use refs instead of props for programmatic control of menus/dialogs
5. **Direct Styling**: Apply NativeWind classes to each element, no inheritance

#### Accessibility & Performance
1. **ARIA Labels**: Use `nativeID` and `aria-labelledby` for screen readers
2. **Contrast Ratios**: Ensure text meets WCAG contrast requirements
3. **Flat Structures**: Avoid deeply nested views for better performance
4. **Memoization**: Use `React.memo` for frequently re-rendering components
5. **Image Optimization**: Use `expo-image` with proper caching strategies

#### Maintenance & Consistency
1. **Semantic Colors**: Use theme-based color names (`primary`, `secondary`, `muted`)
2. **Spacing Scale**: Stick to 4pt increments (4, 8, 12, 16, 20, 24, etc.)
3. **Typography Scale**: Consistent text sizes across the app
4. **Component Library**: Use React Native Reusables components when available
5. **Customization**: Extend rather than override component styles

#### Customization & Theme Extension

##### Extending NativeWind Theme (tailwind.config.js)
```js
theme: {
  extend: {
    colors: {
      border: "hsl(var(--border))",
      input: "hsl(var(--input))",
      ring: "hsl(var(--ring))",
      background: "hsl(var(--background))",
      foreground: "hsl(var(--foreground))",
      primary: {
        DEFAULT: "hsl(var(--primary))",
        foreground: "hsl(var(--primary-foreground))",
      },
      // Custom colors that match React Navigation theme
      chart: {
        1: "hsl(var(--chart-1))",
        2: "hsl(var(--chart-2))",
        3: "hsl(var(--chart-3))",
        4: "hsl(var(--chart-4))",
        5: "hsl(var(--chart-5))",
      }
    },
    // Custom breakpoints for responsive design
    screens: {
      'min-w-md': { 'raw': '(min-width: 768px)' },
      'min-w-lg': { 'raw': '(min-width: 1024px)' },
    }
  }
}
```

##### Custom Component Variants
```tsx
// Creating custom button variants
<Button variant="fitness" size="lg">
  <Text className="text-white font-bold">Start Activity</Text>
</Button>

// Custom variant implementation in button component
const variantStyles = {
  fitness: "bg-fitness-primary border-fitness-border",
  // ... other variants
}
```

##### Platform-Specific Utilities
```js
// In tailwind.config.js
theme: {
  extend: {
    // iOS specific utilities
    ios: {
      fontSize: {
        'dynamic': '17px', // Dynamic Type support
      }
    },
    // Android specific utilities
    android: {
      elevation: {
        '1': '1',
        '2': '2',
        '3': '3',
      }
    }
  }
}
```

This style guide addresses React Native's unique constraints and ensures consistent, accessible, and high-performance styling across the GradientPeak mobile application using React Native Reusables and NativeWind.

# React Native Reusables — Style Guide

## 🎨 Design Tokens & Conventions

### Color System
The app uses a semantic color system with CSS variables mapped to Tailwind classes:

```css
/* Light theme */
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --primary: 0 0% 9%;
  --primary-foreground: 0 0% 98%;
  /* ... more variables */
}

/* Dark theme */
.dark:root {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 0 0% 9%;
  /* ... more variables */
}
```

### Typography Scale
- **h1**: text-4xl font-extrabold
- **h2**: text-3xl font-semibold with border
- **h3**: text-2xl font-semibold
- **h4**: text-xl font-semibold
- **body**: text-base (default)
- **small**: text-sm font-medium
- **muted**: text-sm text-muted-foreground

### Spacing & Layout
- **Base unit**: 4px increments (4, 8, 12, 16, 20, 24, etc.)
- **Containers**: Use flexbox with gap for spacing
- **Responsive**: Platform-specific utilities (`ios:`, `android:`)

## 📦 Component Overview

| Component | Description | Variants | asChild |
|-----------|-------------|----------|---------|
| `Accordion` | Expandable content sections | - | ✅ |
| `Alert` | Notification messages | default, destructive | ❌ |
| `AlertDialog` | Modal alert dialogs | - | ❌ |
| `AspectRatio` | Maintain aspect ratio | - | ❌ |
| `Avatar` | User profile images | - | ❌ |
| `Badge` | Small status indicators | default, secondary, destructive, outline | ✅ |
| `Button` | Interactive button element | default, destructive, outline, secondary, ghost, link | ❌ |
| `Card` | Container component | - | ❌ |
| `Checkbox` | Toggle selection | - | ❌ |
| `Collapsible` | Expandable content | - | ✅ |
| `ContextMenu` | Right-click/context menu | - | ❌ |
| `Dialog` | Modal dialogs | - | ❌ |
| `DropdownMenu` | Dropdown selection | - | ❌ |
| `HoverCard` | Information on hover | - | ❌ |
| `Icon` | Lucide icon wrapper | - | ❌ |
| `Input` | Text input field | - | ❌ |
| `Label` | Form field label | - | ❌ |
| `Menubar` | Application menu bar | - | ❌ |
| `Popover` | Popover containers | - | ❌ |
| `Progress` | Progress indicators | - | ❌ |
| `RadioGroup` | Radio button group | - | ❌ |
| `Select` | Dropdown selection | - | ❌ |
| `Separator` | Visual separators | - | ❌ |
| `Skeleton` | Loading placeholders | - | ❌ |
| `Switch` | Toggle switches | - | ❌ |
| `Tabs` | Tabbed navigation | - | ❌ |
| `Text` | Typography component | h1, h2, h3, h4, p, blockquote, code, lead, large, small, muted | ✅ |
| `Textarea` | Multi-line text input | - | ❌ |
| `Toggle` | Toggle buttons | - | ❌ |
| `ToggleGroup` | Toggle button group | - | ❌ |
| `Tooltip` | Information tooltips | - | ❌ |

## 🎯 Component Usage Examples

### Button Component
```tsx
import { Button } from "@/components/ui/button";

// Primary button
<Button variant="default" size="default">
  <Text>Primary</Text>
</Button>

// Secondary button
<Button variant="secondary" size="sm">
  <Text>Secondary</Text>
</Button>

// Destructive button
<Button variant="destructive">
  <Text>Delete</Text>
</Button>

// Outline button
<Button variant="outline">
  <Text>Outline</Text>
</Button>

// Ghost button
<Button variant="ghost">
  <Text>Ghost</Text>
</Button>

// Link-style button
<Button variant="link">
  <Text>Link</Text>
</Button>

// Icon button
<Button size="icon">
  <Text>+</Text>
</Button>
```

### Accordion Component
```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

<Accordion type="single" collapsible>
  <AccordionItem value="item-1">
    <AccordionTrigger>
      <Text>Section 1</Text>
    </AccordionTrigger>
    <AccordionContent>
      <Text>Content for section 1</Text>
    </AccordionContent>
  </AccordionItem>
  <AccordionItem value="item-2">
    <AccordionTrigger>
      <Text>Section 2</Text>
    </AccordionTrigger>
    <AccordionContent>
      <Text>Content for section 2</Text>
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

### Alert Component
```tsx
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, AlertCircle } from "lucide-react-native";

// Default alert
<Alert icon={Info}>
  <AlertTitle>Information</AlertTitle>
  <AlertDescription>This is an informational alert.</AlertDescription>
</Alert>

// Destructive alert
<Alert icon={AlertCircle} variant="destructive">
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Something went wrong.</AlertDescription>
</Alert>
```

### Badge Component
```tsx
import { Badge } from "@/components/ui/badge";

// Default badge
<Badge variant="default">New</Badge>

// Secondary badge
<Badge variant="secondary">Draft</Badge>

// Destructive badge
<Badge variant="destructive">Error</Badge>

// Outline badge
<Badge variant="outline">Beta</Badge>

// Badge with icon
<Badge>
  <Icon as={Star} className="size-3" />
  <Badge.Text>Featured</Badge.Text>
</Badge>
```

### Avatar Component
```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Avatar with image
<Avatar>
  <AvatarImage source={{ uri: "https://example.com/avatar.jpg" }} />
  <AvatarFallback>JD</AvatarFallback>
</Avatar>

// Fallback only
<Avatar>
  <AvatarFallback>US</AvatarFallback>
</Avatar>
```

### Icon Component
```tsx
import { Icon } from "@/components/ui/icon";
import { Star, Heart, User } from "lucide-react-native";

// Basic icon
<Icon as={Star} className="text-primary size-6" />

// Icon with different styles
<Icon as={Heart} className="text-destructive size-4" />
<Icon as={User} className="text-muted-foreground size-8" />
```

### Progress Component
```tsx
import { Progress } from "@/components/ui/progress";

// Progress bar
<Progress value={75} className="w-full" />

// Custom styled progress
<Progress value={50} className="h-2 bg-muted" />
```

### Switch Component
```tsx
import { Switch } from "@/components/ui/switch";

// Basic switch
<Switch checked={isEnabled} onCheckedChange={setIsEnabled} />

// Disabled switch
<Switch checked={true} disabled />
```

### Tabs Component
```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

<Tabs defaultValue="account">
  <TabsList>
    <TabsTrigger value="account">Account</TabsTrigger>
    <TabsTrigger value="settings">Settings</TabsTrigger>
  </TabsList>
  <TabsContent value="account">
    <Text>Account content</Text>
  </TabsContent>
  <TabsContent value="settings">
    <Text>Settings content</Text>
  </TabsContent>
</Tabs>
```

### Dialog Component
```tsx
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

<Dialog>
  <DialogTrigger>
    <Button variant="outline">Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>Dialog description text.</DialogDescription>
    </DialogHeader>
    <Text>Dialog content goes here</Text>
  </DialogContent>
</Dialog>
```

### Tooltip Component
```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

<Tooltip>
  <TooltipTrigger>
    <Button variant="outline">Hover me</Button>
  </TooltipTrigger>
  <TooltipContent>
    <Text>This is a tooltip</Text>
  </TooltipContent>
</Tooltip>
```

### Text Component
```tsx
import { Text } from "@/components/ui/text";

// Headings
<Text variant="h1">Heading 1</Text>
<Text variant="h2">Heading 2</Text>
<Text variant="h3">Heading 3</Text>
<Text variant="h4">Heading 4</Text>

// Body text
<Text variant="p">Paragraph text</Text>
<Text variant="blockquote">Blockquote text</Text>
<Text variant="code">Code snippet</Text>

// Utility text
<Text variant="muted">Muted secondary text</Text>
<Text variant="small">Small text</Text>
<Text variant="large">Large text</Text>

// Using asChild for composition
<Text asChild variant="h1">
  <CustomElement>Composed heading</CustomElement>
</Text>
```

### Input Component
```tsx
import { Input } from "@/components/ui/input";

// Basic input
<Input placeholder="Enter text" />

// With custom styling
<Input
  placeholder="Search..."
  className="border-2"
/>

// Disabled state
<Input
  placeholder="Disabled"
  editable={false}
/>

// Email input with label
<Label nativeID="email">Email</Label>
<Input
  placeholder="email@example.com"
  aria-labelledby="email"
  keyboardType="email-address"
/>
```

### Textarea Component
```tsx
import { Textarea } from "@/components/ui/textarea";

// Basic textarea
<Textarea placeholder="Enter description" />

// Custom sized textarea
<Textarea
  placeholder="Long description..."
  className="min-h-[120px]"
/>

// Disabled textarea
<Textarea
  placeholder="Read-only content"
  editable={false}
/>
```

### Checkbox Component
```tsx
import { Checkbox } from "@/components/ui/checkbox";

// Basic checkbox
<Checkbox checked={isChecked} onCheckedChange={setIsChecked} />

// Checkbox with label
<View className="flex-row items-center gap-2">
  <Checkbox checked={agree} onCheckedChange={setAgree} />
  <Label nativeID="agree">I agree to terms</Label>
</View>
```

### Radio Group Component
```tsx
import { RadioGroup, RadioGroupItem, RadioGroupIndicator } from "@/components/ui/radio-group";

<RadioGroup value={selectedValue} onValueChange={setSelectedValue}>
  <RadioGroupItem value="option1">
    <RadioGroupIndicator />
    <Text>Option 1</Text>
  </RadioGroupItem>
  <RadioGroupItem value="option2">
    <RadioGroupIndicator />
    <Text>Option 2</Text>
  </RadioGroupItem>
</RadioGroup>
```

### Select Component
```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

<Select value={selectedValue} onValueChange={setSelectedValue}>
  <SelectTrigger>
    <SelectValue placeholder="Select an option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
    <SelectItem value="option3">Option 3</SelectItem>
  </SelectContent>
</Select>
```

### Switch Component
```tsx
import { Switch } from "@/components/ui/switch";

// Basic switch
<Switch checked={isEnabled} onCheckedChange={setIsEnabled} />

// Switch with label
<View className="flex-row items-center gap-2">
  <Switch checked={notifications} onCheckedChange={setNotifications} />
  <Label nativeID="notifications">Enable notifications</Label>
</View>
```

### Toggle Component
```tsx
import { Toggle } from "@/components/ui/toggle";

// Basic toggle
<Toggle pressed={isPressed} onPressedChange={setPressed}>
  <Text>Toggle</Text>
</Toggle>

// Toggle with icon
<Toggle pressed={isStarred}>
  <Icon as={Star} className="size-4" />
</Toggle>
```

### Toggle Group Component
```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

<ToggleGroup type="single" value={view} onValueChange={setView}>
  <ToggleGroupItem value="list">
    <Text>List</Text>
  </ToggleGroupItem>
  <ToggleGroupItem value="grid">
    <Text>Grid</Text>
  </ToggleGroupItem>
  <ToggleGroupItem value="calendar">
    <Text>Calendar</Text>
  </ToggleGroupItem>
</ToggleGroup>
```

### Form Components (shadcn/ui Pattern)

The form components follow the shadcn/ui pattern with React Native compatibility, providing accessible, type-safe forms with react-hook-form integration.

#### Form Component Structure
```tsx
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Basic form structure
<Form {...form}>
  <FormField
    control={form.control}
    name="username"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Username</FormLabel>
        <FormControl>
          <Input placeholder="shadcn" {...field} />
        </FormControl>
        <FormDescription>This is your public display name.</FormDescription>
        <FormMessage />
      </FormItem>
    )}
  />
  <Button type="submit">Submit</Button>
</Form>
```

#### Complete Form Example with Validation
```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// 1. Define your form schema
const formSchema = z.object({
  username: z.string().min(2, {
    message: "Username must be at least 2 characters.",
  }),
  email: z.string().email("Invalid email address"),
});

export function ProfileForm() {
  // 2. Define your form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      email: "",
    },
  });

  // 3. Define a submit handler
  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values);
  }

  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="username"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Username</FormLabel>
            <FormControl>
              <Input placeholder="shadcn" {...field} />
            </FormControl>
            <FormDescription>This is your public display name.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input
                placeholder="email@example.com"
                {...field}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <Button onPress={form.handleSubmit(onSubmit)}>Submit</Button>
    </Form>
  );
}
```

#### Form Components Overview

| Component | Description | Props |
|-----------|-------------|-------|
| `Form` | FormProvider wrapper from react-hook-form | `...FormProviderProps` |
| `FormField` | Controlled form field with validation | `control`, `name`, `render` |
| `FormItem` | Container for form field components | `className`, `style` |
| `FormLabel` | Accessible label with error states | `className`, `children` |
| `FormControl` | Wrapper for input components | `children` |
| `FormDescription` | Helper text for form fields | `className`, `children` |
| `FormMessage` | Validation error messages | `className`, `children` |

#### Form Features

- **Accessibility**: Automatic ARIA attributes and screen reader support
- **Validation**: Zod integration with type-safe schemas
- **Error Handling**: Automatic error state propagation
- **Mobile Optimized**: Touch-friendly and platform-specific styling
- **Dark Mode**: Full theme compatibility
- **Type Safety**: Complete TypeScript support

#### Usage with Different Input Types

```tsx
// Text Input
<FormField
  control={form.control}
  name="email"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Email</FormLabel>
      <FormControl>
        <Input
          placeholder="email@example.com"
          {...field}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>

// Password Input
<FormField
  control={form.control}
  name="password"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Password</FormLabel>
      <FormControl>
        <Input
          placeholder="Password"
          {...field}
          secureTextEntry
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>

// Textarea
<FormField
  control={form.control}
  name="bio"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Bio</FormLabel>
      <FormControl>
        <Textarea
          placeholder="Tell us about yourself..."
          {...field}
          numberOfLines={4}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

#### Best Practices

1. **Schema Validation**: Always define Zod schemas for type safety
2. **Default Values**: Provide default values for all form fields
3. **Accessibility**: Use proper labels and ARIA attributes
4. **Error Handling**: Let FormMessage handle validation errors
5. **Mobile Optimization**: Use appropriate keyboard types and auto-capitalization

### Label Component
```tsx
import { Label } from "@/components/ui/label";

// Basic label
<Label nativeID="email">Email Address</Label>

// Interactive label
<Label onPress={handlePress}>Clickable Label</Label>

// Label with form association
<Label nativeID="username">Username</Label>
<Input aria-labelledby="username" placeholder="Enter username" />

### Form Integration Example with Card
```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from "@/components/ui/card";

// Form inside a card
<Card>
  <CardHeader>
    <CardTitle>Profile Information</CardTitle>
    <CardDescription>Update your profile details</CardDescription>
  </CardHeader>
  <CardContent>
    <Form {...form}>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input placeholder="Your name" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input
                placeholder="email@example.com"
                {...field}
                keyboardType="email-address"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  </CardContent>
  <CardFooter>
    <Button onPress={form.handleSubmit(onSubmit)}>Save Changes</Button>
  </CardFooter>
</Card>
```

### Migration from Manual Form Handling

If you're currently using manual form handling with `Controller`, here's how to migrate to the shadcn/ui pattern:

#### Before (Manual Controller)
```tsx
import { Controller, useForm } from "react-hook-form";

const { control, handleSubmit } = useForm();

<Controller
  control={control}
  name="email"
  render={({ field: { onChange, value } }) => (
    <View className="gap-2">
      <Label nativeID="email">Email</Label>
      <Input
        placeholder="Email"
        value={value}
        onChangeText={onChange}
        className={errors.email ? "border-destructive" : ""}
      />
      {errors.email && (
        <Text className="text-destructive text-sm">
          {errors.email.message}
        </Text>
      )}
    </View>
  )}
/>
```

#### After (shadcn/ui Pattern)
```tsx
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/form";

const form = useForm();

<Form {...form}>
  <FormField
    control={form.control}
    name="email"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Email</FormLabel>
        <FormControl>
          <Input placeholder="Email" {...field} />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
</Form>
```

### Benefits of shadcn/ui Form Pattern

1. **Reduced Boilerplate**: Automatic error handling and styling
2. **Better Accessibility**: Built-in ARIA attributes and screen reader support
3. **Consistent Patterns**: Standardized form structure across the app
4. **Type Safety**: Full TypeScript integration with Zod validation
5. **Mobile Optimized**: React Native specific enhancements

### Common Form Patterns

#### Form with Loading State
```tsx
<Button
  onPress={form.handleSubmit(onSubmit)}
  disabled={form.formState.isSubmitting}
>
  <Text>
    {form.formState.isSubmitting ? "Submitting..." : "Submit"}
  </Text>
</Button>
```

#### Form with Custom Validation
```tsx
const formSchema = z.object({
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

// Custom error message display
<FormMessage>
  {error && (
    <View className="flex-row items-center gap-1">
      <Icon as={AlertCircle} className="text-destructive size-4" />
      <Text>{error.message}</Text>
    </View>
  )}
</FormMessage>
```

#### Form with Conditional Fields
```tsx
<FormField
  control={form.control}
  name="newsletter"
  render={({ field }) => (
    <FormItem className="flex-row items-center gap-2">
      <FormControl>
        <Switch checked={field.value} onCheckedChange={field.onChange} />
      </FormControl>
      <FormLabel>Subscribe to newsletter</FormLabel>
    </FormItem>
  )}
/>

{form.watch("newsletter") && (
  <FormField
    control={form.control}
    name="newsletterFrequency"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Frequency</FormLabel>
        <FormControl>
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
)}
```

// Minimal card
<Card>
  <CardContent className="p-4">
    <Text>Simple card content</Text>
  </CardContent>
</Card>

// Card with custom styling
<Card className="bg-popover border-popover-foreground/20">
  <CardHeader>
    <CardTitle className="text-popover-foreground">Custom Card</CardTitle>
  </CardHeader>
</Card>
```

### Skeleton Component
```tsx
import { Skeleton } from "@/components/ui/skeleton";

// Loading skeleton
<Skeleton className="h-4 w-full" />
<Skeleton className="h-12 w-12 rounded-full" />

// Card skeleton
<Card>
  <CardHeader>
    <Skeleton className="h-6 w-3/4" />
    <Skeleton className="h-4 w-full" />
  </CardHeader>
  <CardContent>
    <Skeleton className="h-20 w-full" />
  </CardContent>
  <CardFooter>
    <Skeleton className="h-10 w-24" />
  </CardFooter>
</Card>
```

### Separator Component
```tsx
import { Separator } from "@/components/ui/separator";

// Horizontal separator
<Separator className="my-4" />

// Vertical separator
<Separator orientation="vertical" className="mx-4 h-6" />

// Themed separator
<Separator className="bg-border/50" />
```

### Aspect Ratio Component
```tsx
import { AspectRatio } from "@/components/ui/aspect-ratio";

// Maintain 16:9 aspect ratio
<AspectRatio ratio={16/9}>
  <Image source={{ uri: "https://example.com/image.jpg" }} className="w-full h-full" />
</AspectRatio>

// Square aspect ratio
<AspectRatio ratio={1}>
  <View className="bg-muted w-full h-full" />
</AspectRatio>
```

### Collapsible Component
```tsx
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

<Collapsible open={isOpen} onOpenChange={setOpen}>
  <CollapsibleTrigger>
    <Text>Toggle Content</Text>
  </CollapsibleTrigger>
  <CollapsibleContent>
    <Text>Collapsible content here</Text>
  </CollapsibleContent>
</Collapsible>
```

### Hover Card Component
```tsx
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

<HoverCard>
  <HoverCardTrigger>
    <Text>Hover over me</Text>
  </HoverCardTrigger>
  <HoverCardContent>
    <Text>Hover card content</Text>
  </HoverCardContent>
</HoverCard>
```

### Popover Component
```tsx
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

<Popover>
  <PopoverTrigger>
    <Button variant="outline">Open Popover</Button>
  </PopoverTrigger>
  <PopoverContent>
    <Text>Popover content here</Text>
  </PopoverContent>
</Popover>
```

### Dropdown Menu Component
```tsx
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

<DropdownMenu>
  <DropdownMenuTrigger>
    <Button variant="outline">Options</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onSelect={() => console.log('Edit')}>
      <Text>Edit</Text>
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => console.log('Delete')}>
      <Text>Delete</Text>
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Context Menu Component
```tsx
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";

<ContextMenu>
  <ContextMenuTrigger>
    <View className="p-4 border border-border">
      <Text>Right-click me</Text>
    </View>
  </ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem onSelect={() => console.log('Copy')}>
      <Text>Copy</Text>
    </ContextMenuItem>
    <ContextMenuItem onSelect={() => console.log('Paste')}>
      <Text>Paste</Text>
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

### Menubar Component
```tsx
import { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from "@/components/ui/menubar";

<Menubar>
  <MenubarMenu>
    <MenubarTrigger>
      <Text>File</Text>
    </MenubarTrigger>
    <MenubarContent>
      <MenubarItem onSelect={() => console.log('New')}>
        <Text>New</Text>
      </MenubarItem>
      <MenubarItem onSelect={() => console.log('Open')}>
        <Text>Open</Text>
      </MenubarItem>
    </MenubarContent>
  </MenubarMenu>
</Menubar>
```

## 🎨 Layout & Utility Components

### Container Patterns
```tsx
// Basic container
<View className="flex-1 p-4 bg-background">
  <Text variant="h1">Content</Text>
</View>

// Flex layouts
<View className="flex-row items-center justify-between p-4">
  <Text>Left</Text>
  <Text>Right</Text>
</View>

// Grid-like layout
<View className="flex-row flex-wrap gap-4">
  <View className="flex-1 min-w-[120px]">
    <Text>Item 1</Text>
  </View>
  <View className="flex-1 min-w-[120px]">
    <Text>Item 2</Text>
  </View>
</View>
```

### Spacing Utilities
```tsx
// Padding
<View className="p-4">Uniform padding</View>
<View className="px-4 py-2">Axis padding</View>
<View className="pt-4 pr-6 pb-2 pl-3">Directional padding</View>

// Margin
<View className="m-4">Uniform margin</View>
<Text className="mb-2">Bottom margin</Text>

// Gap (for flex containers)
<View className="flex-col gap-4">
  <Text>Item 1</Text>
  <Text>Item 2</Text>
</View>
```

## 🔄 State & Variant Management

### Button Variants Helper
```tsx
import { buttonVariants } from "@/components/ui/button";

// Using the variant helper directly
<Pressable className={buttonVariants({ variant: "outline", size: "sm" })}>
  <Text>Custom Button</Text>
</Pressable>
```

### Text Variants Helper
```tsx
import { textVariants } from "@/components/ui/text";

// Applying text styles directly
<Text className={textVariants({ variant: "h1" })}>
  Custom Heading
</Text>
```

## 🎯 Best Practices

### 1. Styling Every Text Element
```tsx
// ✅ Correct - every Text is styled
<View>
  <Text className="text-foreground">Title</Text>
  <Text className="text-muted-foreground">Description</Text>
</View>

// ❌ Incorrect - Text without explicit styling
<View className="text-foreground">
  <Text>Title</Text> {/* Will not inherit styles */}
</View>
```

### 2. Platform-Specific Styling
```tsx
// Platform-specific padding
<View className="ios:pt-12 android:pt-6">

// Platform-specific typography
<Text className="ios:font-semibold android:font-medium">

// Safe area handling
<View className="pt-safe-top pb-safe-bottom">
```

### 3. Accessibility
```tsx
// Proper labeling
<Label nativeID="email">Email</Label>
<Input aria-labelledby="email" />

// Semantic roles
<Text variant="h1" role="heading" aria-level={1}>
  Page Title
</Text>

// Sufficient contrast
<Text className="text-foreground bg-background">
  Good contrast
</Text>
```

## 📁 File Structure & Imports

### Component Imports
```tsx
// Button components
import { Button } from "@/components/ui/button";

// Text components
import { Text } from "@/components/ui/text";

// Form components
import { Input, Label } from "@/components/ui/input";

// Card components
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from "@/components/ui/card";
```

### Utility Imports
```tsx
// Style merging utility
import { cn } from "@/lib/utils";

// Variant helpers
import { buttonVariants } from "@/components/ui/button";
import { textVariants } from "@/components/ui/text";
```

## 🔧 Customization

### Adding New Variants
```tsx
// Extend existing variants
const customButtonVariants = {
  fitness: "bg-green-500 text-white border-green-600",
}

<Button className={customButtonVariants.fitness}>
  <Text>Start Activity</Text>
</Button>
```

### Creating Custom Components
```tsx
// Custom component using existing patterns
function FitnessButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      className={cn("bg-green-500 text-white", className)}
      {...props}
    >
      <Text>Fitness</Text>
    </Button>
  );
}
```

This style guide provides comprehensive patterns and examples for using React Native Reusables components in your GradientPeak mobile application.

## 🎨 Customization Guide

### How to Customize Your Project

React Native Reusables uses a theme system based on Tailwind CSS v3 and shadcn/ui. There are four key files involved in the theming system:

#### 1. `components.json` - CLI Configuration
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/global.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

**Purpose**: Tells the CLI where to place files and how to scaffold components. You can modify this if you need to change paths or switch styling approaches.

#### 2. `src/global.css` - CSS Variables & Theme Definition
```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.9%;
    /* ... all light theme variables */
  }

  .dark:root {
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    --card: 0 0% 3.9%;
    --card-foreground: 0 0% 98%;
    /* ... all dark theme variables */
  }
}
```

**Purpose**: Defines your theme using CSS variables under `:root` (light mode) and `.dark:root` (dark mode). Tailwind classes like `bg-background` and `text-foreground` reference these variables.

**Customization Tips**:
- Use themes from [shadcn/ui themes](https://ui.shadcn.com/themes) (Tailwind v3 version)
- Replace `.dark` with `.dark:root` for Nativewind compatibility
- Add new CSS variables for custom colors

#### 3. `tailwind.config.js` - Tailwind Configuration
```js
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // ... all color mappings
      }
    }
  }
}
```

**Purpose**: Connects Tailwind utility classes to the CSS variables defined in `global.css`, configuring dark mode, plugins, and animations.

#### 4. `src/lib/theme.ts` - TypeScript Theme Mirror
```typescript
export const THEME = {
  light: {
    background: "hsl(0 0% 100%)",
    foreground: "hsl(0 0% 3.9%)",
    card: "hsl(0 0% 100%)",
    // ... mirrors all CSS variables in HSL format
  },
  dark: {
    background: "hsl(0 0% 3.9%)",
    foreground: "hsl(0 0% 98%)",
    card: "hsl(0 0% 3.9%)",
    // ... mirrors all CSS variables in HSL format
  }
};
```

**Purpose**: Exports the same colors from `global.css` as a TypeScript object for use in logic, inline styles, or animations. Also includes `NAV_THEME` for React Navigation's `ThemeProvider`.

### Customization Workflow

#### Step 1: Choose a New Theme
1. Visit [shadcn/ui themes](https://ui.shadcn.com/themes)
2. Select a Tailwind v3 theme
3. Copy the CSS variables from the theme

#### Step 2: Update CSS Variables
Replace the contents of `:root` and `.dark:root` in `src/global.css` with your new theme:

```css
@layer base {
  :root {
    /* Paste your new light theme variables here */
  }

  .dark:root {
    /* Paste your new dark theme variables here */
  }
}
```

#### Step 3: Sync TypeScript Theme
After updating CSS variables, sync the `THEME` object in `src/lib/theme.ts`:

```bash
# Use this prompt to keep theme.ts in sync:
# "Read CSS variables under :root and .dark:root in global.css.
# Update the light and dark entries in the THEME object in theme.ts
# to match these values in HSL format. Keep all keys and NAV_THEME
# unchanged. Add new variables if missing; comment stale ones if
# no matching CSS variable exists. Maintain the original formatting
# and key order."
```

#### Step 4: Verify Configuration
1. Check that `tailwind.config.js` properly maps all your colors
2. Ensure all CSS variables are converted to HSL format in `theme.ts`
3. Test both light and dark modes in your app

### Adding Custom Colors

#### 1. Add CSS Variables
In `src/global.css`:
```css
:root {
  --custom-color: 120 60% 50%;
  --custom-foreground: 0 0% 100%;
}

.dark:root {
  --custom-color: 120 70% 40%;
  --custom-foreground: 0 0% 100%;
}
```

#### 2. Update Tailwind Config
In `tailwind.config.js`:
```js
theme: {
  extend: {
    colors: {
      custom: {
        DEFAULT: "hsl(var(--custom-color))",
        foreground: "hsl(var(--custom-foreground))",
      }
    }
  }
}
```

#### 3. Update TypeScript Theme
In `src/lib/theme.ts`:
```typescript
light: {
  custom: "hsl(120 60% 50%)",
  customForeground: "hsl(0 0% 100%)",
  // ... other colors
},
dark: {
  custom: "hsl(120 70% 40%)",
  customForeground: "hsl(0 0% 100%)",
  // ... other colors
}
```

### Custom Component Variants

#### Creating Custom Button Variants
```tsx
// 1. Extend the button component
const customVariants = {
  fitness: "bg-custom text-custom-foreground border-custom-border",
}

// 2. Use in your components
<Button variant="fitness" className={customVariants.fitness}>
  <Text>Start Activity</Text>
</Button>
```

### Platform-Specific Customization

#### iOS-Specific Styles
```js
// In tailwind.config.js
theme: {
  extend: {
    ios: {
      fontSize: {
        'dynamic': '17px', // Dynamic Type support
      },
      // Other iOS-specific utilities
    }
  }
}
```

#### Android-Specific Styles
```js
// In tailwind.config.js
theme: {
  extend: {
    android: {
      elevation: {
        '1': '1',
        '2': '2',
        '3': '3',
      },
      // Other Android-specific utilities
    }
  }
}
```

### Theme Migration Checklist

When updating your theme:

1. ✅ Update `src/global.css` with new CSS variables
2. ✅ Sync `src/lib/theme.ts` to match CSS variables
3. ✅ Verify `tailwind.config.js` color mappings
4. ✅ Test both light and dark modes
5. ✅ Check all components render correctly
6. ✅ Ensure accessibility contrast ratios
7. ✅ Update any custom component variants

### Troubleshooting

#### Common Issues:
1. **Colors not updating**: Clear NativeWind cache with `bun run dev --reset-cache`
2. **Type errors**: Ensure `theme.ts` uses proper HSL format
3. **Dark mode not working**: Verify `.dark:root` selector in CSS
4. **Platform styles not applying**: Check platform-specific utility configuration

#### Performance Tips:
1. Use semantic color names for maintainability
2. Keep custom variants minimal and consistent
3. Use platform-specific utilities sparingly
4. Test on both iOS and Android devices

This customization guide provides a complete workflow for theming your React Native Reusables application while maintaining consistency across CSS, TypeScript, and Tailwind configurations.
