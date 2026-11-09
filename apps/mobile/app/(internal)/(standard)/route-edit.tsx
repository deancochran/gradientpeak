import { routeEditFormSchema } from "@repo/core/route-files";
import { Button } from "@repo/ui/components/button";
import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { FormScreen } from "@/components/shared/FormScreen";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/ScreenState";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";
import { useDirtyNavigationGuard } from "@/lib/hooks/useDirtyNavigationGuard";
import { handleSubmitFormError } from "@/lib/utils/formErrors";

export default function RouteEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const routeId = typeof id === "string" ? id : "";
  const router = useRouter();
  const utils = api.useUtils();
  const { user } = useAuth();
  const ownerKey = JSON.stringify([user?.id, routeId]);
  const ownerRef = useRef(ownerKey);
  ownerRef.current = ownerKey;
  const hydratedOwner = useRef<string | null>(null);
  const routeQuery = api.routes.get.useQuery({ id: routeId }, { enabled: routeId.length > 0 });
  const updateMutation = api.routes.update.useMutation();
  const routeName = routeQuery.data?.name;
  const routeDescription = routeQuery.data?.description;
  const form = useZodForm({
    defaultValues: { description: "", name: "" },
    schema: routeEditFormSchema,
  });
  const { isDirty, dirtyFields } = form.formState;

  useEffect(() => {
    const sameOwner = hydratedOwner.current === ownerKey;
    if (!sameOwner) {
      hydratedOwner.current = ownerKey;
      form.reset({ description: "", name: "" });
    }
    if (!routeName || routeQuery.data?.id !== routeId || routeQuery.data?.profile_id !== user?.id)
      return;
    form.reset(
      {
        description: routeDescription ?? "",
        name: routeName,
      },
      { keepDirtyValues: sameOwner },
    );
  }, [
    form,
    routeDescription,
    routeName,
    ownerKey,
    routeId,
    routeQuery.data?.id,
    routeQuery.data?.profile_id,
    user?.id,
  ]);

  const submit = useZodFormSubmit({
    form,
    shouldRethrow: false,
    submittingLabel: "Saving...",
    onSubmit: async (values) => {
      if (!user?.id || routeQuery.data?.profile_id !== user.id || routeQuery.data.id !== routeId)
        return;
      let saved = false;
      try {
        await updateMutation.mutateAsync({ id: routeId, ...values });
        saved = true;
        if (ownerRef.current !== ownerKey) return;
        await Promise.allSettled([Promise.resolve().then(() => utils.routes.invalidate())]);
        if (ownerRef.current !== ownerKey) return;
        allowNavigationAfterSuccess();
        router.back();
      } catch (error) {
        if (ownerRef.current !== ownerKey) return;
        if (saved)
          form.setError("root", {
            message: "Route saved, but this screen could not close. Use Back to continue.",
          });
        else
          handleSubmitFormError(form, error, {
            alertTitle: "Unable to update route",
            preferRootError: true,
          });
      }
    },
  });
  const isSaving = submit.isSubmitting || updateMutation.isPending;
  const { allowNavigationAfterSuccess } = useDirtyNavigationGuard({
    isDirty: isDirty || Object.keys(dirtyFields).length > 0,
    isPending: isSaving,
  });

  if (routeQuery.isLoading && !routeQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <LoadingState message="Loading route..." testID="route-edit-loading" />
      </View>
    );
  }

  const notFound = routeQuery.error?.data?.code === "NOT_FOUND";
  if (routeQuery.isError && !notFound && (!routeQuery.data || routeQuery.data.id !== routeId)) {
    return (
      <View className="flex-1 bg-background px-6">
        <ErrorState title="Unable to load route" onAction={() => void routeQuery.refetch()} />
      </View>
    );
  }

  if (notFound || !routeQuery.data) {
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

  if (routeQuery.data.id !== routeId) return <LoadingState message="Loading route..." />;

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
    <FormScreen key={ownerKey} testID="route-edit-screen">
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
      <View className="gap-1">
        <Text className="text-xl font-semibold text-foreground">Route details</Text>
        <Text className="text-sm text-muted-foreground">
          Update the reusable name and notes without changing stored geometry.
        </Text>
      </View>
      <Form {...form}>
        <View className="gap-4">
          {routeQuery.isError ? (
            <View>
              <Text accessibilityRole="alert">
                Route details could not be refreshed. Your edits are kept.
              </Text>
              <Button onPress={() => void routeQuery.refetch()}>
                <Text>Retry route</Text>
              </Button>
            </View>
          ) : null}
          <FormTextField
            control={form.control}
            disabled={isSaving}
            label="Route Name"
            name="name"
            required
            selectTextOnFocus={process.env.EXPO_PUBLIC_MAESTRO_E2E === "1"}
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
            <Text
              accessibilityRole="alert"
              className="text-sm text-destructive"
              testID="route-edit-root-error"
            >
              {form.formState.errors.root.message}
            </Text>
          ) : null}
        </View>
      </Form>
    </FormScreen>
  );
}
