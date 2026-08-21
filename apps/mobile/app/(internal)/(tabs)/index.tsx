import { Text } from "@repo/ui/components/text";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { FeedList } from "@/components/feed";
import { AppHeader } from "@/components/shared";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/ScreenState";
import { api } from "@/lib/api";
import { usePerformanceScreenReady } from "@/lib/performance";

type HomeView = "feed" | "dashboard";

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <View className="min-w-[30%] flex-1 gap-1 rounded-xl border border-border bg-card p-3">
      <Text className="text-sm font-medium text-muted-foreground">{label}</Text>
      <Text className="text-xl font-semibold text-foreground">{value}</Text>
      <Text className="text-xs text-muted-foreground">{detail}</Text>
    </View>
  );
}

function HomeViewTabs({
  activeView,
  onChange,
}: {
  activeView: HomeView;
  onChange: (view: HomeView) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      className="mx-4 mt-4 flex-row rounded-xl border border-border/80 bg-muted/35 p-1"
      testID="home-view-tabs"
    >
      {(
        [
          ["feed", "Feed"],
          ["dashboard", "Dashboard"],
        ] as const
      ).map(([view, label]) => {
        const isActive = activeView === view;

        return (
          <Pressable
            key={view}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            className={`flex-1 items-center justify-center rounded-lg px-3 py-2 ${
              isActive ? "bg-background" : "bg-transparent"
            }`}
            onPress={() => onChange(view)}
            testID={`home-view-tab-${view}`}
          >
            <Text
              className={`text-sm font-semibold ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DashboardView() {
  const dashboardQuery = api.home.getDashboard.useQuery();
  const dashboard = dashboardQuery.data;
  const currentLoad = dashboard?.currentLoadStatus;

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-5 px-4 pb-8 pt-5"
      testID="home-dashboard"
    >
      <View className="gap-1">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Training dashboard
        </Text>
        <Text className="text-2xl font-semibold text-foreground">Your training, at a glance</Text>
        <Text className="text-sm text-muted-foreground">
          Check your current load, consistency, and active plan.
        </Text>
      </View>
      <View className="gap-3" testID="home-current-metrics">
        <Text className="text-lg font-semibold text-foreground">Current training</Text>
        {dashboardQuery.isLoading ? (
          <LoadingState
            message="Loading current training..."
            testID="home-current-metrics-loading"
          />
        ) : dashboardQuery.isError ? (
          <ErrorState
            description="Check your connection and try again."
            onAction={() => void dashboardQuery.refetch()}
            testID="home-current-metrics-error"
            title="Current training could not be loaded"
          />
        ) : currentLoad ? (
          <View className="flex-row flex-wrap gap-2">
            <Metric
              detail={`Long-term load · ${currentLoad.maturity} maturity`}
              label="Fitness"
              value={currentLoad.longTermLoad.toFixed(1)}
            />
            <Metric
              detail="Recent load"
              label="Fatigue"
              value={currentLoad.recentLoad.toFixed(1)}
            />
            <Metric
              detail={`Load balance · ${currentLoad.coverageStatus} coverage`}
              label="Form"
              value={currentLoad.loadBalance.toFixed(1)}
            />
            <Metric
              detail="Current activity streak"
              label="Consistency"
              value={`${dashboard.consistency.streak} days`}
            />
            <Metric
              detail="Your current training plan"
              label="Active plan"
              value={dashboard.activePlan?.name ?? "No active plan"}
            />
          </View>
        ) : (
          <EmptyState
            description="Complete a few activities to build a picture of your current training load."
            testID="home-current-metrics-unavailable"
            title="Your training dashboard is not ready yet"
          />
        )}
      </View>
    </ScrollView>
  );
}

function HomeScreen() {
  usePerformanceScreenReady("route-home");
  const [activeView, setActiveView] = useState<HomeView>("feed");

  return (
    <View className="flex-1 bg-background" testID="home-screen">
      <AppHeader title="Home" />
      <HomeViewTabs activeView={activeView} onChange={setActiveView} />
      {activeView === "feed" ? <FeedList /> : <DashboardView />}
    </View>
  );
}

export default function HomeScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <HomeScreen />
    </ErrorBoundary>
  );
}
