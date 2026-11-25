import { resolvePreferredUnitSystem } from "@repo/core/units";
import { useAuthStore } from "@/lib/stores/auth-store";

/** Returns the authenticated viewer's unit preference, defaulting safely to metric. */
export function usePreferredUnitSystem() {
  const preferredUnits = useAuthStore((state) => state.profile?.preferred_units);
  return resolvePreferredUnitSystem(preferredUnits);
}
