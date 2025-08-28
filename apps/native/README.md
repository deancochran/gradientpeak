# TurboFit Mobile App

A cross-platform fitness tracking mobile app built with Expo, React Native, and modern tooling. Features local-first architecture with cloud sync, comprehensive activity tracking, and real-time analytics.

## 📱 Tech Stack

### Core Framework
- **Expo 53** - Development platform with new architecture enabled
- **React Native 0.79.5** - Cross-platform mobile framework
- **Expo Router 5** - File-based routing with typed routes
- **TypeScript 5.8** - Type safety and developer experience

### Styling & UI
- **NativeWind 4.1** - Tailwind CSS for React Native
- **React Native Reusables** - Shadcn/ui-inspired component library
- **Class Variance Authority** - Type-safe component variants
- **Expo Symbols** - Native iOS symbol integration

### Authentication & Database
- **Supabase** - PostgreSQL database with real-time features
- **Row Level Security** - JWT-based data access control

### Utilities & Performance
- **Expo Location** - GPS and location tracking
- **Expo Secure Store** - Encrypted local storage
- **React Native Reanimated** - Performant animations
- **React Native Gesture Handler** - Native gesture recognition

## 🏗️ Project Structure

```
apps/native/
├── app/                          # Expo Router file-based routing
│   ├── (auth)/                   # Authentication screens
│   │   ├── _layout.tsx          # Auth layout with routing logic
│   │   ├── sign-in.tsx          # Sign in screen
│   │   └── sign-up.tsx          # Sign up screen
│   ├── (tabs)/                  # Main app tab navigation
│   │   ├── _layout.tsx          # Tab layout configuration
│   │   ├── index.tsx            # Dashboard/Home screen
│   │   ├── record.tsx           # Activity recording screen
│   │   └── settings.tsx         # User settings screen
│   ├── _layout.tsx              # Root layout with providers
│   └── +not-found.tsx           # 404 fallback screen
├── components/                   # Reusable UI components
│   ├── ui/                      # React Native Reusables components
│   │   ├── button.tsx           # Button with variants
│   │   ├── card.tsx             # Card component
│   │   ├── input.tsx            # Input field
│   │   ├── text.tsx             # Typography component
│   │   └── alert.tsx            # Alert/notification component
│   ├── Account.tsx              # User account management
│   ├── Auth.tsx                 # Legacy authentication component
│   ├── Avatar.tsx               # User avatar display
│   ├── SignOutButton.tsx        # Authentication actions
│   ├── ThemedText.tsx           # Theme-aware text component
│   └── ThemedView.tsx           # Theme-aware view container
├── lib/                         # Utilities and integrations
│   ├── supabase.ts              # Database client and API functions
│   ├── constants.ts             # App constants and configuration
│   ├── utils.ts                 # Utility functions (cn, etc.)
│   └── useColorScheme.tsx       # Theme management hook
├── assets/                      # Static assets
│   ├── images/                  # App icons, splash screens
│   └── fonts/                   # Custom fonts
├── app.json                     # Expo app configuration
├── components.json              # React Native Reusables config
├── tailwind.config.js           # NativeWind configuration
├── global.css                   # Global CSS variables and themes
└── package.json                 # Dependencies and scripts
```

## 🎨 React Native Reusables Integration

The app uses React Native Reusables, a port of shadcn/ui components optimized for React Native.

### Component System

#### Button Component (`components/ui/button.tsx`)
```tsx
import { Button } from '@/components/ui/button'

// Usage with variants
<Button variant="default" size="lg">Primary Action</Button>
<Button variant="outline" size="sm">Secondary</Button>
<Button variant="ghost">Ghost Button</Button>
```

**Available Variants:**
- `default` - Primary button with brand colors
- `destructive` - Red destructive actions
- `outline` - Outlined button
- `secondary` - Secondary styling
- `ghost` - Transparent background
- `link` - Link-style button

**Available Sizes:**
- `default` - Standard button size
- `sm` - Small button
- `lg` - Large button
- `icon` - Square icon button

#### Input Component (`components/ui/input.tsx`)
```tsx
import { Input } from '@/components/ui/input'

<Input
  placeholder="Enter text"
  value={value}
  onChangeText={setValue}
  className="mb-4"
/>
```

#### Card Component (`components/ui/card.tsx`)
```tsx
import { Card } from '@/components/ui/card'

<Card className="p-4">
  <Text>Card content</Text>
</Card>
```

### Styling System

#### NativeWind Configuration
The app uses NativeWind 4.1 with a custom theme supporting both light and dark modes:

```javascript
// tailwind.config.js
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Design system colors using CSS variables
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // ... more theme colors
      },
    },
  },
}
```

#### CSS Variables (`global.css`)
Theme colors are defined using CSS variables for seamless light/dark mode switching:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  /* ... */
}

.dark:root {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  /* ... */
}
```

#### Utility Functions (`lib/utils.ts`)
```tsx
import { cn } from '@/lib/utils'

