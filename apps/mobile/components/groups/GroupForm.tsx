import {
  type ConfigurableGroupJoinPolicy,
  type CreateGroupInput,
  createGroupInputSchema,
  type GroupAccessLevel,
  type GroupJoinPolicy,
} from "@repo/core/groups";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormSegmentedSelectField,
  FormTextareaField,
  FormTextField,
} from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { File as ExpoFile } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Camera, ImagePlus } from "lucide-react-native";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { ActivityIndicator, Alert, Image, TouchableOpacity, View } from "react-native";
import { z } from "zod";
import { AppSelectionModal } from "@/components/shared/AppSelectionModal";
import { api } from "@/lib/api";
import type { GroupDetail } from "@/lib/groups";
import { getReachableSupabaseStorageUrl } from "@/lib/server-config";

const groupFormSchema = createGroupInputSchema.extend({
  description: z.string().trim().nullable().optional(),
  avatar_url: z.string().trim().url("Invalid image URL").or(z.literal("")).nullable().optional(),
  cover_url: z.string().trim().url("Invalid image URL").or(z.literal("")).nullable().optional(),
});

type GroupFormValues = z.input<typeof groupFormSchema>;
type GroupImageFieldName = "avatar_url" | "cover_url";

type GroupFormProps = {
  group?: GroupDetail | null;
  isSubmitting?: boolean;
  onCancel?: () => void;
  onSubmit: (values: CreateGroupInput) => Promise<void> | void;
  showFooterActions?: boolean;
  submitLabel: string;
};

export type GroupFormHandle = {
  submit: () => void;
};

const ACCESS_OPTIONS: Array<{ label: string; value: GroupAccessLevel }> = [
  { label: "Public", value: "public" },
  { label: "Members only", value: "members_only" },
];

const JOIN_OPTIONS: Array<{ label: string; value: ConfigurableGroupJoinPolicy }> = [
  { label: "Open join", value: "open" },
  { label: "Invite only", value: "invite_only" },
];

const GROUP_IMAGE_MIME_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
} as const;

type GroupImageMimeType = (typeof GROUP_IMAGE_MIME_TYPES)[keyof typeof GROUP_IMAGE_MIME_TYPES];

function normalizeJoinPolicy(
  joinPolicy: GroupJoinPolicy | null | undefined,
): ConfigurableGroupJoinPolicy {
  return joinPolicy === "request_to_join" ? "invite_only" : (joinPolicy ?? "open");
}

function toFormValues(group?: GroupDetail | null): GroupFormValues {
  return {
    name: group?.name ?? "",
    description: group?.description ?? "",
    avatar_url: group?.avatar_url ?? "",
    cover_url: group?.cover_url ?? "",
    access_level: group?.access_level ?? "public",
    join_policy: normalizeJoinPolicy(group?.join_policy),
  };
}

function nullableUrl(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function imageMimeTypeForUri(uri: string): { extension: string; mimeType: GroupImageMimeType } {
  const extension = uri.split(".").pop()?.toLowerCase() ?? "jpg";
  if (!(extension in GROUP_IMAGE_MIME_TYPES)) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }

  return {
    extension,
    mimeType: GROUP_IMAGE_MIME_TYPES[extension as keyof typeof GROUP_IMAGE_MIME_TYPES],
  };
}

