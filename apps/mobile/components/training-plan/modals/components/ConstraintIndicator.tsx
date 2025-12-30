// apps/mobile/app/(internal)/(tabs)/plan/training-plan/modals/components/ConstraintIndicator.tsx

import { Text } from "@/components/ui/text";
import { AlertTriangle, Check, X } from "lucide-react-native";
import { View } from "react-native";

export type ConstraintStatus =
  | "satisfied"
  | "warning"
  | "violated"
  | "not_applicable";

interface ConstraintIndicatorProps {
  label: string;
  status: ConstraintStatus;
  currentValue?: number | string;
  newValue?: number | string;
  limit?: number | string;
  unit?: string;
  description?: string;
}

/**
 * ConstraintIndicator Component
 *
 * Displays the status of a single training plan constraint with visual feedback.
 * Shows current value, new value (after scheduling), and limit.
 *
 * Status colors:
 * - satisfied: green (constraint met)
 * - warning: yellow (close to limit)
 * - violated: red (exceeds limit)
 * - not_applicable: gray (constraint doesn't apply)
 *
 * @example
 * <ConstraintIndicator
 *   label="Weekly TSS"
 *   status="warning"
 *   currentValue={250}
 *   newValue={280}
 *   limit={300}
 *   unit="TSS"
 * />
 */
export function ConstraintIndicator({
  label,
  status,
  currentValue,
  newValue,
  limit,
  unit,
  description,
}: ConstraintIndicatorProps) {
  if (status === "not_applicable") {
    return null;
  }

  const getStatusColor = (): string => {
    switch (status) {
      case "satisfied":
        return "text-green-600";
      case "warning":
        return "text-yellow-600";
      case "violated":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const getStatusBgColor = (): string => {
    switch (status) {
      case "satisfied":
        return "bg-green-100";
      case "warning":
        return "bg-yellow-100";
      case "violated":
        return "bg-red-100";
      default:
        return "bg-gray-100";
    }
  };

  const getStatusIcon = () => {
    const iconSize = 20;
    const colorClass = getStatusColor();

    switch (status) {
      case "satisfied":
        return <Check size={iconSize} className={colorClass} />;
      case "warning":
        return <AlertTriangle size={iconSize} className={colorClass} />;
      case "violated":
        return <X size={iconSize} className={colorClass} />;
      default:
        return null;
    }
  };

  const formatValue = (value: number | string | undefined): string => {
    if (value === undefined) return "—";
    return typeof value === "number" ? Math.round(value).toString() : value;
  };

  return (
    <View className="mb-3 rounded-lg border border-gray-200 p-3">
      <View className="flex-row items-center justify-between">
        {/* Left: Icon and Label */}
        <View className="flex-row items-center flex-1">
          <View className={`rounded-full p-1 ${getStatusBgColor()}`}>
            {getStatusIcon()}
          </View>
          <Text className="ml-3 font-semibold text-base">{label}</Text>
        </View>

        {/* Right: Values */}
        <View className="items-end">
          {currentValue !== undefined && newValue !== undefined && (
            <View className="flex-row items-center">
              <Text className="text-sm text-gray-600">
                {formatValue(currentValue)}
              </Text>
              <Text className="mx-1 text-gray-400">→</Text>
              <Text className={`text-sm font-semibold ${getStatusColor()}`}>
                {formatValue(newValue)}
              </Text>
              {unit && (
                <Text className="ml-1 text-xs text-gray-500">{unit}</Text>
              )}
            </View>
          )}
          {limit !== undefined && (
            <Text className="text-xs text-gray-500 mt-0.5">
              Limit: {formatValue(limit)} {unit || ""}
            </Text>
          )}
        </View>
      </View>

      {/* Description */}
      {description && (
        <Text className="mt-2 text-sm text-gray-600 ml-9">{description}</Text>
      )}

      {/* Status Message */}
      {status === "warning" && (
        <Text className="mt-2 text-xs text-yellow-700 ml-9">
          ⚠️ Close to limit
        </Text>
      )}
      {status === "violated" && (
        <Text className="mt-2 text-xs text-red-700 ml-9">
          ❌ Exceeds recommended limit
        </Text>
      )}
    </View>
  );
}
