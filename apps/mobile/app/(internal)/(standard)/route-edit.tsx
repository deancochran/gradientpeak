import {
  type RouteEditForm as RouteEditFormValues,
  routeEditFormSchema,
} from "@repo/core/route-files";
import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { EmptyState, LoadingState } from "@/components/shared/ScreenState";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";
import { handleSubmitFormError } from "@/lib/utils/formErrors";

export default function RouteEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const routeId = typeof id === "string" ? id : "";
  const router = useRouter();
  const utils = api.useUtils();
  const { user } = useAuth();
  const routeQuery = api.routes.get.useQuery({ id: routeId }, { enabled: routeId.length > 0 });
  const updateMutation = api.routes.update.useMutation();
  const routeName = routeQuery.data?.name;
  const routeDescription = routeQuery.data?.description;
  const form = useZodForm({
    defaultValues: { description: "", name: "" },
    schema: routeEditFormSchema,
  });

  useEffect(() => {
    if (!routeName) return;
    form.reset({
      description: routeDescription ?? "",
      name: routeName,
    });
  }, [form, routeDescription, routeName]);

  const submit = useZodFormSubmit<RouteEditFormValues>({
    form,
    shouldRethrow: false,
    submittingLabel: "Saving...",
    onSubmit: async (values) => {
      await updateMutation.mutateAsync({ id: routeId, ...values });
      await utils.routes.invalidate();
      router.back();
    },
    onError: (error) =>
      handleSubmitFormError(form, error, {
        alertTitle: "Unable to update route",
        preferRootError: true,
      }),
  });
  const isSaving = submit.isSubmitting || updateMutation.isPending;

  if (routeQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <LoadingState message="Loading route..." testID="route-edit-loading" />
      </View>
    );
  }

  if (routeQuery.isError || !routeQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <EmptyState
          actionLabel="Go back"
          description="This route may have been removed or is no longer available."
          onAction={() => router.back()}
          title="Route not found"
        />
      </View>
    );
  }

  if (!user?.id || routeQuery.data.profile_id !== user.id) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <EmptyState
          actionLabel="Go back"
          description="Only the route owner can change its reusable name and notes."
          onAction={() => router.back()}
          title="Route cannot be edited"
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
      testID="route-edit-screen"
    >
      <Stack.Screen
        options={{
          title: "Edit Route",
          headerRight: () => (
            <LoadingButton
              disabled={isSaving}
              loading={isSaving}
              loadingLabel="Saving..."
              loadingTextClassName="text-primary"
              onPress={submit.handleSubmit}
              size="sm"
              testID="route-edit-submit-button"
              variant="ghost"
            >
              <Text className="text-sm font-semibold text-primary">Save</Text>
            </LoadingButton>
          ),
        }}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1">
          <Text className="text-xl font-semibold text-foreground">Route details</Text>
          <Text className="text-sm text-muted-foreground">
            Update the reusable name and notes without changing stored geometry.
          </Text>
        </View>
        <Form {...form}>
          <View className="gap-4">
            <FormTextField
              control={form.control}
              disabled={isSaving}
              label="Route Name"
              name="name"
              required
              testId="route-edit-name-input"
            />
            <FormTextareaField
              className="min-h-[120px]"
              control={form.control}
              description="Optional notes about terrain, access, or intended use."
              disabled={isSaving}
              label="Description"
              name="description"
              testId="route-edit-description-input"
            />
            {form.formState.errors.root?.message ? (
              <Text className="text-sm text-destructive" testID="route-edit-root-error">
                {form.formState.errors.root.message}
              </Text>
            ) : null}
          </View>
        </Form>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
