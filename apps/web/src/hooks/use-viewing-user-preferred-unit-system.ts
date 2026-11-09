import { useAuth } from "../components/providers/auth-provider";
import { api } from "../lib/api/client";
import {
  type PreferredUnitSystem,
  resolveViewingUserPreferredUnitSystem,
} from "../lib/units/presentation";

export type ViewingUserPreferredUnitSystem = {
  isLoading: boolean;
  unitSystem: PreferredUnitSystem;
};

/** Reads the signed-in viewer's persisted display preference, defaulting through Core. */
export function useViewingUserPreferredUnitSystem(): ViewingUserPreferredUnitSystem {
  const { user, isLoading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = api.profiles.get.useQuery(undefined, {
    enabled: Boolean(user),
  });

  return {
    isLoading: authLoading || (Boolean(user) && profileLoading),
    unitSystem: resolveViewingUserPreferredUnitSystem(profile?.preferred_units),
  };
}