function groupInitials(name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!trimmed) return "G";

  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function GroupImageUploadField({
  aspect,
  disabled,
  fallbackLabel,
  imageUrl,
  isUploading,
  label,
  onClear,
  onOpenSourcePicker,
}: {
  aspect: [number, number];
  disabled?: boolean;
  fallbackLabel?: string | null;
  imageUrl?: string | null;
  isUploading?: boolean;
  label: string;
  onClear: () => void;
  onOpenSourcePicker: () => void;
}) {
  const isAvatar = aspect[0] === aspect[1];

  return (
    <View className="gap-3">
      {label ? <Text className="text-sm font-medium text-foreground">{label}</Text> : null}
      {isAvatar ? (
        <View className="items-start">
          <TouchableOpacity
            accessibilityLabel={imageUrl ? "Change group avatar" : "Add group avatar"}
            activeOpacity={0.85}
            className="relative"
            disabled={disabled || isUploading}
            onPress={onOpenSourcePicker}
          >
            <Avatar alt={fallbackLabel || "Group"} className="h-28 w-28">
              {imageUrl ? <AvatarImage source={{ uri: imageUrl }} /> : null}
              <AvatarFallback>
                <Text className="text-2xl font-semibold text-foreground">
                  {groupInitials(fallbackLabel)}
                </Text>
              </AvatarFallback>
            </Avatar>
            <View className="absolute bottom-0 right-0 rounded-full bg-primary p-2">
              {isUploading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Icon as={Camera} className="text-primary-foreground" size={18} />
              )}
            </View>
          </TouchableOpacity>
          {imageUrl && !isUploading ? (
            <Button
              className="mt-2 self-start"
              disabled={disabled}
              onPress={onClear}
              size="sm"
              variant="ghost"
            >
              <Text className="text-xs font-semibold text-destructive">Remove</Text>
            </Button>
          ) : null}
        </View>
      ) : (
        <View className="gap-2">
          <TouchableOpacity
            accessibilityLabel={imageUrl ? "Change group cover photo" : "Add group cover photo"}
            activeOpacity={0.9}
            className="relative overflow-hidden rounded-2xl border border-border bg-muted/40"
            disabled={disabled || isUploading}
            onPress={onOpenSourcePicker}
          >
            {imageUrl ? (
              <Image
                accessibilityLabel={`${label} preview`}
                className="h-40 w-full"
                resizeMode="cover"
                source={{ uri: imageUrl }}
              />
            ) : (
              <View className="h-40 items-center justify-center gap-2">
                <Icon as={ImagePlus} className="text-muted-foreground" size={24} />
                <Text className="text-center text-sm font-medium text-muted-foreground">
                  Add cover photo
                </Text>
              </View>
            )}
            <View className="absolute bottom-3 right-3 rounded-full bg-background/95 px-3 py-2 shadow-sm">
              {isUploading ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text className="text-xs font-semibold text-foreground">
                  {imageUrl ? "Change" : "Add"}
                </Text>
              )}
            </View>
          </TouchableOpacity>
          {imageUrl && !isUploading ? (
            <Button
              className="self-start"
              disabled={disabled}
              onPress={onClear}
              size="sm"
              variant="ghost"
            >
              <Text className="text-xs font-semibold text-destructive">Remove</Text>
            </Button>
          ) : null}
        </View>
      )}
    </View>
  );
}

