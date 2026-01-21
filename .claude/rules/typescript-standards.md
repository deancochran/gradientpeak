# TypeScript Standards for GradientPeak

## TypeScript Configuration

### Strict Mode (Required)
All packages use TypeScript strict mode. This is **non-negotiable**.

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
```

### Shared Configuration
- Base config: `packages/typescript-config/base.json`
- React config: `packages/typescript-config/react.json`
- Next.js config: `packages/typescript-config/nextjs.json`

## Type Safety Principles

### 1. No `any` Type
```typescript
// ❌ WRONG - Using any
function processActivity(data: any) {
  return data.name;
}

// ✅ CORRECT - Proper typing
function processActivity(data: Activity) {
  return data.name;
}

// ✅ CORRECT - Unknown when type is truly unknown
function processUnknownData(data: unknown) {
  if (isActivity(data)) {
    return data.name;
  }
  throw new Error('Invalid data');
}
```

### 2. Type Guards for Runtime Safety
```typescript
// ✅ GOOD - Type guard function
export function isActivity(value: unknown): value is Activity {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'type' in value
  );
}

// Usage
function processData(data: unknown) {
  if (isActivity(data)) {
    // TypeScript knows data is Activity here
    console.log(data.name);
  }
}
```

### 3. Use Zod for Runtime Validation
```typescript
import { z } from 'zod';

// ✅ GOOD - Zod schema with inferred type
export const activitySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(['run', 'bike', 'swim', 'other']),
  distance: z.number().nonnegative().optional(),
  duration: z.number().int().positive(),
});

export type Activity = z.infer<typeof activitySchema>;

// Validate at runtime
const result = activitySchema.safeParse(unknownData);
if (result.success) {
  // result.data is typed as Activity
  console.log(result.data.name);
}
```

## Naming Conventions

### Types and Interfaces
```typescript
// ✅ GOOD - PascalCase
export interface Activity {
  id: string;
  name: string;
}

export type ActivityType = 'run' | 'bike' | 'swim' | 'other';

export enum RecordingState {
  Pending = 'pending',
  Ready = 'ready',
  Recording = 'recording',
  Paused = 'paused',
  Finished = 'finished',
}
```

### Functions and Variables
```typescript
// ✅ GOOD - camelCase
export function calculateTSS(params: TSSParams): number {
  const normalizedPower = params.normalizedPower;
  const intensityFactor = normalizedPower / params.ftp;
  return calculateFromIF(intensityFactor, params.duration);
}

const maxHeartRate = 190;
const currentPower = 250;
```

### Constants
```typescript
// ✅ GOOD - SCREAMING_SNAKE_CASE for true constants
export const MAX_HEART_RATE = 220;
export const DEFAULT_FTP = 200;
export const SECONDS_PER_HOUR = 3600;

// ✅ GOOD - camelCase for configuration objects
export const zoneConfig = {
  powerZones: [0.55, 0.75, 0.90, 1.05, 1.20, 1.50],
  heartRateZones: [0.60, 0.70, 0.80, 0.90, 1.00],
};
```

### Generic Types
```typescript
// ✅ GOOD - Descriptive single letter or word
export function mapArray<T>(arr: T[], fn: (item: T) => T): T[] {
  return arr.map(fn);
}

export function createStore<State, Actions>(
  initialState: State,
  actions: Actions
): Store<State, Actions> {
  // Implementation
}
```

## Function Signatures

### Explicit Return Types
```typescript
// ✅ GOOD - Explicit return type
export function calculatePace(distance: number, duration: number): number {
  return duration / distance;
}

// ✅ GOOD - Explicit void
export function logActivity(activity: Activity): void {
  console.log(activity.name);
}

// ✅ GOOD - Explicit promise type
export async function fetchActivity(id: string): Promise<Activity> {
  const response = await fetch(`/api/activities/${id}`);
  return response.json();
}
```

### Parameter Objects for 3+ Parameters
```typescript
// ❌ WRONG - Too many parameters
export function calculateTSS(
  normalizedPower: number,
  duration: number,
  ftp: number,
  weight: number
): number {
  // ...
}

// ✅ CORRECT - Parameter object
export interface TSSParams {
  normalizedPower: number;
  duration: number;
  ftp: number;
  weight: number;
}

export function calculateTSS(params: TSSParams): number {
  // ...
}
```

### Optional Parameters
```typescript
// ✅ GOOD - Optional with ?
export function formatDistance(
  meters: number,
  unit?: 'km' | 'mi'
): string {
  const unitToUse = unit ?? 'km';
  // ...
}

