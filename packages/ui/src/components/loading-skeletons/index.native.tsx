import { View } from "react-native";

import { Card, CardContent, CardHeader } from "../card/index.native";
import { Skeleton } from "../skeleton/index.native";
import type { ChartSkeletonProps, ListSkeletonProps } from "./shared";

function CardSkeleton() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-4">
        <Skeleton className="mb-2 h-6 w-32" />
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

function ListItemSkeleton() {
  return (
    <View className="flex-row items-center gap-3 rounded-lg border border-border bg-card p-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <View className="flex-1 gap-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </View>
      <Skeleton className="h-8 w-8 rounded" />
    </View>
  );
}

function ActivityCardSkeleton() {
  return (
    <Card className="border-border bg-card">
      <CardContent className="gap-3 p-4">
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
        <View className="mt-2 flex-row gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-full" />
        </View>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ height = 250 }: ChartSkeletonProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-4">
        <Skeleton className="mb-2 h-6 w-32" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full rounded-lg" style={{ height }} />
        <View className="mt-4 flex-row justify-between">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </View>
      </CardContent>
    </Card>
  );
}

function MetricCardSkeleton() {
  return (
    <Card className="border-border bg-card">
      <CardContent className="gap-2 p-4">
        <Skeleton className="mb-2 h-4 w-24" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="mt-1 h-3 w-32" />
      </CardContent>
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <Card className="border-border bg-card">
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

function TrendsOverviewSkeleton() {
  return (
    <View className="gap-4">
      <MetricCardSkeleton />
      <ChartSkeleton height={250} />
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="gap-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <View key={index}>
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Skeleton className="mb-1 h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </View>
                <Skeleton className="h-8 w-12" />
              </View>
              <Skeleton className="mt-2 h-2 w-full rounded-full" />
            </View>
          ))}
        </CardContent>
      </Card>
    </View>
  );
}

function PlanCalendarSkeleton() {
  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between px-4">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-8 rounded" />
      </View>
      <View className="gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} className="gap-2">
            <Skeleton className="ml-4 h-4 w-20" />
            <ActivityCardSkeleton />
          </View>
        ))}
      </View>
    </View>
  );
}

function ListSkeleton({ count = 5 }: ListSkeletonProps) {
  return (
    <View className="gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </View>
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