export const GroupForm = forwardRef<GroupFormHandle, GroupFormProps>(function GroupForm(
  { group, isSubmitting = false, onCancel, onSubmit, showFooterActions = true, submitLabel },
  ref,
) {
  const createImageUploadUrlMutation = api.storage.createSignedUploadUrl.useMutation();
  const form = useZodForm({
    schema: groupFormSchema,
    defaultValues: toFormValues(group),
  });
  const avatarUrl = form.watch("avatar_url");
  const coverUrl = form.watch("cover_url");
  const groupName = form.watch("name");
  const previewAvatarUrl = nullableUrl(avatarUrl)
    ? getReachableSupabaseStorageUrl(nullableUrl(avatarUrl)!)
    : null;
  const previewCoverUrl = nullableUrl(coverUrl)
    ? getReachableSupabaseStorageUrl(nullableUrl(coverUrl)!)
    : null;
  const [uploadingImageField, setUploadingImageField] = useState<GroupImageFieldName | null>(null);
  const [imageSourceField, setImageSourceField] = useState<GroupImageFieldName | null>(null);

  useEffect(() => {
    form.reset(toFormValues(group));
  }, [form, group]);

  const submitForm = useZodFormSubmit<GroupFormValues>({
    form,
    shouldRethrow: false,
    onSubmit: async (values) => {
      await onSubmit({
        ...values,
        access_level: values.access_level ?? "public",
        join_policy: normalizeJoinPolicy(values.join_policy),
        description: values.description?.trim() || null,
        avatar_url: nullableUrl(values.avatar_url),
        cover_url: nullableUrl(values.cover_url),
      });
    },
  });

  const disabled = isSubmitting || submitForm.isSubmitting;
  const isUploadingImage = Boolean(uploadingImageField) || createImageUploadUrlMutation.isPending;

  useImperativeHandle(
    ref,
    () => ({
      submit: () => {
        if (!disabled && !isUploadingImage) {
          void submitForm.handleSubmit();
        }
      },
    }),
    [disabled, isUploadingImage, submitForm.handleSubmit],
  );

  const uploadGroupImage = async (fieldName: GroupImageFieldName, uri: string) => {
    const { extension, mimeType } = imageMimeTypeForUri(uri);
    const fileName = `group-${fieldName.replace("_url", "")}-${Date.now()}.${extension}`;
    const { signedUrl, publicUrl } = await createImageUploadUrlMutation.mutateAsync({
      fileName,
      fileType: mimeType,
    });
    const reachableSignedUrl = getReachableSupabaseStorageUrl(signedUrl);
    const reachablePublicUrl = getReachableSupabaseStorageUrl(publicUrl);
    const file = new ExpoFile(uri);

    if (!file.exists) {
      throw new Error("Selected image could not be read");
    }

    const fileResponse = await fetch(file.uri);
    const blob = await fileResponse.blob();
    const uploadResponse = await fetch(reachableSignedUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: blob,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }

    form.setValue(fieldName, reachablePublicUrl, { shouldDirty: true, shouldValidate: true });
  };

  const pickGroupImage = async (fieldName: GroupImageFieldName, source: "camera" | "library") => {
    try {
      setImageSourceField(null);
      setUploadingImageField(fieldName);
      const aspect: [number, number] = fieldName === "avatar_url" ? [1, 1] : [16, 9];
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert(
          "Permission required",
          source === "camera"
            ? "Camera permission is required to take a group photo."
            : "Photo library permission is required to choose a group image.",
        );
        return;
      }

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: "images",
              allowsEditing: true,
              aspect,
              quality: 0.85,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: "images",
              allowsEditing: true,
              aspect,
              quality: 0.85,
            });

      if (!result.canceled && result.assets[0]?.uri) {
        await uploadGroupImage(fieldName, result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert(
        "Image upload failed",
        error instanceof Error ? error.message : "Failed to upload image",
      );
    } finally {
      setUploadingImageField(null);
    }
  };

  return (
    <View className="gap-5">
      <Form {...form}>
        <View className="gap-4">
          <GroupImageUploadField
            aspect={[16, 9]}
            disabled={disabled}
            fallbackLabel={groupName}
            imageUrl={previewCoverUrl}
            isUploading={uploadingImageField === "cover_url"}
            label=""
            onClear={() =>
              form.setValue("cover_url", "", { shouldDirty: true, shouldValidate: true })
            }
            onOpenSourcePicker={() => setImageSourceField("cover_url")}
          />

          <View className="flex-row items-start gap-4">
            <GroupImageUploadField
              aspect={[1, 1]}
              disabled={disabled}
              fallbackLabel={groupName}
              imageUrl={previewAvatarUrl}
              isUploading={uploadingImageField === "avatar_url"}
              label=""
              onClear={() =>
                form.setValue("avatar_url", "", { shouldDirty: true, shouldValidate: true })
              }
              onOpenSourcePicker={() => setImageSourceField("avatar_url")}
            />
            <View className="min-w-0 flex-1">
              <FormTextField
                control={form.control}
                label="Name"
                name="name"
                placeholder="e.g. Sunday Run Club"
              />
            </View>
          </View>

          <FormTextareaField
            control={form.control}
            label="Description"
            name="description"
            numberOfLines={6}
            placeholder="Describe the group, location, sport, and who it is for."
            className="min-h-[140px]"
          />
          <FormSegmentedSelectField
            control={form.control}
            label="Access"
            name="access_level"
            options={ACCESS_OPTIONS}
          />
          <FormSegmentedSelectField
            control={form.control}
            label="Join policy"
            name="join_policy"
            options={JOIN_OPTIONS}
          />
        </View>
      </Form>

      {showFooterActions ? (
        <View className="flex-row gap-3">
          {onCancel ? (
            <Button className="flex-1" disabled={disabled} onPress={onCancel} variant="outline">
              <Text className="text-sm font-semibold text-foreground">Cancel</Text>
            </Button>
          ) : null}
          <Button
            className="flex-1"
            disabled={disabled || isUploadingImage}
            onPress={submitForm.handleSubmit}
          >
            <Text className="text-sm font-semibold text-primary-foreground">
              {disabled ? "Saving..." : submitLabel}
            </Text>
          </Button>
        </View>
      ) : null}
      {imageSourceField ? (
        <AppSelectionModal
          description={`Choose how to update the ${imageSourceField === "avatar_url" ? "group avatar" : "cover photo"}.`}
          onClose={() => setImageSourceField(null)}
          title={imageSourceField === "avatar_url" ? "Group avatar" : "Cover photo"}
        >
          <View className="gap-3">
            <TouchableOpacity
              activeOpacity={0.8}
              className="rounded-xl border border-border bg-card px-4 py-4"
              onPress={() => void pickGroupImage(imageSourceField, "camera")}
            >
              <Text className="text-sm font-semibold text-foreground">Take photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              className="rounded-xl border border-border bg-card px-4 py-4"
              onPress={() => void pickGroupImage(imageSourceField, "library")}
            >
              <Text className="text-sm font-semibold text-foreground">Choose from library</Text>
            </TouchableOpacity>
          </View>
        </AppSelectionModal>
      ) : null}
    </View>
  );
});
