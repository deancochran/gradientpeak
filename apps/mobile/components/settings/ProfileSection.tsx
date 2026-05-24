import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Form, FormTextField } from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { AlertCircle } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { api } from "@/lib/api";
import { handleSubmitFormError } from "@/lib/utils/formErrors";

const profileSectionSchema = z.object({
  username: z.string().optional(),
});

type ProfileSectionFormData = z.infer<typeof profileSectionSchema>;

interface ProfileSectionProps {
  profile: {
    username?: string | null;
  } | null;
  onRefreshProfile: () => Promise<void>;
}

export function ProfileSection({ profile, onRefreshProfile }: ProfileSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const utils = api.useUtils();
  const defaultValues = useMemo(
    () => ({
      username: profile?.username || "",
    }),
    [profile?.username],
  );

  const updateProfileMutation = api.profiles.update.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.profiles.invalidate(), utils.trainingPlans.invalidate()]);
      await onRefreshProfile();
      setIsEditing(false);
    },
  });

  const form = useZodForm({
    schema: profileSectionSchema,
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  const submitForm = useZodFormSubmit<ProfileSectionFormData>({
    form,
    shouldRethrow: false,
    onSubmit: async (data) => {
      form.clearErrors("root");
      await updateProfileMutation.mutateAsync({
        username: data.username || undefined,
      });
    },
    onError: (error) => handleSubmitFormError(form, error, { preferRootError: true }),
  });

  const isSubmitting = updateProfileMutation.isPending || submitForm.isSubmitting;
  const submitButtonState = submitForm.getSubmitButtonState({
    disabled: isSubmitting,
    label: "Save",
    submittingLabel: "Saving...",
  });

  const onCancel = () => {
    form.reset(defaultValues);
    form.clearErrors("root");
    setIsEditing(false);
  };

  const onEdit = () => {
    form.clearErrors("root");
    setIsEditing(true);
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <CardTitle className="text-card-foreground">Profile Information</CardTitle>
            <CardDescription className="text-muted-foreground">
              Manage your profile information
            </CardDescription>
          </View>
          {!isEditing ? (
            <Button variant="outline" size="sm" onPress={onEdit} testId="edit-profile-button">
              <Text>Edit</Text>
            </Button>
          ) : (
            <View className="flex-row gap-2">
              <Button variant="outline" size="sm" onPress={onCancel} testId="cancel-button">
                <Text>Cancel</Text>
              </Button>
              <LoadingButton
                variant="default"
                size="sm"
                onPress={submitForm.handleSubmit}
                disabled={submitButtonState.disabled}
                loading={isSubmitting || submitButtonState.loading}
                loadingLabel={submitButtonState.loadingLabel}
                testId="save-button"
              >
                <Text>{submitButtonState.label}</Text>
              </LoadingButton>
            </View>
          )}
        </View>
      </CardHeader>
      <CardContent className="gap-6">
        <Form {...form}>
          <View className="gap-4">
            {form.formState.errors.root?.message ? (
              <Alert icon={AlertCircle} variant="destructive" testID="profile-root-error">
                <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
              </Alert>
            ) : null}

            <FormTextField
              control={form.control}
              disabled={!isEditing}
              label="Username"
              name="username"
              placeholder="Enter username"
              testId="username-input"
            />
          </View>
        </Form>
      </CardContent>
    </Card>
  );
}
