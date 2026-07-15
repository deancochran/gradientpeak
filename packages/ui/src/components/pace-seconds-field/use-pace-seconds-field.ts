import { useEffect, useRef, useState } from "react";
import { usePendingFormDraft } from "../../hooks/pending-form-drafts";
import {
  formatSecondsToMmSs,
  normalizePaceInput,
  parseMmSsToSeconds,
} from "../../lib/fitness-inputs";
import type { PaceSecondsFieldProps } from "./shared";

type PaceSecondsDraftProps = Pick<
  PaceSecondsFieldProps,
  "formControl" | "onBlur" | "onChangeSeconds" | "valueSeconds"
>;

const NO_IGNORED_VALUE = Symbol("no ignored pace seconds value");

function formatValue(value: number | null | undefined) {
  return value == null ? "" : formatSecondsToMmSs(value);
}

function usePaceSecondsField({
  formControl,
  onBlur,
  onChangeSeconds,
  valueSeconds,
}: PaceSecondsDraftProps) {
  const [draftValue, setDraftValue] = useState(() => formatValue(valueSeconds));
  const draftValueRef = useRef(draftValue);
  const isDraftPendingRef = useRef(false);
  const valueSecondsRef = useRef(valueSeconds);
  const ignoredValueSyncRef = useRef<number | null | typeof NO_IGNORED_VALUE>(NO_IGNORED_VALUE);
  valueSecondsRef.current = valueSeconds;

  const updateDraftValue = (value: string, pending: boolean) => {
    draftValueRef.current = value;
    isDraftPendingRef.current = pending;
    setDraftValue(value);
  };

  useEffect(() => {
    if (Object.is(ignoredValueSyncRef.current, valueSeconds)) {
      ignoredValueSyncRef.current = NO_IGNORED_VALUE;
      return;
    }

    ignoredValueSyncRef.current = NO_IGNORED_VALUE;
    const nextValue = formatValue(valueSeconds);
    draftValueRef.current = nextValue;
    isDraftPendingRef.current = false;
    setDraftValue(nextValue);
  }, [valueSeconds]);

  const commitDraft = (markTouched: boolean) => {
    const raw = draftValueRef.current.trim();

    if (!raw) {
      isDraftPendingRef.current = false;
      onChangeSeconds(null);
    } else {
      const normalized = normalizePaceInput(raw);
      const seconds = parseMmSsToSeconds(normalized);

      if (normalized && seconds !== undefined) {
        updateDraftValue(normalized, false);
        onChangeSeconds(seconds);
      } else {
        if (valueSecondsRef.current !== null) {
          ignoredValueSyncRef.current = null;
        }
        onChangeSeconds(null);
      }
    }

    if (markTouched) {
      onBlur?.();
    }
  };

  usePendingFormDraft(formControl, {
    commit: () => {
      if (isDraftPendingRef.current) {
        commitDraft(false);
      }
    },
    discard: () => updateDraftValue(formatValue(valueSecondsRef.current), false),
  });

  return {
    draftValue,
    onBlur: () => commitDraft(true),
    onChange: (value: string) => {
      const isEmpty = !value.trim();
      updateDraftValue(value, !isEmpty);
      if (isEmpty) {
        onChangeSeconds(null);
        return;
      }

      const seconds = parseMmSsToSeconds(value);
      if (seconds !== undefined) {
        if (valueSecondsRef.current !== seconds) {
          ignoredValueSyncRef.current = seconds;
        }
        onChangeSeconds(seconds);
      }
    },
  };
}

export { usePaceSecondsField };
