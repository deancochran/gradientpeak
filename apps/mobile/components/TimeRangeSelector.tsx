// apps/mobile/app/(internal)/(tabs)/trends/components/TimeRangeSelector.tsx

import { Text } from "@/components/ui/text";
import { Pressable, View } from "react-native";

export type TimeRange = "1M" | "3M" | "6M" | "12M" | "ALL";

interface TimeRangeOption {
  value: TimeRange;
  label: string;
  months: number | null; // null for ALL
}

const timeRangeOptions: TimeRangeOption[] = [
  { value: "1M", label: "1 Month", months: 1 },
  { value: "3M", label: "3 Months", months: 3 },
  { value: "6M", label: "6 Months", months: 6 },
  { value: "12M", label: "12 Months", months: 12 },
  { value: "ALL", label: "All Time", months: null },
];

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  disabled?: boolean;
}

/**
 * TimeRangeSelector Component
 *
 * Button group for selecting time period for trends data.
 * Displays four options: 3M, 6M, 12M, All Time.
 *
 * Usage:
 * ```tsx
 * const [range, setRange] = useState<TimeRange>("3M");
 * <TimeRangeSelector value={range} onChange={setRange} />
 * ```
 */
export function TimeRangeSelector({
  value,
  onChange,
  disabled = false,
}: TimeRangeSelectorProps) {
  return (
    <View className="mb-4">
      <View className="flex-row bg-gray-100 rounded-lg p-1">
        {timeRangeOptions.map((option, index) => {
          const isSelected = value === option.value;
          const isFirst = index === 0;
          const isLast = index === timeRangeOptions.length - 1;

          return (
            <Pressable
              key={option.value}
              onPress={() => !disabled && onChange(option.value)}
              disabled={disabled}
              className={`
                flex-1 py-2 px-3
                ${isFirst ? "rounded-l-md" : ""}
                ${isLast ? "rounded-r-md" : ""}
                ${isSelected ? "bg-white shadow-sm" : "bg-transparent"}
                ${disabled ? "opacity-50" : ""}
              `}
            >
              <Text
                className={`
                  text-center font-medium text-sm
                  ${isSelected ? "text-blue-600" : "text-gray-600"}
                `}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Helper function to calculate date range from TimeRange value
 */
export function getDateRangeFromTimeRange(range: TimeRange): {
  start_date: string;
  end_date: string;
} {
  const today = new Date();
  const endDate = today.toISOString().split("T")[0];

  let startDate: Date;

  const option = timeRangeOptions.find((opt) => opt.value === range);
  if (!option || option.months === null) {
    // All time - go back 5 years
    startDate = new Date(today);
    startDate.setFullYear(today.getFullYear() - 5);
  } else {
    startDate = new Date(today);
    startDate.setMonth(today.getMonth() - option.months);
  }

  return {
    start_date: startDate.toISOString().split("T")[0],
    end_date: endDate,
  };
}
