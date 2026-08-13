import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Card, CardContent } from "@repo/ui/components/card";
import { Form, FormTextareaField } from "@repo/ui/components/form";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { format } from "date-fns";
import { Activity, Bike, Dumbbell, Footprints, type LucideIcon, Waves } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { useWatch } from "react-hook-form";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

interface ActivityHeaderProps {
  user: {
    id?: string;
    username: string;
    avatarUrl?: string | null;
  };
  activity: {
    type: string;
    name: string;
    startedAt: string;
    device_manufacturer?: string | null;
    device_product?: string | null;
  };
  notes?: string;
  editable?: boolean;
  onNotesChange?: (notes: string) => void;
  variant?: "card" | "embedded";
}

// Map activity categories to Lucide icons
const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  run: Footprints,
  bike: Bike,
  swim: Waves,
  strength: Dumbbell,
  other: Activity,
};

const activityHeaderSchema = z.object({
  notes: z.string(),
});

export function ActivityHeader({
  user,
  activity,
  notes,
  editable = false,
  onNotesChange,
  variant = "card",
}: ActivityHeaderProps) {
  const { user: signedInUser } = useAuth();
  const navigateTo = useAppNavigate();
  const form = useZodForm({
    schema: activityHeaderSchema,
    defaultValues: {
      notes: notes ?? "",
    },
  });
  const formNotes = useWatch({ control: form.control, name: "notes" });
  const externalNotes = useRef(notes ?? "");
  const syncedNotes = useRef(notes ?? "");
  const isSynchronizing = useRef(false);
  const deviceInfo = [activity.device_manufacturer, activity.device_product]
    .filter(Boolean)
    .join(" ");

  const ActivityIcon = ACTIVITY_ICONS[activity.type] || Activity;

  useEffect(() => {
    const nextNotes = notes ?? "";

    if (externalNotes.current !== nextNotes) {
      isSynchronizing.current = true;
      form.reset({ notes: nextNotes });
      externalNotes.current = nextNotes;
      syncedNotes.current = nextNotes;
    }
  }, [form, notes]);

  useEffect(() => {
    if (
      !isSynchronizing.current &&
      editable &&
      onNotesChange &&
      formNotes !== syncedNotes.current
    ) {
      syncedNotes.current = formNotes;
      onNotesChange(formNotes);
    }
  }, [editable, formNotes, onNotesChange]);

  useEffect(() => {
    if (formNotes === externalNotes.current) {
      isSynchronizing.current = false;
    }
  }, [formNotes]);

  const handleUserPress = () => {
    if (!user.id) return;
    if (user.id === signedInUser?.id) {
      navigateTo("/profile");
      return;
    }

    navigateTo({
      pathname: "/user/[userId]",
      params: { userId: user.id },
    });
  };

  const Content = (
    <>
      {/* Header: Avatar + Username + Metadata */}
      <View className="flex-row items-start gap-3 mb-3">
        <Pressable onPress={handleUserPress} disabled={!user.id}>
          <Avatar className="w-10 h-10" alt={user.username}>
            {user.avatarUrl && <AvatarImage source={{ uri: user.avatarUrl }} />}
            <AvatarFallback>
              <Text className="text-sm font-semibold">
                {user.username?.[0]?.toUpperCase() || "?"}
              </Text>
            </AvatarFallback>
          </Avatar>
        </Pressable>

        <View className="flex-1">
          <Pressable onPress={handleUserPress} disabled={!user.id}>
            <Text className="text-sm font-semibold text-foreground">{user.username}</Text>
          </Pressable>

          <View className="flex-row items-center gap-1.5 mt-1">
            <Icon as={ActivityIcon} size={12} className="text-muted-foreground" />
            <Text className="text-xs text-muted-foreground">
              {format(new Date(activity.startedAt), "MMM d, yyyy • h:mm a")}
            </Text>
            {deviceInfo && (
              <>
                <Text className="text-xs text-muted-foreground">•</Text>
                <Text className="text-xs text-muted-foreground">{deviceInfo}</Text>
              </>
            )}
          </View>
        </View>
      </View>

      <Form {...form}>
        <Text className="text-base font-semibold text-foreground mb-2">Activity</Text>

        {/* Notes/Description */}
        {editable && onNotesChange ? (
          <FormTextareaField
            className="min-h-16 text-sm"
            control={form.control}
            label="Notes"
            name="notes"
            numberOfLines={3}
            placeholder="Add notes..."
          />
        ) : (
          notes && <Text className="text-sm text-muted-foreground">{notes}</Text>
        )}
      </Form>
    </>
  );

  if (variant === "embedded") {
    return <View>{Content}</View>;
  }

  return (
    <Card>
      <CardContent className="p-4">{Content}</CardContent>
    </Card>
  );
}
