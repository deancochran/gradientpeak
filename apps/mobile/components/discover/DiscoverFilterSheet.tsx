import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Text } from "@repo/ui/components/text";
import type React from "react";
import { TouchableOpacity, View } from "react-native";
import { AppBottomSheet } from "@/components/shared/AppBottomSheet";
import {
  ACTIVITY_CATEGORY_OPTIONS,
  type ActivityPlanFilters,
  type ActivityPlanSortField,
  areSortStatesEqual,
  DEFAULT_ACTIVITY_PLAN_SORT,
  DEFAULT_PROFILE_SORT,
  DEFAULT_ROUTE_SORT,
  DEFAULT_TRAINING_PLAN_SORT,
  type DiscoverScope,
  getScopeNoun,
  hasActivityPlanFilters,
  hasRouteFilters,
  hasTrainingPlanFilters,
  type ProfileSortField,
  parseNumericInput,
  type RouteFilters,
  type RouteSortField,
  type SortDirection,
  type SortState,
  TRAINING_PLAN_EXPERIENCE_OPTIONS,
  TRAINING_PLAN_SPORT_OPTIONS,
  type TrainingPlanFilters,
  type TrainingPlanSortField,
} from "@/lib/discover";

const DISCOVER_FILTER_SHEET_SNAP_POINTS = ["92%"];

interface DiscoverFilterSheetProps {
  visible: boolean;
  scope: DiscoverScope;
  activityPlanSort: SortState<ActivityPlanSortField>;
  onActivityPlanSortChange: (value: SortState<ActivityPlanSortField>) => void;
  routeSort: SortState<RouteSortField>;
  onRouteSortChange: (value: SortState<RouteSortField>) => void;
  trainingPlanSort: SortState<TrainingPlanSortField>;
  onTrainingPlanSortChange: (value: SortState<TrainingPlanSortField>) => void;
  profileSort: SortState<ProfileSortField>;
  onProfileSortChange: (value: SortState<ProfileSortField>) => void;
  activityPlanFilters: ActivityPlanFilters;
  onActivityPlanFiltersChange: (filters: ActivityPlanFilters) => void;
  trainingPlanFilters: TrainingPlanFilters;
  onTrainingPlanFiltersChange: (filters: TrainingPlanFilters) => void;
  routeFilters: RouteFilters;
  onRouteFiltersChange: (filters: RouteFilters) => void;
  validationErrors: string[];
  onReset: () => void;
  onApply: () => void;
  onClose: () => void;
}

