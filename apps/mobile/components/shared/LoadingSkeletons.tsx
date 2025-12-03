import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { View } from "react-native";

/**
 * Loading skeleton for card-based content
 */
export function CardSkeleton() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton for list items
 */
export function ListItemSkeleton() {
  return (
    <View className="flex-row items-center gap-3 p-4 bg-card rounded-lg border border-border">
      <Skeleton className="h-12 w-12 rounded-full" />
      <View className="flex-1 gap-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </View>
      <Skeleton className="h-8 w-8 rounded" />
    </View>
  );
}

/**
 * Loading skeleton for activity cards
 */
export function ActivityCardSkeleton() {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 gap-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 gap-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </View>
          <Skeleton className="h-10 w-10 rounded-full" />
        </View>
        <View className="gap-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </View>
        <View className="flex-row gap-2 mt-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-full" />
        </View>
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton for chart components
 */
export function ChartSkeleton({ height = 250 }: { height?: number }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full rounded-lg" style={{ height }} />
        <View className="flex-row justify-between mt-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </View>
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton for metric/stat cards
 */
export function MetricCardSkeleton() {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 gap-2">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-32 mt-1" />
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton for profile/settings sections
 */
export function ProfileSkeleton() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <View className="flex-row items-center gap-3">
          <Skeleton className="h-16 w-16 rounded-full" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </View>
        </View>
      </CardHeader>
      <CardContent className="gap-4">
        <View className="gap-3">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </View>
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton for the full trends overview
 */
export function TrendsOverviewSkeleton() {
  return (
    <View className="gap-4">
      <MetricCardSkeleton />
      <ChartSkeleton height={250} />
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="gap-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-24" />
            </View>
            <Skeleton className="h-8 w-12" />
          </View>
          <Skeleton className="h-2 w-full rounded-full" />
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-24" />
            </View>
            <Skeleton className="h-8 w-12" />
          </View>
          <Skeleton className="h-2 w-full rounded-full" />
        </CardContent>
      </Card>
    </View>
  );
}

/**
 * Loading skeleton for plan/calendar view
 */
export function PlanCalendarSkeleton() {
  return (
    <View className="gap-4">
      <View className="flex-row justify-between items-center px-4">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-8 rounded" />
      </View>
      <View className="gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} className="gap-2">
            <Skeleton className="h-4 w-20 ml-4" />
            <ActivityCardSkeleton />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Generic loading skeleton with customizable rows
 */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View className="gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </View>
  );
}
