import { profileQuickUpdateSchema } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Form, FormBoundedNumberField, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { useState } from "react";
import { View } from "react-native";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { trpc } from "@/lib/trpc";

interface ProfileSectionProps {
  profile: {
    username?: string | null;
    weight_kg?: number | null;
    ftp?: number | null;
    threshold_hr?: number | null;
  } | null;
  onRefreshProfile: () => Promise<void>;
}

export function ProfileSection({ profile, onRefreshProfile }: ProfileSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const utils = trpc.useUtils();

  const updateProfileMutation = useReliableMutation(trpc.profiles.update, {
    invalidate: [utils.profiles, utils.trainingPlans],
    success: "Profile updated!",
    onSuccess: async () => {
      await onRefreshProfile();
      setIsEditing(false);
    },
  });

  const form = useZodForm({
    schema: profileQuickUpdateSchema,
    defaultValues: {
      username: profile?.username || "",
      weight_kg: profile?.weight_kg || undefined,
      ftp: profile?.ftp || undefined,
      threshold_hr: profile?.threshold_hr || undefined,
    },
  });

  const onSubmit = async (data: any) => {
    try {
      await updateProfileMutation.mutateAsync({
        username: data.username || undefined,
        weight_kg: data.weight_kg || undefined,
        ftp: data.ftp || undefined,
        threshold_hr: data.threshold_hr || undefined,
      });
    } catch (error) {
      console.error("Failed to update profile:", error);
    }
  };

  const onCancel = () => {
    form.reset();
    setIsEditing(false);
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <CardTitle className="text-card-foreground">Profile Information</CardTitle>
            <CardDescription className="text-muted-foreground">
              Manage your personal information and training metrics
            </CardDescription>
          </View>
          {!isEditing ? (
            <Button
              variant="outline"
              size="sm"
              onPress={() => setIsEditing(true)}
              testId="edit-profile-button"
            >
              <Text>Edit</Text>
            </Button>
          ) : (
            <View className="flex-row gap-2">
              <Button variant="outline" size="sm" onPress={onCancel} testId="cancel-button">
                <Text>Cancel</Text>
              </Button>
              <Button
                variant="default"
                size="sm"
                onPress={form.handleSubmit(onSubmit)}
                disabled={updateProfileMutation.isPending}
                testId="save-button"
              >
                <Text>{updateProfileMutation.isPending ? "Saving..." : "Save"}</Text>
              </Button>
            </View>
          )}
        </View>
      </CardHeader>
      <CardContent className="gap-6">
        <Form {...form}>
          <View className="gap-4">
            <FormTextField
              control={form.control}
              disabled={!isEditing}
              label="Username"
              name="username"
              placeholder="Enter username"
              testId="username-input"
            />

            <FormBoundedNumberField
              control={form.control}
              decimals={1}
              disabled={!isEditing}
              label="Weight (kg)"
              min={0}
              name="weight_kg"
              placeholder="Enter weight"
              testId="weight-input"
              unitLabel="kg"
            />

            <FormBoundedNumberField
              control={form.control}
              decimals={0}
              disabled={!isEditing}
              label="FTP (watts)"
              min={0}
              name="ftp"
              placeholder="Enter FTP"
              testId="ftp-input"
              unitLabel="W"
            />

            <FormBoundedNumberField
              control={form.control}
              decimals={0}
              disabled={!isEditing}
              label="Threshold HR (bpm)"
              min={0}
              name="threshold_hr"
              placeholder="Enter threshold HR"
              testId="threshold-hr-input"
              unitLabel="bpm"
            />
          </View>
        </Form>
      </CardContent>
    </Card>
  );
}