export function DiscoverFilterSheet({
  visible,
  scope,
  activityPlanSort,
  onActivityPlanSortChange,
  routeSort,
  onRouteSortChange,
  trainingPlanSort,
  onTrainingPlanSortChange,
  profileSort,
  onProfileSortChange,
  activityPlanFilters,
  onActivityPlanFiltersChange,
  trainingPlanFilters,
  onTrainingPlanFiltersChange,
  routeFilters,
  onRouteFiltersChange,
  validationErrors,
  onReset,
  onApply,
  onClose,
}: DiscoverFilterSheetProps) {
  const isResetDisabled =
    (scope === "activityPlans" &&
      areSortStatesEqual(activityPlanSort, DEFAULT_ACTIVITY_PLAN_SORT) &&
      !hasActivityPlanFilters(activityPlanFilters)) ||
    (scope === "trainingPlans" &&
      areSortStatesEqual(trainingPlanSort, DEFAULT_TRAINING_PLAN_SORT) &&
      !hasTrainingPlanFilters(trainingPlanFilters)) ||
    (scope === "routes" &&
      areSortStatesEqual(routeSort, DEFAULT_ROUTE_SORT) &&
      !hasRouteFilters(routeFilters)) ||
    scope === "groups" ||
    (scope === "users" && areSortStatesEqual(profileSort, DEFAULT_PROFILE_SORT));

  const showTrainingPlanFilters = scope === "trainingPlans";
  const showRouteFilters = scope === "routes";

  return (
    <AppBottomSheet
      visible={visible}
      title="Sort & Filters"
      description={`Refine the ${getScopeNoun(scope)} list.`}
      onClose={onClose}
      snapPoints={DISCOVER_FILTER_SHEET_SNAP_POINTS}
      initialSnapIndex={0}
      contentPaddingBottom={156}
      testID="discover-filter-sheet"
      footer={
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={onReset}
            activeOpacity={0.85}
            disabled={isResetDisabled}
            testID="discover-filter-reset"
            className={`flex-1 items-center justify-center rounded-2xl border px-4 py-3 ${
              isResetDisabled ? "border-border bg-muted/40" : "border-border bg-background"
            }`}
          >
            <Text className="text-sm font-medium text-foreground">Reset</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onApply}
            activeOpacity={0.85}
            disabled={validationErrors.length > 0}
            testID="discover-filter-apply"
            className={`flex-1 items-center justify-center rounded-2xl px-4 py-3 ${
              validationErrors.length > 0 ? "bg-muted" : "bg-primary"
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                validationErrors.length > 0 ? "text-muted-foreground" : "text-primary-foreground"
              }`}
            >
              Apply
            </Text>
          </TouchableOpacity>
        </View>
      }
    >
      {validationErrors.length > 0 ? (
        <View className="mb-4 gap-1 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-3">
          {validationErrors.map((error) => (
            <Text key={error} className="text-xs text-destructive">
              {error}
            </Text>
          ))}
        </View>
      ) : null}

      {scope === "activityPlans" ? (
        <View className="gap-3">
          <FilterSection title="Sort">
            <SortFieldSelector
              options={[
                {
                  label: "Created",
                  value: "created_at",
                  testID: "discover-filter-sort-field-created-at",
                },
                {
                  label: "Estimated duration",
                  value: "estimated_duration",
                  testID: "discover-filter-sort-field-duration",
                },
                {
                  label: "Estimated TSS",
                  value: "estimated_tss",
                  testID: "discover-filter-sort-field-tss",
                },
                {
                  label: "Estimated IF",
                  value: "intensity_factor",
                  testID: "discover-filter-sort-field-if",
                },
              ]}
              value={activityPlanSort.field}
              onChange={(value) =>
                onActivityPlanSortChange({
                  ...activityPlanSort,
                  field: value as ActivityPlanSortField,
                })
              }
            />
            <DirectionToggle
              direction={activityPlanSort.direction}
              onChange={(direction) => onActivityPlanSortChange({ ...activityPlanSort, direction })}
            />
          </FilterSection>

          <FilterSection title="Activity plan type">
            <View className="flex-row flex-wrap gap-2">
              {ACTIVITY_CATEGORY_OPTIONS.map((category) => (
                <FilterChip
                  key={category.id}
                  label={category.label}
                  isActive={activityPlanFilters.categoryIds.includes(category.id)}
                  onPress={() =>
                    onActivityPlanFiltersChange({
                      ...activityPlanFilters,
                      categoryIds: activityPlanFilters.categoryIds.includes(category.id)
                        ? activityPlanFilters.categoryIds.filter((id) => id !== category.id)
                        : [...activityPlanFilters.categoryIds, category.id],
                    })
                  }
                  testID={`discover-filter-activityPlans-category-${category.id}`}
                />
              ))}
            </View>
          </FilterSection>

          <FilterSection title="Estimated duration">
            <RangeInputRow
              minValue={activityPlanFilters.minDurationMinutes}
              maxValue={activityPlanFilters.maxDurationMinutes}
              onMinChange={(value) =>
                onActivityPlanFiltersChange({
                  ...activityPlanFilters,
                  minDurationMinutes: parseNumericInput(value),
                })
              }
              onMaxChange={(value) =>
                onActivityPlanFiltersChange({
                  ...activityPlanFilters,
                  maxDurationMinutes: parseNumericInput(value),
                })
              }
              minPlaceholder="Min minutes"
              maxPlaceholder="Max minutes"
              unitLabel="minutes"
              testIDPrefix="discover-filter-activityPlans-duration"
            />
          </FilterSection>

          <FilterSection title="Estimated TSS">
            <RangeInputRow
              minValue={activityPlanFilters.minTss}
              maxValue={activityPlanFilters.maxTss}
              onMinChange={(value) =>
                onActivityPlanFiltersChange({
                  ...activityPlanFilters,
                  minTss: parseNumericInput(value),
                })
              }
              onMaxChange={(value) =>
                onActivityPlanFiltersChange({
                  ...activityPlanFilters,
                  maxTss: parseNumericInput(value),
                })
              }
              minPlaceholder="Min TSS"
              maxPlaceholder="Max TSS"
              unitLabel="stress score"
              testIDPrefix="discover-filter-activityPlans-tss"
            />
          </FilterSection>

          <FilterSection title="Intensity factor">
            <RangeInputRow
              minValue={activityPlanFilters.minIf}
              maxValue={activityPlanFilters.maxIf}
              onMinChange={(value) =>
                onActivityPlanFiltersChange({
                  ...activityPlanFilters,
                  minIf: parseNumericInput(value, { allowDecimal: true }),
                })
              }
              onMaxChange={(value) =>
                onActivityPlanFiltersChange({
                  ...activityPlanFilters,
                  maxIf: parseNumericInput(value, { allowDecimal: true }),
                })
              }
              minPlaceholder="Min IF"
              maxPlaceholder="Max IF"
              decimals={2}
              unitLabel="intensity factor"
              testIDPrefix="discover-filter-activityPlans-if"
            />
          </FilterSection>
        </View>
      ) : null}

      {showTrainingPlanFilters ? (
        <View className="gap-3">
          <FilterSection title="Sort">
            <SortFieldSelector
              options={[
                {
                  label: "Created",
                  value: "created_at",
                  testID: "discover-filter-sort-field-created-at",
                },
                {
                  label: "Duration",
                  value: "duration_weeks",
                  testID: "discover-filter-sort-field-duration",
                },
                {
                  label: "Sessions",
                  value: "sessions_per_week",
                  testID: "discover-filter-sort-field-sessions",
                },
              ]}
              value={trainingPlanSort.field}
              onChange={(value) =>
                onTrainingPlanSortChange({
                  ...trainingPlanSort,
                  field: value as TrainingPlanSortField,
                })
              }
            />
            <DirectionToggle
              direction={trainingPlanSort.direction}
              onChange={(direction) => onTrainingPlanSortChange({ ...trainingPlanSort, direction })}
            />
          </FilterSection>

          <FilterSection title="Training plan sport">
            <View className="flex-row flex-wrap gap-2">
              {TRAINING_PLAN_SPORT_OPTIONS.map((option) => (
                <FilterChip
                  key={option.id}
                  label={option.label}
                  isActive={trainingPlanFilters.sport === option.id}
                  onPress={() =>
                    onTrainingPlanFiltersChange({
                      ...trainingPlanFilters,
                      sport: trainingPlanFilters.sport === option.id ? null : option.id,
                    })
                  }
                  testID={`discover-filter-trainingPlans-sport-${option.id}`}
                />
              ))}
            </View>
          </FilterSection>

          <FilterSection title="Experience">
            <View className="flex-row flex-wrap gap-2">
              {TRAINING_PLAN_EXPERIENCE_OPTIONS.map((option) => (
                <FilterChip
                  key={option.id}
                  label={option.label}
                  isActive={trainingPlanFilters.experienceLevel === option.id}
                  onPress={() =>
                    onTrainingPlanFiltersChange({
                      ...trainingPlanFilters,
                      experienceLevel:
                        trainingPlanFilters.experienceLevel === option.id ? null : option.id,
                    })
                  }
                  testID={`discover-filter-trainingPlans-experience-${option.id}`}
                />
              ))}
            </View>
          </FilterSection>

          <FilterSection title="Duration weeks">
            <RangeInputRow
              minValue={trainingPlanFilters.minWeeks}
              maxValue={trainingPlanFilters.maxWeeks}
              onMinChange={(value) =>
                onTrainingPlanFiltersChange({
                  ...trainingPlanFilters,
                  minWeeks: parseNumericInput(value),
                })
              }
              onMaxChange={(value) =>
                onTrainingPlanFiltersChange({
                  ...trainingPlanFilters,
                  maxWeeks: parseNumericInput(value),
                })
              }
              minPlaceholder="Min weeks"
              maxPlaceholder="Max weeks"
              unitLabel="weeks"
              testIDPrefix="discover-filter-trainingPlans-weeks"
            />
          </FilterSection>

          <FilterSection title="Sessions per week">
            <RangeInputRow
              minValue={trainingPlanFilters.minSessionsPerWeek}
              maxValue={trainingPlanFilters.maxSessionsPerWeek}
              onMinChange={(value) =>
                onTrainingPlanFiltersChange({
                  ...trainingPlanFilters,
                  minSessionsPerWeek: parseNumericInput(value),
                })
              }
              onMaxChange={(value) =>
                onTrainingPlanFiltersChange({
                  ...trainingPlanFilters,
                  maxSessionsPerWeek: parseNumericInput(value),
                })
              }
              minPlaceholder="Min sessions"
              maxPlaceholder="Max sessions"
              unitLabel="sessions per week"
              testIDPrefix="discover-filter-trainingPlans-sessions"
            />
          </FilterSection>
        </View>
      ) : null}

      {showRouteFilters ? (
        <View className="gap-3">
          <FilterSection title="Sort">
            <SortFieldSelector
              options={[
                {
                  label: "Created",
                  value: "created_at",
                  testID: "discover-filter-sort-field-created-at",
                },
                {
                  label: "Distance",
                  value: "distance",
                  testID: "discover-filter-sort-field-distance",
                },
                {
                  label: "Ascent",
                  value: "ascent",
                  testID: "discover-filter-sort-field-ascent",
                },
              ]}
              value={routeSort.field}
              onChange={(value) =>
                onRouteSortChange({ ...routeSort, field: value as RouteSortField })
              }
            />
            <DirectionToggle
              direction={routeSort.direction}
              onChange={(direction) => onRouteSortChange({ ...routeSort, direction })}
            />
          </FilterSection>

          <FilterSection title="Distance">
            <RangeInputRow
              minValue={routeFilters.minDistanceKm}
              maxValue={routeFilters.maxDistanceKm}
              onMinChange={(value) =>
                onRouteFiltersChange({
                  ...routeFilters,
                  minDistanceKm: parseNumericInput(value, { allowDecimal: true }),
                })
              }
              onMaxChange={(value) =>
                onRouteFiltersChange({
                  ...routeFilters,
                  maxDistanceKm: parseNumericInput(value, { allowDecimal: true }),
                })
              }
              minPlaceholder="Min km"
              maxPlaceholder="Max km"
              decimals={2}
              unitLabel="kilometers"
              testIDPrefix="discover-filter-routes-distance"
            />
          </FilterSection>

          <FilterSection title="Ascent">
            <RangeInputRow
              minValue={routeFilters.minAscentM}
              maxValue={routeFilters.maxAscentM}
              onMinChange={(value) =>
                onRouteFiltersChange({
                  ...routeFilters,
                  minAscentM: parseNumericInput(value),
                })
              }
              onMaxChange={(value) =>
                onRouteFiltersChange({
                  ...routeFilters,
                  maxAscentM: parseNumericInput(value),
                })
              }
              minPlaceholder="Min ascent m"
              maxPlaceholder="Max ascent m"
              unitLabel="meters"
              testIDPrefix="discover-filter-routes-ascent"
            />
          </FilterSection>
        </View>
      ) : null}

      {scope === "users" ? (
        <View className="gap-3">
          <FilterSection title="Sort">
            <SortFieldSelector
              options={[
                {
                  label: "Created",
                  value: "created_at",
                  testID: "discover-filter-sort-field-created-at",
                },
                {
                  label: "Username",
                  value: "username",
                  testID: "discover-filter-sort-field-username",
                },
              ]}
              value={profileSort.field}
              onChange={(value) =>
                onProfileSortChange({ ...profileSort, field: value as ProfileSortField })
              }
            />
            <DirectionToggle
              direction={profileSort.direction}
              onChange={(direction) => onProfileSortChange({ ...profileSort, direction })}
            />
          </FilterSection>
        </View>
      ) : null}
    </AppBottomSheet>
  );
}

