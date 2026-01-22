# Web Development Rules for GradientPeak

## Next.js 15 App Router Patterns

### Server vs Client Components

**Default to Server Components** for:

- Static content and layouts
- Data fetching with direct database/API calls
- SEO-critical pages
- Initial page rendering

**Use Client Components** (`"use client"`) for:

- React hooks (`useState`, `useEffect`, custom hooks)
- Event handlers (`onClick`, `onChange`, etc.)
- Browser APIs (`window`, `localStorage`, etc.)
- Third-party libraries requiring client-side JS
- Interactive UI components

```tsx
// ✅ GOOD - Server Component (default)
export default async function ActivityPage({
  params,
}: {
  params: { id: string };
}) {
  const activity = await db.activities.findById(params.id);
  return <ActivityDetail activity={activity} />;
}

// ✅ GOOD - Client Component
("use client");

export function ActivityChart({ data }: { data: ChartData }) {
  const [selectedMetric, setSelectedMetric] = useState("heartRate");

  return (
    <div>
      <select onChange={(e) => setSelectedMetric(e.target.value)}>
        {/* Options */}
      </select>
      <Chart data={data} metric={selectedMetric} />
    </div>
  );
}
```

### Layout Patterns

```tsx
// Root layout - Centralize providers
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <AuthProvider>
          <ThemeProvider>
            <TRPCProvider>{children}</TRPCProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

// Route group layouts
// (marketing)/_layout.tsx - Public pages
// (dashboard)/_layout.tsx - Protected pages with <AuthGuard>
```

### File Structure

```
app/
├── (marketing)/
│   ├── page.tsx              # Landing page
│   ├── about/page.tsx
│   └── _layout.tsx           # Marketing layout
├── (dashboard)/
│   ├── page.tsx              # Dashboard home
│   ├── activities/
│   │   ├── page.tsx          # Activities list
│   │   └── [id]/page.tsx     # Activity detail
│   └── _layout.tsx           # Dashboard layout with auth
└── api/
    ├── webhooks/
    └── integrations/
```

## tRPC Patterns

### Query Pattern

```tsx
"use client";

import { trpc } from "@/lib/trpc";

export function ActivitiesList() {
  const { data, isLoading, error, refetch } = trpc.activities.list.useQuery(
    { limit: 20, offset: 0 },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  );

  if (isLoading) return <ActivityListSkeleton />;
  if (error) return <ErrorAlert message={error.message} />;

  return (
    <div>
      {data?.map((activity) => (
        <ActivityCard key={activity.id} activity={activity} />
      ))}
    </div>
  );
}
```

### Mutation Pattern

```tsx
"use client";

import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function CreateActivityForm() {
  const utils = trpc.useUtils();

  const mutation = trpc.activities.create.useMutation({
    onSuccess: () => {
      utils.activities.list.invalidate();
      toast.success("Activity created successfully");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = async (data: ActivityInput) => {
    await mutation.mutateAsync(data);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button disabled={mutation.isPending}>
        {mutation.isPending ? "Creating..." : "Create Activity"}
      </button>
    </form>
  );
}
```

### Dependent Queries

```tsx
// Query B depends on Query A
const profileQuery = trpc.profiles.getCurrent.useQuery();

const activitiesQuery = trpc.activities.list.useQuery(
  { profileId: profileQuery.data?.id! },
  {
    enabled: !!profileQuery.data?.id, // Only run when profileId exists
  },
);
```

### Optimistic Updates

```tsx
const mutation = trpc.activities.update.useMutation({
  onMutate: async (updatedActivity) => {
    // Cancel outgoing refetches
    await utils.activities.list.cancel();

    // Snapshot current value
    const previousActivities = utils.activities.list.getData();

    // Optimistically update
    utils.activities.list.setData(undefined, (old) =>
      old?.map((act) =>
        act.id === updatedActivity.id ? { ...act, ...updatedActivity } : act,
      ),
    );

    return { previousActivities };
  },
  onError: (err, updatedActivity, context) => {
    // Rollback on error
    utils.activities.list.setData(undefined, context?.previousActivities);
  },
  onSettled: () => {
    // Refetch after error or success
    utils.activities.list.invalidate();
  },
});
```

## Form Patterns

### Simple Forms (useState)

```tsx
"use client";

export function SimpleForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <form>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </form>
  );
}
```

### Complex Forms (React Hook Form + Zod)

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { activitySchema } from "@repo/core/schemas";

export function ActivityForm() {
  const form = useForm({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      name: "",
      type: "run",
      distance: 0,
    },
  });

  const mutation = trpc.activities.create.useMutation({
    onSuccess: () => toast.success("Activity created"),
    onError: (error) => {
      // Map validation errors to form fields
      if (error.data?.zodError) {
        const fieldErrors = error.data.zodError.fieldErrors;
        Object.entries(fieldErrors).forEach(([field, messages]) => {
          form.setError(field as any, { message: messages?.[0] });
        });
      } else {
        toast.error(error.message);
      }
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    mutation.mutate(data);
  });

  return (
    <form onSubmit={onSubmit}>
      <input {...form.register("name")} />
      {form.formState.errors.name && (
        <span className="text-destructive">
          {form.formState.errors.name.message}
        </span>
      )}

      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Creating..." : "Create"}
      </button>
    </form>
  );
}
```

## Styling with Tailwind CSS v4

### Shadcn/ui Components

```tsx
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// ✅ GOOD - Use shadcn/ui components
<Card>
  <CardHeader>
    <CardTitle>Activity Details</CardTitle>
  </CardHeader>
  <CardContent>{/* Content */}</CardContent>
  <CardFooter>
    <Button variant="default">Save</Button>
    <Button variant="outline">Cancel</Button>
  </CardFooter>
