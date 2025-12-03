import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { View } from "react-native";
import { SettingsGroup } from "./SettingsGroup";

interface TrainingZonesSectionProps {
  profile: {
    ftp?: number | null;
    threshold_hr?: number | null;
  } | null;
  onUpdateZones?: () => void;
}

export function TrainingZonesSection({ profile, onUpdateZones }: TrainingZonesSectionProps) {
  const hasFTP = !!profile?.ftp;
  const hasThresholdHR = !!profile?.threshold_hr;

  return (
    <SettingsGroup
      title="Training Zones"
      description="View your power and heart rate zones based on FTP and threshold HR"
      testID="training-zones-section"
    >
      {/* Power Zones */}
      {hasFTP ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-foreground font-medium">FTP</Text>
              <Text className="text-muted-foreground text-sm">{profile.ftp} watts</Text>
            </View>
            <Text className="text-foreground text-sm">Power Zones</Text>
          </View>
          <View className="gap-2">
            <ZoneRow
              label="Recovery"
              range={`${Math.round(profile.ftp! * 0.55)}-${Math.round(profile.ftp! * 0.75)}W`}
            />
            <ZoneRow
              label="Tempo"
              range={`${Math.round(profile.ftp! * 0.75)}-${Math.round(profile.ftp! * 0.9)}W`}
            />
            <ZoneRow
              label="Threshold"
              range={`${Math.round(profile.ftp! * 0.9)}-${Math.round(profile.ftp! * 1.05)}W`}
            />
            <ZoneRow
              label="VO2 Max"
              range={`${Math.round(profile.ftp! * 1.05)}-${Math.round(profile.ftp! * 1.2)}W`}
            />
            <ZoneRow label="Anaerobic" range={`${Math.round(profile.ftp! * 1.2)}+W`} />
          </View>
        </View>
      ) : (
        <Text className="text-muted-foreground text-sm">
          Set your FTP in profile settings to see power zones
        </Text>
      )}

      {/* Heart Rate Zones */}
      {hasThresholdHR && (
        <>
          <Separator className="bg-border" />
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-foreground font-medium">Threshold HR</Text>
                <Text className="text-muted-foreground text-sm">{profile.threshold_hr} bpm</Text>
              </View>
              <Text className="text-foreground text-sm">Heart Rate Zones</Text>
            </View>
            <View className="gap-2">
              <ZoneRow
                label="Recovery"
                range={`${Math.round(profile.threshold_hr! * 0.68)}-${Math.round(profile.threshold_hr! * 0.83)} bpm`}
              />
              <ZoneRow
                label="Tempo"
                range={`${Math.round(profile.threshold_hr! * 0.83)}-${Math.round(profile.threshold_hr! * 0.94)} bpm`}
              />
              <ZoneRow
                label="Threshold"
                range={`${Math.round(profile.threshold_hr! * 0.94)}-${Math.round(profile.threshold_hr! * 1.05)} bpm`}
              />
              <ZoneRow label="VO2 Max" range={`${Math.round(profile.threshold_hr! * 1.05)}+ bpm`} />
            </View>
          </View>
        </>
      )}

      {!hasThresholdHR && (
        <>
          {hasFTP && <Separator className="bg-border" />}
          <Text className="text-muted-foreground text-sm">
            Set your threshold HR in profile settings to see heart rate zones
          </Text>
        </>
      )}

      {/* Update Button */}
      {onUpdateZones && (
        <>
          <Separator className="bg-border" />
          <Button variant="outline" onPress={onUpdateZones} className="w-full">
            <Text>Update Zones in Profile</Text>
          </Button>
        </>
      )}
    </SettingsGroup>
  );
}

interface ZoneRowProps {
  label: string;
  range: string;
}

function ZoneRow({ label, range }: ZoneRowProps) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-muted-foreground text-xs">{label}</Text>
      <Text className="text-foreground text-xs">{range}</Text>
    </View>
  );
}