function FilterChip({
  label,
  isActive,
  onPress,
  testID,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      testID={testID}
      className={`rounded-full border px-3 py-2 ${
        isActive ? "border-primary bg-primary/10" : "border-border bg-background"
      }`}
    >
      <Text
        className={`text-xs font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2.5 rounded-2xl border border-border/70 bg-card/60 px-3 py-3">
      <Text className="text-sm font-semibold text-foreground">{title}</Text>
      {children}
    </View>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: string; testID?: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View className="flex-row rounded-xl border border-border/80 bg-muted/35 p-1">
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange(option.value)}
            activeOpacity={0.85}
            testID={option.testID}
            className={`flex-1 items-center justify-center rounded-lg px-3 py-2 ${
              isActive ? "bg-background" : "bg-transparent"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SortFieldSelector({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: string; testID?: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Sort field
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <FilterChip
            key={option.value}
            label={option.label}
            isActive={value === option.value}
            onPress={() => onChange(option.value)}
            testID={option.testID}
          />
        ))}
      </View>
    </View>
  );
}

function DirectionToggle({
  direction,
  onChange,
}: {
  direction: SortDirection;
  onChange: (direction: SortDirection) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Direction
      </Text>
      <SegmentedControl
        options={[
          { label: "Ascending", value: "asc", testID: "discover-filter-sort-direction-asc" },
          { label: "Descending", value: "desc", testID: "discover-filter-sort-direction-desc" },
        ]}
        value={direction}
        onChange={(value) => onChange(value as SortDirection)}
      />
    </View>
  );
}

function RangeInputRow({
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  minPlaceholder,
  maxPlaceholder,
  unitLabel,
  testIDPrefix,
  decimals = 0,
}: {
  minValue: number | null;
  maxValue: number | null;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  minPlaceholder: string;
  maxPlaceholder: string;
  unitLabel?: string;
  testIDPrefix: string;
  decimals?: number;
}) {
  return (
    <View className="gap-2">
      {unitLabel ? <Text className="text-[11px] text-muted-foreground">{unitLabel}</Text> : null}
      <View className="flex-row gap-2.5">
        <View className="flex-1">
          <BoundedNumberInput
            decimals={decimals}
            label="Min"
            onChange={onMinChange}
            placeholder={minPlaceholder}
            testID={`${testIDPrefix}-min`}
            value={minValue?.toString() ?? ""}
          />
        </View>
        <View className="flex-1">
          <BoundedNumberInput
            decimals={decimals}
            label="Max"
            onChange={onMaxChange}
            placeholder={maxPlaceholder}
            testID={`${testIDPrefix}-max`}
            value={maxValue?.toString() ?? ""}
          />
        </View>
      </View>
      <Text className="text-[11px] text-muted-foreground">Leave blank to keep the range open.</Text>
    </View>
  );
}