</Card>;
```

### Semantic Colors

```tsx
// Use semantic tokens
<div className="bg-background text-foreground border-border">
  <h1 className="text-foreground">Title</h1>
  <p className="text-muted-foreground">Description</p>
  <Button className="bg-primary text-primary-foreground">Action</Button>
</div>
```

### Dark Mode

- Automatic via `class="dark"` on `<html>` element
- Use semantic color tokens for automatic dark mode support
- Test both light and dark modes

## Authentication

### Auth Protection

```tsx
// Protected layout
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen">
        <Sidebar />
        <main>{children}</main>
      </div>
    </AuthGuard>
  );
}

// AuthGuard component
("use client");

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isLoading } = useSession();

  if (isLoading) return <LoadingScreen />;
  if (!session) redirect("/login");

  return <>{children}</>;
}
```

### Auth Hooks

```tsx
// Get current user
const { data: user, isLoading } = trpc.auth.getUser.useQuery();

// Require auth in component
const user = useRequireAuth(); // Redirects if not authenticated

// Redirect if authenticated (for login page)
useRedirectIfAuthenticated(); // Redirects to dashboard if logged in
```

## Data Fetching

### Server Component Data Fetching

```tsx
// Direct database/API calls in Server Components
export default async function ActivityPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: activity } = await supabase
    .from("activities")
    .select("*")
    .eq("id", params.id)
    .single();

  return <ActivityDetail activity={activity} />;
}
```

### Client Component Data Fetching

```tsx
// Use tRPC queries in Client Components
"use client";

export function ActivityDetail({ id }: { id: string }) {
  const { data, isLoading, error } = trpc.activities.getById.useQuery({ id });

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorAlert />;

  return <div>{/* Activity details */}</div>;
}
```

### Loading States

```tsx
// loading.tsx - Automatic loading UI
export default function Loading() {
  return <Skeleton />;
}

// Manual loading state
{
  isLoading && <Spinner />;
}
{
  isLoading ? <Skeleton /> : <Content data={data} />;
}
```

### Error Handling

```tsx
// error.tsx - Automatic error boundary
"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}

// Manual error handling
if (error) {
  return <ErrorAlert message={error.message} onRetry={refetch} />;
}
```

## Performance Optimization

### Code Splitting

```tsx
import dynamic from "next/dynamic";

// Lazy load heavy components
const HeavyChart = dynamic(() => import("@/components/HeavyChart"), {
  loading: () => <ChartSkeleton />,
  ssr: false, // Disable SSR if not needed
});
```

### Image Optimization

```tsx
import Image from "next/image";

// Use Next.js Image component
<Image
  src="/activity-photo.jpg"
  alt="Activity photo"
  width={800}
  height={600}
  priority // For above-the-fold images
/>;
```

### React Query Caching

```tsx
// Configure stale times appropriately
const { data } = trpc.activities.list.useQuery(
  { limit: 20 },
  {
    staleTime: 5 * 60 * 1000, // 5 minutes for list data
    cacheTime: 10 * 60 * 1000, // 10 minutes in cache
    refetchOnWindowFocus: false,
  },
);
```

## API Routes

### Webhook Handlers

```tsx
// app/api/webhooks/strava/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-hub-signature");

  // Verify webhook signature
  const body = await request.json();

  // Process webhook
  await processStravaWebhook(body);

  return NextResponse.json({ success: true });
}
```

### OAuth Callbacks

```tsx
// app/api/integrations/strava/callback/route.ts
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  // Exchange code for access token
  const tokens = await exchangeCodeForTokens(code);

  // Store tokens
  await storeTokens(userId, tokens);

  return NextResponse.redirect("/dashboard/integrations");
}
```

## Testing

### Component Testing

```tsx
import { render, screen } from "@testing-library/react";
import { ActivityCard } from "./ActivityCard";

describe("ActivityCard", () => {
  it("renders activity name", () => {
    render(<ActivityCard activity={mockActivity} />);
    expect(screen.getByText("Morning Run")).toBeInTheDocument();
  });
});
```

### tRPC Testing

```tsx
import { createInnerTRPCContext } from "@/server/trpc";
import { activityRouter } from "@/server/routers/activities";

describe("activityRouter", () => {
  it("creates activity", async () => {
    const ctx = createInnerTRPCContext({ session: mockSession });
    const caller = activityRouter.createCaller(ctx);

    const activity = await caller.create({
      name: "Test Activity",
      type: "run",
    });

    expect(activity.name).toBe("Test Activity");
  });
});
```

## Critical Don'ts

- ❌ Don't use hooks in Server Components
- ❌ Don't fetch data in Client Components unless using tRPC/React Query
- ❌ Don't forget `"use client"` directive for interactive components
- ❌ Don't import Server Components into Client Components
- ❌ Don't use `useState` for data that should come from server
- ❌ Don't forget to handle loading and error states
- ❌ Don't forget to invalidate cache after mutations
- ❌ Don't use default exports for components (except pages)
- ❌ Don't forget auth protection on protected pages
- ❌ Don't use `any` type - always type your data properly
