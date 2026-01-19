import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { useActivitySubmission } from "@/lib/hooks/useActivitySubmission";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  activitySubmissionFormSchema,
  type ActivitySubmissionFormData,
} from "@repo/core";
import { useRouter } from "expo-router";
import { Loader2, Save, Trash2 } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";

function SubmitScreen() {
  const router = useRouter();

  const service = useSharedActivityRecorder();
  const submission = useActivitySubmission(service);

  const form = useForm<ActivitySubmissionFormData>({
    resolver: zodResolver(activitySubmissionFormSchema) as any,
    defaultValues: {
      name: submission.activity?.name || "",
      notes: submission.activity?.notes ?? null,
      is_private: false,
    } as ActivitySubmissionFormData,
  });

  // Memoize handlers to prevent re-renders
  const handleSubmit = useCallback(
    async (data: ActivitySubmissionFormData) => {
      // Pass all form data to submission.update
      submission.update({
        name: data.name,
        notes: data.notes ?? undefined,
        is_private: data.is_private,
      });
      await submission.submit();
      if (service) {
        await service.cleanup();
      }
      // Navigate back twice: once to close submit screen, once to close record modal
      router.back();
      router.back();
    },
    [submission, service, router],
  );

  const handleDiscard = useCallback(() => {
    Alert.alert(
      "Discard Activity",
      "Are you sure you want to delete this activity?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // Clean up stream files
            if (service) {
              await service.liveMetricsManager.streamBuffer.cleanup();
              await service.cleanup();
            }
            // Navigate back twice: once to close submit screen, once to close record modal
            router.back();
            router.back();
          },
        },
      ],
    );
  }, [service, router]);

  // Memoize canSubmit to prevent unnecessary re-renders
  const activityName = form.watch("name");
  const canSubmit = useMemo(
    () => activityName?.trim().length > 0 && !submission.isUploading,
    [activityName, submission.isUploading],
  );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View className="bg-background border-b border-border px-6 py-4 pt-14">
        <View className="flex-1 items-center mb-4">
          <Text className="text-2xl font-bold">Save Activity</Text>
          <Text className="text-sm text-muted-foreground">
            Add details for your workout
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-32"
      >
        {submission.activity && (
          <Form {...form}>
            <View className="px-6 pt-6 space-y-6">
              {/* Activity Name Input */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      Activity Name
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter activity name"
                        value={field.value}
                        onChangeText={field.onChange}
                        className="text-base py-3"
                        editable={!submission.isUploading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notes/Description */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      Description
                    </FormLabel>
                    <FormDescription>
                      Add notes about how the workout felt (optional)
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        placeholder="How did it feel? Any observations?"
                        value={field.value || ""}
                        onChangeText={field.onChange}
                        numberOfLines={6}
                        className="min-h-32"
                        editable={!submission.isUploading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Privacy Toggle */}
              <FormField
                control={form.control}
                name="is_private"
                render={({ field }) => (
                  <FormItem>
                    <View className="flex-row items-center justify-between rounded-lg border border-border p-4">
                      <View className="flex-1 pr-4">
                        <Label className="text-base font-semibold">
                          Private Activity
                        </Label>
                        <Text className="text-sm text-muted-foreground mt-1">
                          Only you can see this activity
                        </Text>
                      </View>
                      <Switch
                        checked={field.value || false}
                        onCheckedChange={field.onChange}
                        disabled={submission.isUploading}
                      />
                    </View>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Delete Button */}
              <Button
                variant="destructive"
                onPress={handleDiscard}
                disabled={submission.isUploading}
                className="w-full mt-8"
              >
                <View className="flex-row items-center gap-2">
                  <Icon
                    as={Trash2}
                    size={20}
                    className="text-destructive-foreground"
                  />
                  <Text className="text-base font-semibold text-destructive-foreground">
                    Delete Activity
                  </Text>
                </View>
              </Button>
            </View>
          </Form>
        )}
      </ScrollView>

      {/* Sticky Save Button at Bottom */}
      <View className="absolute bottom-0 left-0 right-0 bg-background border-t border-border px-6 py-4 pb-8">
        <Button
          onPress={form.handleSubmit(handleSubmit)}
          disabled={!canSubmit}
          className="w-full"
          size="lg"
        >
          {submission.isUploading ? (
            <View className="flex-row items-center gap-2">
              <Icon
                as={Loader2}
                size={20}
                className="text-primary-foreground animate-spin"
              />
              <Text className="text-base font-semibold text-primary-foreground">
                Saving...
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              <Icon as={Save} size={20} className="text-primary-foreground" />
              <Text className="text-base font-semibold text-primary-foreground">
                Save Activity
              </Text>
            </View>
          )}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function SubmitScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <SubmitScreen />
    </ErrorBoundary>
  );
}