// ✅ GOOD - With default value
export function formatDistance(
  meters: number,
  unit: 'km' | 'mi' = 'km'
): string {
  // ...
}
```

## Type Composition

### Intersection Types
```typescript
// ✅ GOOD - Combine types
export type ActivityWithStats = Activity & {
  stats: ActivityStats;
};

export type ProtectedRoute = Route & {
  requiresAuth: true;
  permissions: Permission[];
};
```

### Union Types
```typescript
// ✅ GOOD - Multiple possible types
export type SensorType = 'heartRate' | 'power' | 'cadence' | 'speed';

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// Usage with discriminated union
function handleResponse<T>(response: ApiResponse<T>) {
  if (response.success) {
    console.log(response.data); // TypeScript knows data exists
  } else {
    console.error(response.error); // TypeScript knows error exists
  }
}
```

### Utility Types
```typescript
// ✅ GOOD - Use built-in utility types
export type PartialActivity = Partial<Activity>;
export type RequiredActivity = Required<Activity>;
export type ActivityKeys = keyof Activity;
export type ActivityValues = Activity[keyof Activity];

// Pick specific properties
export type ActivityPreview = Pick<Activity, 'id' | 'name' | 'type'>;

// Omit specific properties
export type ActivityWithoutStats = Omit<Activity, 'stats'>;

// Make specific properties optional
export type ActivityUpdate = Partial<Pick<Activity, 'name' | 'description'>>;
```

## Generic Types

### Generic Functions
```typescript
// ✅ GOOD - Generic function
export function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

export function mapMaybe<T, U>(
  arr: T[],
  fn: (item: T) => U | undefined
): U[] {
  return arr.map(fn).filter((item): item is U => item !== undefined);
}
```

### Generic Constraints
```typescript
// ✅ GOOD - Constrain generic type
export function getProperty<T, K extends keyof T>(
  obj: T,
  key: K
): T[K] {
  return obj[key];
}

export function sortBy<T extends { id: string }>(
  items: T[],
  compareFn: (a: T, b: T) => number
): T[] {
  return items.sort(compareFn);
}
```

### Generic Interfaces
```typescript
// ✅ GOOD - Generic interface
export interface Store<State> {
  getState(): State;
  setState(state: Partial<State>): void;
  subscribe(listener: (state: State) => void): () => void;
}

export interface ApiClient<T> {
  get(id: string): Promise<T>;
  list(params?: ListParams): Promise<T[]>;
  create(data: Omit<T, 'id'>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}
```

## React TypeScript Patterns

### Component Props
```typescript
// ✅ GOOD - Explicit props interface
export interface ActivityCardProps {
  activity: Activity;
  onPress?: (id: string) => void;
  showStats?: boolean;
}

export function ActivityCard({
  activity,
  onPress,
  showStats = false,
}: ActivityCardProps) {
  // Component implementation
}
```

### Children Props
```typescript
// ✅ GOOD - Proper children typing
export interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return <div className={className}>{children}</div>;
}
```

### Ref Props
```typescript
import { forwardRef } from 'react';

// ✅ GOOD - Properly typed ref
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', ...props }, ref) => {
    return <button ref={ref} {...props} />;
  }
);

Button.displayName = 'Button';
```

### Event Handlers
```typescript
// ✅ GOOD - Typed event handlers
export interface FormProps {
  onSubmit: (data: FormData) => void;
  onChange: (field: string, value: string) => void;
}

// React Native events
export function handlePress(event: GestureResponderEvent) {
  // Handle press
}

// Web events
export function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
  // Handle click
}

export function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
  // Handle change
}
```

### Custom Hooks
```typescript
// ✅ GOOD - Properly typed hook
export function useActivityRecorder(profile: Profile): ActivityRecorderService {
  const serviceRef = useRef<ActivityRecorderService>();

  useEffect(() => {
    serviceRef.current = new ActivityRecorderService(profile);
    return () => serviceRef.current?.cleanup();
  }, [profile.id]);

  return serviceRef.current!;
}

// ✅ GOOD - Hook with return type
export function useActivity(id: string): {
  activity: Activity | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = trpc.activities.getById.useQuery({ id });

  return {
    activity: data,
    isLoading,
    error,
  };
}
```

## Async/Await and Promises

### Promise Typing
```typescript
// ✅ GOOD - Explicit promise type
export async function fetchActivity(id: string): Promise<Activity> {
  const response = await fetch(`/api/activities/${id}`);
  return response.json();
}

