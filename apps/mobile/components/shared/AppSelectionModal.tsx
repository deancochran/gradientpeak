import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { AppFormModal } from "./AppFormModal";

interface AppSelectionModalProps {
  children: React.ReactNode;
  description?: string;
  emptyMessage?: string;
  footerContent?: React.ReactNode;
  isLoading?: boolean;
  loadingMessage?: string;
  onClose: () => void;
  onRefresh?: () => void;
  preserveChildContent?: boolean;
  refreshDisabled?: boolean;
  testID?: string;
  title: string;
}

export function AppSelectionModal({
  children,
  description,
  emptyMessage,
  footerContent,
  isLoading = false,
  loadingMessage = "Loading...",
  onClose,
  onRefresh,
  preserveChildContent = false,
  refreshDisabled = false,
  testID,
  title,
}: AppSelectionModalProps) {
  return (
    <AppFormModal
      description={description}
      footerContent={footerContent}
      onClose={onClose}
      primaryAction={
        !footerContent && onRefresh ? (
          <Button disabled={refreshDisabled} onPress={onRefresh} variant="outline">
            <Text className="text-foreground font-medium">Refresh</Text>
          </Button>
        ) : undefined
      }
      secondaryAction={
        !footerContent ? (
          <Button onPress={onClose} variant="outline">
            <Text className="text-foreground font-medium">Close</Text>
          </Button>
        ) : undefined
      }
      testID={testID}
      title={title}
    >
      <View className="min-h-[280px]">
        {isLoading && !preserveChildContent ? (
          <View className="py-10 items-center gap-2">
            <ActivityIndicator size="small" />
            <Text className="text-xs text-muted-foreground">{loadingMessage}</Text>
          </View>
        ) : emptyMessage && !preserveChildContent ? (
          <View className="py-10 items-center gap-2">
            <Text className="text-sm text-muted-foreground text-center">{emptyMessage}</Text>
          </View>
        ) : (
          children
        )}
      </View>
    </AppFormModal>
  );
}
