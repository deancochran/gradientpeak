import { Text } from "@repo/ui/components/text";
import { ScrollView, View } from "react-native";
import { CalendarEventCard } from "@/components/calendar/CalendarEventCard";
import { GroupCard } from "@/components/groups/GroupCards";
import { GroupEventCard } from "@/components/groups/GroupEventCards";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { ActivityCard } from "@/components/shared/ActivityCard";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { RouteCard } from "@/components/shared/RouteCard";
import { TrainingPlanCard } from "@/components/shared/TrainingPlanCard";
import { mobileCardFixtures as fixtures } from "./mobile-card-fixtures";

const noOp = () => undefined;

function PreviewSection({
  children,
  testID,
  title,
}: React.PropsWithChildren<{ testID: string; title: string }>) {
  return (
    <View className="gap-3" testID={testID}>
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      {children}
    </View>
  );
}

export function MobileCardPreviewSurface() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-8 px-4 py-6"
      testID="mobile-card-matrix"
    >
      <PreviewSection testID="mobile-card-activity" title="Completed activity">
        <ActivityCard activity={fixtures.activity} onPress={noOp} showLike />
      </PreviewSection>

      <PreviewSection testID="mobile-card-activity-plan" title="Activity plan">
        <ActivityPlanCard activityPlan={fixtures.activityPlan} onPress={noOp} />
        <ActivityPlanCard
          activityPlan={fixtures.activityPlan}
          onPress={noOp}
          testID="mobile-card-activity-plan-compact"
          variant="compact"
        />
      </PreviewSection>

      <PreviewSection testID="mobile-card-training-plan" title="Training plan">
        <TrainingPlanCard plan={fixtures.trainingPlan} onPress={noOp} />
        <TrainingPlanCard plan={fixtures.trainingPlan} onPress={noOp} variant="compact" />
      </PreviewSection>

      <PreviewSection testID="mobile-card-route" title="Route">
        <RouteCard onPress={noOp} route={fixtures.route} routeFull={fixtures.routeFull} />
        <RouteCard
          onPress={noOp}
          route={fixtures.route}
          routeFull={fixtures.routeFull}
          variant="compact"
        />
      </PreviewSection>

      <PreviewSection testID="mobile-card-group" title="Group">
        <GroupCard group={fixtures.group} onPress={noOp} testID="mobile-card-group-default" />
        <GroupCard
          disabled
          group={fixtures.group}
          selected
          testID="mobile-card-group-compact"
          variant="compact"
        />
      </PreviewSection>

      <PreviewSection testID="mobile-card-group-event" title="Group event">
        <GroupEventCard event={fixtures.groupEvent} onPress={noOp} />
        <GroupEventCard event={fixtures.groupEvent} onPress={noOp} variant="compact" />
      </PreviewSection>

      <PreviewSection testID="mobile-card-profile" title="Profile">
        <ProfileCard onPress={noOp} profile={fixtures.publicProfile} />
        <ProfileCard
          disabled
          profile={fixtures.privateProfile}
          selected
          supportingText="Private athlete profile"
          testID="mobile-card-profile-private"
        />
      </PreviewSection>

      <PreviewSection testID="mobile-card-calendar" title="Calendar">
        <CalendarEventCard
          canStart
          event={fixtures.calendarEvent}
          onPress={noOp}
          onQuickActionPress={noOp}
        />
      </PreviewSection>
    </ScrollView>
  );
}