// ✅ GOOD - Multiple promises
export async function fetchActivityWithProfile(
  activityId: string,
  profileId: string
): Promise<{ activity: Activity; profile: Profile }> {
  const [activity, profile] = await Promise.all([
    fetchActivity(activityId),
    fetchProfile(profileId),
  ]);

  return { activity, profile };
}
```

### Error Handling
```typescript
// ✅ GOOD - Type error properly
export async function fetchActivity(id: string): Promise<Activity> {
  try {
    const response = await fetch(`/api/activities/${id}`);
    return response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch activity: ${error.message}`);
    }
    throw new Error('Failed to fetch activity');
  }
}
```

## Enums vs Union Types

### Use Enums for Logical Grouping
```typescript
// ✅ GOOD - Enum for state machine
export enum RecordingState {
  Pending = 'pending',
  Ready = 'ready',
  Recording = 'recording',
  Paused = 'paused',
  Finished = 'finished',
}
```

### Use Union Types for Simple Choices
```typescript
// ✅ GOOD - Union type for simple choices
export type ActivityType = 'run' | 'bike' | 'swim' | 'other';
export type Unit = 'km' | 'mi';
export type Theme = 'light' | 'dark';
```

## Type Assertions

### Avoid Type Assertions
```typescript
// ❌ WRONG - Type assertion
const activity = data as Activity;

// ✅ CORRECT - Validate with Zod
const result = activitySchema.safeParse(data);
if (result.success) {
  const activity = result.data; // Properly typed
}

// ✅ CORRECT - Type guard
if (isActivity(data)) {
  const activity = data; // Properly typed
}
```

### When Type Assertions Are OK
```typescript
// ✅ OK - Non-null assertion when you're certain
const service = serviceRef.current!; // You just assigned it

// ✅ OK - Const assertion for literal types
const config = {
  zones: [1, 2, 3, 4, 5],
  types: ['run', 'bike', 'swim'],
} as const;

// ✅ OK - Type assertion for third-party library
const element = document.getElementById('root') as HTMLDivElement;
```

## Import/Export Patterns

### Named Exports (Preferred)
```typescript
// ✅ GOOD - Named exports
export interface Activity { }
export type ActivityType = 'run' | 'bike';
export function calculateTSS() { }
export const MAX_HEART_RATE = 220;
```

### Type-Only Imports
```typescript
// ✅ GOOD - Type-only import
import type { Activity, Profile } from '@repo/core';

// ✅ GOOD - Mixed import
import { calculateTSS, type TSSParams } from '@repo/core';
```

## Common TypeScript Mistakes

### 1. Using `any`
```typescript
// ❌ WRONG
function process(data: any) {
  return data.value;
}

// ✅ CORRECT
function process<T extends { value: unknown }>(data: T) {
  return data.value;
}
```

### 2. Not Handling Null/Undefined
```typescript
// ❌ WRONG
function getActivityName(activity: Activity | undefined) {
  return activity.name; // Might crash
}

// ✅ CORRECT
function getActivityName(activity: Activity | undefined): string {
  return activity?.name ?? 'Unknown';
}
```

### 3. Ignoring Discriminated Unions
```typescript
// ❌ WRONG
function handleResponse(response: ApiResponse<Activity>) {
  return response.data; // Error: data might not exist
}

// ✅ CORRECT
function handleResponse(response: ApiResponse<Activity>) {
  if (response.success) {
    return response.data; // TypeScript knows data exists
  }
  throw new Error(response.error);
}
```

## Type Checking Commands

```bash
# Check types in specific package
pnpm --filter @repo/core check-types
pnpm --filter mobile check-types
pnpm --filter web check-types

# Check types in all packages
pnpm check-types

# Watch mode for type checking
pnpm watch

# Check types before commit (recommended)
pnpm check-types && git commit
```

## Critical Don'ts

- ❌ Don't use `any` type
- ❌ Don't use type assertions unnecessarily
- ❌ Don't ignore TypeScript errors
- ❌ Don't use `@ts-ignore` without explanation
- ❌ Don't use implicit return types for public APIs
- ❌ Don't forget to handle null/undefined
- ❌ Don't skip type checking before committing
- ❌ Don't use `Function` type (use specific function signature)
