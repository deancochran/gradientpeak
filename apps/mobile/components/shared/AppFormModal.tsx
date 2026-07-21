import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { X } from "lucide-react-native";
import type React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  type ScrollViewProps,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface AppFormModalProps {
  children: React.ReactNode;
  description?: string;
  dismissDisabled?: boolean;
  footerContent?: React.ReactNode;
  onClose: () => void;
  primaryAction?: React.ReactNode;
  scrollProps?: ScrollViewProps;
  secondaryAction?: React.ReactNode;
  testID?: string;
  tertiaryAction?: React.ReactNode;
  title: string;
}

export function AppFormModal({
  children,
  description,
  dismissDisabled = false,
  footerContent,
  onClose,
  primaryAction,
  scrollProps,
  secondaryAction,
  testID,
  tertiaryAction,
  title,
}: AppFormModalProps) {
  const { bottom: bottomSafeAreaInset } = useSafeAreaInsets();
  const { contentContainerStyle, ...resolvedScrollProps } = scrollProps ?? {};
  const footerPaddingBottom = 16 + bottomSafeAreaInset;
  const handleClose = () => {
    if (dismissDisabled) {
      return;
    }

    onClose();
  };

  return (
    <Modal
      accessibilityViewIsModal
      animationType="slide"
      presentationStyle="pageSheet"
      visible
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 bg-background"
        testID={testID}
      >
        <View className="flex-1 bg-background">
          <View className="flex-row items-start justify-between border-b border-border px-4 py-4">
            <View className="flex-1 pr-3">
              <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">
                {title}
              </Text>
              {description ? (
                <Text className="mt-1 text-sm text-muted-foreground">{description}</Text>
              ) : null}
            </View>
            <Button
              accessibilityLabel={`Close ${title}`}
              accessibilityState={{ disabled: dismissDisabled }}
              className="rounded-full bg-muted"
              disabled={dismissDisabled}
              onPress={handleClose}
              role="button"
              size="icon"
              testId={`${testID ?? "app-form-modal"}-close`}
              variant="ghost"
            >
              <Icon as={X} size={20} className="text-muted-foreground" />
            </Button>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerClassName="p-4 gap-4"
            contentContainerStyle={[
              {
                paddingBottom:
                  footerContent || primaryAction || secondaryAction || tertiaryAction
                    ? 16
                    : footerPaddingBottom,
              },
              contentContainerStyle,
            ]}
            keyboardShouldPersistTaps="handled"
            {...resolvedScrollProps}
          >
            {children}
          </ScrollView>

          {footerContent ? (
            <View
              className="border-t border-border bg-background px-4 pt-4"
              style={{ paddingBottom: footerPaddingBottom }}
            >
              {footerContent}
            </View>
          ) : primaryAction || secondaryAction || tertiaryAction ? (
            <View
              className="border-t border-border bg-background px-4 pt-4"
              style={{ paddingBottom: footerPaddingBottom }}
            >
              <View className="gap-3">
                {tertiaryAction ? <View>{tertiaryAction}</View> : null}
                <View className="flex-row gap-3">
                  {secondaryAction ? <View className="flex-1">{secondaryAction}</View> : null}
                  {primaryAction ? <View className="flex-1">{primaryAction}</View> : null}
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface AppConfirmAction {
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onPress: () => void;
  testID?: string;
  variant?: "default" | "outline" | "destructive";
}

interface AppConfirmModalProps {
  description: string;
  onClose: () => void;
  primaryAction: AppConfirmAction;
  secondaryAction?: AppConfirmAction;
  tertiaryAction?: AppConfirmAction;
  testID?: string;
  title: string;
}

function renderConfirmButton(action: AppConfirmAction, fill = false) {
  const variant = action.variant === "destructive" ? "default" : (action.variant ?? "default");
  const textClassName =
    action.variant === "destructive"
      ? "text-destructive-surface-foreground font-semibold"
      : fill
        ? "text-primary-foreground font-semibold"
        : "text-foreground font-medium";
  const buttonClassName = action.variant === "destructive" ? "bg-destructive-surface" : undefined;

  return (
    <LoadingButton
      className={buttonClassName}
      disabled={action.disabled}
      loading={action.loading}
      loadingLabel={`${action.label}...`}
      loadingTextClassName={textClassName}
      onPress={action.onPress}
      testId={action.testID}
      variant={variant === "default" && !fill ? "outline" : variant}
    >
      <Text className={textClassName}>{action.label}</Text>
    </LoadingButton>
  );
}

export function AppConfirmModal({
  description,
  onClose,
  primaryAction,
  secondaryAction,
  tertiaryAction,
  testID,
  title,
}: AppConfirmModalProps) {
  return (
    <AppFormModal
      description={description}
      onClose={onClose}
      testID={testID}
      title={title}
      tertiaryAction={tertiaryAction ? renderConfirmButton(tertiaryAction) : undefined}
      primaryAction={renderConfirmButton(primaryAction, true)}
      secondaryAction={secondaryAction ? renderConfirmButton(secondaryAction) : undefined}
    >
      <View className="gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4">
        <Text className="text-sm leading-5 text-muted-foreground">{description}</Text>
      </View>
    </AppFormModal>
  );
}
