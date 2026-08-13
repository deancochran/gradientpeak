import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export const PLAN_DISPLAY_PREFERENCES_STORAGE_KEY = "gradientpeak-plan-display-preferences";

export type PlanDisplayRange = "daily" | "weekly" | "monthly";

const DEFAULT_RANGE: PlanDisplayRange = "daily";

export function isPlanDisplayRange(value: unknown): value is PlanDisplayRange {
  return value === "daily" || value === "weekly" || value === "monthly";
}

type PlanDisplayPreferences = {
  hydrated: boolean;
  range: PlanDisplayRange;
  pendingRange: PlanDisplayRange | null;
  initialize: () => Promise<void>;
  setRange: (range: PlanDisplayRange) => void;
};

let hydration: Promise<void> | null = null;
let writes = Promise.resolve();

function persistRange(range: PlanDisplayRange) {
  writes = writes
    .catch(() => undefined)
    .then(() =>
      AsyncStorage.setItem(
        PLAN_DISPLAY_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ state: { range }, version: 1 }),
      ),
    );
  return writes;
}

function readPersistedRange(value: string | null): PlanDisplayRange {
  if (!value) return DEFAULT_RANGE;
  try {
    const range = (JSON.parse(value) as { state?: { range?: unknown } }).state?.range;
    return isPlanDisplayRange(range) ? range : DEFAULT_RANGE;
  } catch {
    return DEFAULT_RANGE;
  }
}

export const usePlanDisplayPreferences = create<PlanDisplayPreferences>((set, get) => ({
  hydrated: false,
  range: DEFAULT_RANGE,
  pendingRange: null,
  initialize: () => {
    if (get().hydrated) return Promise.resolve();
    if (hydration !== null) return hydration;
    hydration = AsyncStorage.getItem(PLAN_DISPLAY_PREFERENCES_STORAGE_KEY)
      .then(async (value) => {
        const pendingRange = get().pendingRange;
        const range = pendingRange ?? readPersistedRange(value);
        set({ hydrated: true, pendingRange: null, range });
        if (pendingRange) await persistRange(pendingRange);
      })
      .catch(() => set({ hydrated: true, pendingRange: null, range: DEFAULT_RANGE }))
      .finally(() => {
        hydration = null;
      });
    return hydration;
  },
  setRange: (range) => {
    if (!get().hydrated) {
      set({ pendingRange: range, range });
      return;
    }
    set({ range });
    void persistRange(range);
  },
}));

void usePlanDisplayPreferences.getState().initialize();
