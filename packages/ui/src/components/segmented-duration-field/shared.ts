import type { DurationSegmentPolicy, DurationSegments } from "@repo/core/utils/fitness-inputs";
import type { NumericInputResult } from "@repo/core/utils/numeric-ux-policy";

export {
  type DurationSegments,
  formatDurationSeconds,
  parseDurationSegments,
  splitDurationSeconds,
} from "@repo/core/utils/fitness-inputs";

export interface SegmentedDurationValueProps extends DurationSegmentPolicy {
  valueSeconds: number | null | undefined;
  onChangeSeconds: (seconds: number) => void;
  onInvalidChange: (invalid: boolean) => void;
  onInputResult?: ((result: NumericInputResult) => void) | undefined;
  onEmpty?: (() => void) | undefined;
  segments?: DurationSegments | undefined;
  onSegmentsChange?: ((segments: DurationSegments) => void) | undefined;
  label?: string | undefined;
  id?: string | undefined;
  disabled?: boolean | undefined;
  required?: boolean | undefined;
  active?: boolean | undefined;
  isCurrent?: (() => boolean) | undefined;
  onBlur?: (() => void) | undefined;
  resetKey?: string | number | undefined;
  formControl?: object | undefined;
  fieldName?: string | undefined;
  error?: string | undefined;
  accessibilityHint?: string | undefined;
  /** Compact, labelled summary row for a form that owns the surrounding section. */
  triggerVariant?: "input" | "row" | undefined;
}
