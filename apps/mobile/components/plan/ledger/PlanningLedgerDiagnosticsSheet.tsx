import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { PointInTimeDetailsSheet } from "@/components/shared/PointInTimeDetailsSheet";
import type { PlanningLedgerPresentation } from "./planningLedgerPresentation";

function DetailsSection({ children, title }: React.PropsWithChildren<{ title: string }>) {
  return (
    <View className="gap-2 border-t border-border pt-4">
      <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

export function PlanningLedgerDiagnosticsSheet({
  diagnostics,
  onClose,
  visible,
}: {
  diagnostics: PlanningLedgerPresentation["diagnostics"];
  onClose: () => void;
  visible: boolean;
}) {
  return (
    <PointInTimeDetailsSheet
      description="Source windows and calculation versions for this breakdown."
      onClose={onClose}
      testID="planning-ledger-data-details"
      title="Calculation details"
      visible={visible}
    >
      <View className="gap-5">
        <DetailsSection title="Record">
          <Text className="text-sm text-foreground">As of {diagnostics.asOfLabel}</Text>
          <Text className="text-sm text-foreground">Timezone: {diagnostics.planningTimezone}</Text>
          {diagnostics.entriesTruncated ? (
            <Text className="text-sm text-muted-foreground">
              Entry list is limited to the first 500 chronological records.
            </Text>
          ) : null}
        </DetailsSection>
        <DetailsSection title="Source windows">
          {diagnostics.sourceWindows.map((source) => (
            <Text className="text-sm text-foreground" key={source.key}>
              {source.label}: {source.value}
            </Text>
          ))}
        </DetailsSection>
        <DetailsSection title="Calculation model">
          {diagnostics.modelLines.map((line) => (
            <Text className="text-sm text-foreground" key={line}>
              {line}
            </Text>
          ))}
        </DetailsSection>
      </View>
    </PointInTimeDetailsSheet>
  );
}
