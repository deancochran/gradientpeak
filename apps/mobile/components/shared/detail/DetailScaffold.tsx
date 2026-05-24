import type React from "react";
import { type RefreshControl, ScrollView, type ScrollViewProps, View } from "react-native";
import { DetailLoadingState, DetailNotFoundState } from "./DetailState";

type DetailScaffoldProps = {
  children: React.ReactNode;
  contentContainerClassName?: string;
  headerRight?: () => React.ReactNode;
  isLoading?: boolean;
  loadingLabel?: string;
  loadingTestID?: string;
  modals?: React.ReactNode;
  notFound?: boolean;
  notFoundActionLabel?: string;
  notFoundDescription?: string;
  notFoundOnActionPress?: () => void;
  notFoundTestID?: string;
  notFoundTitle?: string;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  screenTestID?: string;
  scrollViewProps?: Omit<ScrollViewProps, "children" | "refreshControl">;
};

export function DetailScaffold({
  children,
  contentContainerClassName = "p-4 gap-4",
  headerRight,
  isLoading = false,
  loadingLabel = "Loading...",
  loadingTestID,
  modals,
  notFound = false,
  notFoundActionLabel,
  notFoundDescription,
  notFoundOnActionPress,
  notFoundTestID,
  notFoundTitle = "Not found",
  refreshControl,
  screenTestID,
  scrollViewProps,
}: DetailScaffoldProps) {
  const { Stack } = require("expo-router") as typeof import("expo-router");

  if (isLoading) {
    return <DetailLoadingState label={loadingLabel} testID={loadingTestID} />;
  }

  if (notFound) {
    return (
      <DetailNotFoundState
        actionLabel={notFoundActionLabel}
        description={notFoundDescription}
        onActionPress={notFoundOnActionPress}
        testID={notFoundTestID}
        title={notFoundTitle}
      />
    );
  }

  return (
    <View className="flex-1 bg-background" testID={screenTestID}>
      <Stack.Screen options={{ headerRight }} />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName={contentContainerClassName}
        refreshControl={refreshControl}
        {...scrollViewProps}
      >
        {children}
      </ScrollView>
      {modals}
    </View>
  );
}
