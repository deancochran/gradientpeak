/**
 * Focus Mode Context
 *
 * Manages focus state for the recording screen, enforcing mutual exclusivity
 * between zone focus (A, B, C) and footer expansion.
 *
 * Focus States:
 * - 'none': No element is focused (default state)
 * - 'zone-a': Zone A (Map) is focused, filling screen except footer
 * - 'zone-b': Zone B (Plan) is focused, filling screen except footer
 * - 'zone-c': Zone C (Metrics) is focused, filling screen except footer
 * - 'footer': Footer is expanded to 60% screen height
 *
 * Mutual Exclusivity:
 * - Only one element can be focused at a time
 * - Transitioning to a new focus automatically clears the previous focus
 * - Sequential animations: collapse current → expand new (handled by consumers)
 *
 * Previous State Tracking:
 * - Tracks the last focus state for minimize button behavior
 * - Allows "minimize" to return to 'none' state
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

/**
 * Focus Mode State Type
 * Represents which element is currently focused
 */
export type FocusModeState =
  | "none"
  | "zone-a"
  | "zone-b"
  | "zone-c"
  | "footer";

/**
 * Focus Mode Context Value
 */
interface FocusModeContextValue {
  /** Current focus state */
  focusState: FocusModeState;

  /** Previous focus state (for minimize behavior) */
  previousFocusState: FocusModeState;

  /** Focus Zone A (Map) - clears other focus states */
  focusZoneA: () => void;

  /** Focus Zone B (Plan) - clears other focus states */
  focusZoneB: () => void;

  /** Focus Zone C (Metrics) - clears other focus states */
  focusZoneC: () => void;

  /** Focus Footer (Expanded) - clears other focus states */
  focusFooter: () => void;

  /** Clear all focus (return to normal state) */
  clearFocus: () => void;

  /** Check if any zone is currently focused */
  isAnyZoneFocused: () => boolean;

  /** Check if a specific zone is focused */
  isZoneFocused: (zone: "zone-a" | "zone-b" | "zone-c") => boolean;

  /**
   * Focus a zone with coordination (handles footer collapse if needed)
   * @param zone - Which zone to focus
   * @param onCollapseFooter - Callback to collapse footer (returns Promise)
   */
  focusZoneWithCoordination: (
    zone: "zone-a" | "zone-b" | "zone-c",
    onCollapseFooter?: () => Promise<void>
  ) => Promise<void>;

  /**
   * Focus footer with coordination (handles zone minimize if needed)
   * @param onClearZoneFocus - Callback to handle zone clear animation (returns Promise)
   */
  focusFooterWithCoordination: (
    onClearZoneFocus?: () => Promise<void>
  ) => Promise<void>;
}

/**
 * Focus Mode Context
 */
const FocusModeContext = createContext<FocusModeContextValue | undefined>(
  undefined,
);

/**
 * Focus Mode Provider Props
 */
interface FocusModeProviderProps {
  children: ReactNode;
}

/**
 * Focus Mode Provider Component
 *
 * Wrap the recording screen with this provider to enable focus mode state management.
 *
 * Example:
 * ```tsx
 * <FocusModeProvider>
 *   <RecordingScreen />
 * </FocusModeProvider>
 * ```
 */
export function FocusModeProvider({ children }: FocusModeProviderProps) {
  const [focusState, setFocusState] = useState<FocusModeState>("none");
  const [previousFocusState, setPreviousFocusState] =
    useState<FocusModeState>("none");

  /**
   * Helper to update focus state with previous state tracking
   */
  const updateFocusState = useCallback((newState: FocusModeState) => {
    setFocusState((current) => {
      // Track previous state (but don't track 'none' as previous)
      if (current !== "none") {
        setPreviousFocusState(current);
      }
      return newState;
    });
  }, []);

  /**
   * Focus Zone A (Map)
   */
  const focusZoneA = useCallback(() => {
    updateFocusState("zone-a");
  }, [updateFocusState]);

  /**
   * Focus Zone B (Plan)
   */
  const focusZoneB = useCallback(() => {
    updateFocusState("zone-b");
  }, [updateFocusState]);

  /**
   * Focus Zone C (Metrics)
   */
  const focusZoneC = useCallback(() => {
    updateFocusState("zone-c");
  }, [updateFocusState]);

  /**
   * Focus Footer (Expanded)
   */
  const focusFooter = useCallback(() => {
    updateFocusState("footer");
  }, [updateFocusState]);

  /**
   * Clear all focus (return to normal state)
   */
  const clearFocus = useCallback(() => {
    updateFocusState("none");
  }, [updateFocusState]);

  /**
   * Check if any zone is currently focused
   */
  const isAnyZoneFocused = useCallback(() => {
    return (
      focusState === "zone-a" ||
      focusState === "zone-b" ||
      focusState === "zone-c"
    );
  }, [focusState]);

  /**
   * Check if a specific zone is focused
   */
  const isZoneFocused = useCallback(
    (zone: "zone-a" | "zone-b" | "zone-c") => {
      return focusState === zone;
    },
    [focusState],
  );

  /**
   * Focus a zone with coordination
   * If footer is expanded, collapses it first (200ms), then focuses the zone
   */
  const focusZoneWithCoordination = useCallback(
    async (
      zone: "zone-a" | "zone-b" | "zone-c",
      onCollapseFooter?: () => Promise<void>,
    ) => {
      // Check if footer is currently focused (expanded)
      if (focusState === "footer" && onCollapseFooter) {
        // Collapse footer first
        await onCollapseFooter();
        // Wait 200ms for footer collapse animation
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Now focus the requested zone
      updateFocusState(zone);
    },
    [focusState, updateFocusState],
  );

  /**
   * Focus footer with coordination
   * If any zone is focused, minimizes it first (300ms), then focuses footer
   */
  const focusFooterWithCoordination = useCallback(
    async (onClearZoneFocus?: () => Promise<void>) => {
      // Check if any zone is currently focused
      const zoneFocused =
        focusState === "zone-a" ||
        focusState === "zone-b" ||
        focusState === "zone-c";

      if (zoneFocused && onClearZoneFocus) {
        // Clear zone focus first (triggers minimize animation)
        clearFocus();
        // Wait 300ms for zone minimize animation
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Call optional callback for additional cleanup
        if (onClearZoneFocus) {
          await onClearZoneFocus();
        }
      }

      // Now focus footer
      updateFocusState("footer");
    },
    [focusState, clearFocus, updateFocusState],
  );

  const value: FocusModeContextValue = {
    focusState,
    previousFocusState,
    focusZoneA,
    focusZoneB,
    focusZoneC,
    focusFooter,
    clearFocus,
    isAnyZoneFocused,
    isZoneFocused,
    focusZoneWithCoordination,
    focusFooterWithCoordination,
  };

  return (
    <FocusModeContext.Provider value={value}>
      {children}
    </FocusModeContext.Provider>
  );
}

/**
 * Hook to access Focus Mode Context
 *
 * Must be used within a FocusModeProvider.
 *
 * Example:
 * ```tsx
 * function MyComponent() {
 *   const { focusState, focusZoneA, clearFocus } = useFocusMode();
 *
 *   return (
 *     <View>
 *       <Text>Current focus: {focusState}</Text>
 *       <Button onPress={focusZoneA}>Focus Map</Button>
 *       <Button onPress={clearFocus}>Minimize</Button>
 *     </View>
 *   );
 * }
 * ```
 */
export function useFocusMode(): FocusModeContextValue {
  const context = useContext(FocusModeContext);

  if (context === undefined) {
    throw new Error("useFocusMode must be used within a FocusModeProvider");
  }

  return context;
}
