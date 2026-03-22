import { Card, CardContent, CardHeader } from "../card/index.web";
import type { ChartSkeletonProps, ListSkeletonProps } from "./shared";

function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={className} style={style} />;
}

function CardSkeleton() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-4">
        <Skeleton className="mb-2 h-6 w-32 animate-pulse rounded-md bg-accent" />
        <Skeleton className="h-4 w-48 animate-pulse rounded-md bg-accent" />
      </CardHeader>
      <CardContent className="gap-3">
        <Skeleton className="h-4 w-full animate-pulse rounded-md bg-accent" />
        <Skeleton className="h-4 w-3/4 animate-pulse rounded-md bg-accent" />
        <Skeleton className="h-4 w-5/6 animate-pulse rounded-md bg-accent" />
      </CardContent>
    </Card>
  );
}

function ListItemSkeleton() {
  return (
    <div className="flex flex-row items-center gap-3 rounded-lg border border-border bg-card p-4">
      <Skeleton className="h-12 w-12 animate-pulse rounded-full bg-accent" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-3/4 animate-pulse rounded-md bg-accent" />
        <Skeleton className="h-4 w-1/2 animate-pulse rounded-md bg-accent" />
      </div>
      <Skeleton className="h-8 w-8 animate-pulse rounded bg-accent" />
    </div>
  );
}

function ActivityCardSkeleton() {
  return (
    <Card className="border-border bg-card">
      <CardContent className="gap-3 p-4">
        <div className="flex flex-row items-center justify-between">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4 animate-pulse rounded-md bg-accent" />
            <Skeleton className="h-4 w-1/2 animate-pulse rounded-md bg-accent" />
          </div>
          <Skeleton className="h-10 w-10 animate-pulse rounded-full bg-accent" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full animate-pulse rounded-md bg-accent" />
          <Skeleton className="h-3 w-4/5 animate-pulse rounded-md bg-accent" />
        </div>
        <div className="mt-2 flex flex-row gap-2">
          <Skeleton className="h-6 w-16 animate-pulse rounded-full bg-accent" />
          <Skeleton className="h-6 w-20 animate-pulse rounded-full bg-accent" />
          <Skeleton className="h-6 w-14 animate-pulse rounded-full bg-accent" />
        </div>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ height = 250 }: ChartSkeletonProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-4">
        <Skeleton className="mb-2 h-6 w-32 animate-pulse rounded-md bg-accent" />
        <Skeleton className="h-4 w-48 animate-pulse rounded-md bg-accent" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full animate-pulse rounded-lg bg-accent" style={{ height }} />
        <div className="mt-4 flex flex-row justify-between">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-3 w-16 animate-pulse rounded-md bg-accent" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCardSkeleton() {
  return (
    <Card className="border-border bg-card">
      <CardContent className="gap-2 p-4">
        <Skeleton className="mb-2 h-4 w-24 animate-pulse rounded-md bg-accent" />
        <Skeleton className="h-8 w-16 animate-pulse rounded-md bg-accent" />
        <Skeleton className="mt-1 h-3 w-32 animate-pulse rounded-md bg-accent" />
      </CardContent>
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-4">
        <div className="flex flex-row items-center gap-3">
          <Skeleton className="h-16 w-16 animate-pulse rounded-full bg-accent" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-32 animate-pulse rounded-md bg-accent" />
            <Skeleton className="h-4 w-48 animate-pulse rounded-md bg-accent" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="gap-4">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full animate-pulse rounded-lg bg-accent" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TrendsOverviewSkeleton() {
  return (
    <div className="space-y-4">
      <MetricCardSkeleton />
      <ChartSkeleton height={250} />
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <Skeleton className="h-6 w-40 animate-pulse rounded-md bg-accent" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index}>
              <div className="flex flex-row items-center justify-between">
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-32 animate-pulse rounded-md bg-accent" />
                  <Skeleton className="h-3 w-24 animate-pulse rounded-md bg-accent" />
                </div>
                <Skeleton className="h-8 w-12 animate-pulse rounded-md bg-accent" />
              </div>
              <Skeleton className="mt-2 h-2 w-full animate-pulse rounded-full bg-accent" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PlanCalendarSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between px-4">
        <Skeleton className="h-8 w-8 animate-pulse rounded bg-accent" />
        <Skeleton className="h-6 w-32 animate-pulse rounded-md bg-accent" />
        <Skeleton className="h-8 w-8 animate-pulse rounded bg-accent" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="ml-4 h-4 w-20 animate-pulse rounded-md bg-accent" />
            <ActivityCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

function ListSkeleton({ count = 5 }: ListSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </div>
  );
}

export type { ChartSkeletonProps, ListSkeletonProps } from "./shared";
export {
  ActivityCardSkeleton,
  CardSkeleton,
  ChartSkeleton,
  ListItemSkeleton,
  ListSkeleton,
  MetricCardSkeleton,
  PlanCalendarSkeleton,
  ProfileSkeleton,
  TrendsOverviewSkeleton,
};
