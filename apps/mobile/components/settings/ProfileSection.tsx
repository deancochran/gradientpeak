import { zodResolver } from "@hookform/resolvers/zod";
import { profileQuickUpdateSchema } from "@repo/core";
import { queryKeys } from "@repo/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
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

export function ProfileSection({
  profile,
  onRefreshProfile,
}: ProfileSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();

  const updateProfileMutation = trpc.profiles.update.useMutation({
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.profile.current(),
      });

      // Snapshot previous value
      const previousProfile = queryClient.getQueryData(
        queryKeys.profile.current(),
      );

      // Optimistically update
      queryClient.setQueryData(queryKeys.profile.current(), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          username: variables.username ?? old.username,
          weight_kg: variables.weight_kg ?? old.weight_kg,
          ftp: variables.ftp ?? old.ftp,
          threshold_hr: variables.threshold_hr ?? old.threshold_hr,
        };
      });

      return { previousProfile };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousProfile) {
        queryClient.setQueryData(
          queryKeys.profile.current(),
          context.previousProfile,
        );
      }
    },
    onSuccess: async () => {
      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.trainingPlans.status(),
      });
      await onRefreshProfile();
      setIsEditing(false);
    },
  });

  const form = useForm({
    resolver: zodResolver(profileQuickUpdateSchema),
    defaultValues: {
      username: profile?.username || null,
      weight_kg: profile?.weight_kg || null,
      ftp: profile?.ftp || null,
      threshold_hr: profile?.threshold_hr || null,
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
            <CardTitle className="text-card-foreground">
              Profile Information
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Manage your personal information and training metrics
            </CardDescription>
          </View>
          {!isEditing ? (
            <Button
              variant="outline"
              size="sm"
              onPress={() => setIsEditing(true)}
              testID="edit-profile-button"
            >
              <Text>Edit</Text>
            </Button>
          ) : (
            <View className="flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onPress={onCancel}
                testID="cancel-button"
              >
                <Text>Cancel</Text>
              </Button>
              <Button
                variant="default"
                size="sm"
                onPress={form.handleSubmit(onSubmit)}
                disabled={updateProfileMutation.isPending}
                testID="save-button"
              >
                <Text>
                  {updateProfileMutation.isPending ? "Saving..." : "Save"}
                </Text>
              </Button>
            </View>
          )}
        </View>
      </CardHeader>
      <CardContent className="gap-6">
        <Form {...form}>
          <View className="gap-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter username"
                      value={field.value || ""}
                      onChangeText={field.onChange}
                      editable={isEditing}
                      testID="username-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="weight_kg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Weight (kg)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter weight"
                      value={field.value ? field.value.toString() : ""}
                      onChangeText={(text) => {
                        const num = text ? Number(text) : undefined;
                        field.onChange(num);
                      }}
                      keyboardType="numeric"
                      editable={isEditing}
                      testID="weight-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ftp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>FTP (watts)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter FTP"
                      value={field.value ? field.value.toString() : ""}
                      onChangeText={(text) => {
                        const num = text ? Number(text) : undefined;
                        field.onChange(num);
                      }}
                      keyboardType="numeric"
                      editable={isEditing}
                      testID="ftp-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="threshold_hr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Threshold HR (bpm)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter threshold HR"
                      value={field.value ? field.value.toString() : ""}
                      onChangeText={(text) => {
                        const num = text ? Number(text) : undefined;
                        field.onChange(num);
                      }}
                      keyboardType="numeric"
                      editable={isEditing}
                      testID="threshold-hr-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </View>
        </Form>
      </CardContent>
    </Card>
  );
}