// Combines clsx and tailwind-merge for optimal class handling
<View className={cn("bg-background p-4", className)} />
```

### Component Patterns

#### Class Variance Authority Integration
Components use CVA for type-safe variants:

```tsx
const buttonVariants = cva(
  "base-classes",
  {
    variants: {
      variant: {
        default: "bg-primary",
        outline: "border border-input",
      },
      size: {
        default: "h-10 px-4",
        lg: "h-11 px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```







#### Local-First Data Patterns
```tsx
const [activities, setActivities] = useState<Activity[]>([])
const [loading, setLoading] = useState(true)
const [refreshing, setRefreshing] = useState(false)

const loadData = async (isRefresh = false) => {
  if (isRefresh) setRefreshing(true)
  else setLoading(true)

  try {
    const client = await getAuthenticatedClient()
    const api = createAuthenticatedApi(client)
    const data = await api.getActivities(userId)
    setActivities(data)
  } catch (error) {
    console.error('Failed to load data:', error)
  } finally {
    setLoading(false)
    setRefreshing(false)
  }
}
```

### Database Schema Integration

#### Activity Recording
```tsx
// Record new activity
const recordActivity = async (activityData: {
  name: string
  sport: string
  distance_meters: number
  duration_seconds: number
  // ... other fields
}) => {
  await api.createActivity({
    user_id: userId,
    client_id: generateUUID(),
    device_id: deviceId,
    sync_status: 'pending_sync',
    ...activityData,
  })
}
```

#### Real-time Updates
```tsx
useEffect(() => {
  const subscription = supabase
    .channel('activities')
    .on('postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'activities',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        setActivities(prev => [payload.new, ...prev])
      }
    )
    .subscribe()

  return () => subscription.unsubscribe()
}, [userId])
```

## 🧪 Testing Strategy

### Unit Testing
The project uses Jest and React Native Testing Library:

```bash
# Install testing dependencies
bun add -D @testing-library/react-native @testing-library/jest-native jest

# Run tests
bun test

# Watch mode
bun test --watch
```

### Maestro E2E Testing

#### Installation
```bash
# Install Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verify installation
maestro --version
```

#### Basic Test Structure
Create `.maestro/` directory with test flows:

```yaml
# .maestro/auth-flow.yaml
appId: com.deancochran.xnative
---
- launchApp
- tapOn:
    text: "Sign In"
- inputText: "test@example.com"
- tapOn:
    text: "Password"
- inputText: "password123"
- tapOn:
    text: "Continue"
- assertVisible:
    text: "Dashboard"
```

#### Running Tests
```bash
# Run specific test
maestro test .maestro/auth-flow.yaml

# Run all tests
maestro test .maestro/

# Run on specific device
maestro --device-id "iPhone-15" test .maestro/
```

### Testing Commands
```bash
# Lint code
bun lint

# Type checking
bun run check-types

# Format code
bun run format

# Run development server for testing
bun start
```

## 🚀 Staging & Deployment

### Environment Configuration

#### Environment Variables
Create `.env` file:
```bash
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=your-anon-key

```

#### App Configuration (`app.json`)
```json
{
  "expo": {
    "name": "TurboFit",
    "slug": "turbofit",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.yourcompany.turbofit"
    },
    "android": {
      "package": "com.yourcompany.turbofit"
    }
  }
}
```

### Development Workflow

#### Local Development
```bash
# Start development server
bun start

# Platform-specific development
bun ios     # iOS Simulator
bun android # Android Emulator
bun web     # Web browser
```

#### Preview Builds
```bash
# Install EAS CLI
npm install -g @expo/eas-cli

# Login to Expo
eas login

# Configure EAS
eas build:configure

# Create preview build
eas build --platform ios --profile preview
eas build --platform android --profile preview
```

### EAS Build Configuration

#### Create `eas.json`
```json
{
  "cli": {
    "version": ">= 3.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "ios": {
        "autoIncrement": "buildNumber"
      },
      "android": {
        "autoIncrement": "versionCode"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

### Production Deployment

#### iOS App Store
```bash
# Production build
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios
```

#### Android Play Store
```bash
# Production build
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android
```

#### Over-the-Air Updates
```bash
# Install EAS Update
npm install -g @expo/eas-cli

# Create update
eas update --branch production --message "Bug fixes and improvements"
```

## 🔧 Development Commands

### Package Management
```bash
# Install dependencies
bun install

# Add dependency
bun add package-name

# Add development dependency
bun add -D package-name

# Remove dependency
bun remove package-name
```

### Development Server
```bash
# Start development server
bun start

# Start with specific options
bun start --clear         # Clear cache
bun start --tunnel        # Use tunnel for external access
bun start --lan           # Use LAN for network access
```

### Platform Commands
```bash
# iOS
bun ios                   # iOS Simulator
bun ios --device         # Physical iOS device

# Android
bun android              # Android emulator
bun android --device     # Physical Android device

# Web
bun web                  # Web browser
```

### Build Commands
```bash
# Expo development build
eas build --platform ios --profile development
eas build --platform android --profile development

# Production builds
eas build --platform ios --profile production
eas build --platform android --profile production

# Local builds (requires setup)
eas build --local
```

### Utility Commands
```bash
# Reset project (remove example code)
bun run reset-project

# Clear Expo cache
npx expo r --clear

# Check project health
npx expo doctor

# Install iOS pods
cd ios && pod install

# Clean builds
npx expo run:ios --clean
npx expo run:android --clean
```

## 🐛 Troubleshooting


#### Build Issues
- **iOS Build Failures**: Run `cd ios && pod install`
- **Android Build Issues**: Clean build with `bun android --clean`
- **Metro Bundle Errors**: Clear cache with `npx expo r --clear`

#### Development Server
- **Port Conflicts**: Stop other React Native/Expo projects
- **Network Issues**: Try `bun start --tunnel` for external access
- **Cache Issues**: Use `--clear` flag to reset Metro cache

### Performance Optimization
- **Bundle Size**: Use Expo bundle analyzer
- **Memory Usage**: Monitor with React DevTools Profiler
- **Network**: Implement proper caching strategies
- **Animations**: Use `react-native-reanimated` for 60fps animations

---

## 📚 Additional Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Reusables](https://github.com/mrzachnugent/react-native-reusables)
- [NativeWind Documentation](https://www.nativewind.dev/)
- [Supabase React Native Guide](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native)
- [Maestro Testing Documentation](https://maestro.mobile.dev/)

This comprehensive setup provides a robust foundation for developing, testing, and deploying a modern React Native application with best practices for performance, type safety, and user experience.
