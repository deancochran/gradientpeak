import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type CoachAthleteBikeZonesRead,
  loadCoachAthleteBikeZones,
} from "../../../lib/coaching/athlete-zones-server-functions";
import { CoachAthleteZonesCard } from "./coach-athlete-zones";

export type CoachAthleteZonesSectionState =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "denied" }
  | { kind: "granted"; result: Extract<CoachAthleteBikeZonesRead, { status: "granted" }> };

export type CoachAthleteZonesLoaderSnapshot = {
  actorId: string;
  organizationId: string;
  athleteProfileId: string;
  revision: string;
  state: CoachAthleteZonesSectionState;
};

type Props = {
  snapshot: CoachAthleteZonesLoaderSnapshot;
  loadZones?: typeof loadCoachAthleteBikeZones;
};

function fence(snapshot: CoachAthleteZonesLoaderSnapshot) {
  return `${snapshot.actorId}:${snapshot.organizationId}:${snapshot.athleteProfileId}:${snapshot.revision}`;
}

/** Keying scopes pending work to one committed loader lifetime; no initial fetch occurs here. */
export function CoachAthleteZonesSection({
  snapshot,
  loadZones = loadCoachAthleteBikeZones,
}: Props) {
  return <ScopedZonesSection key={fence(snapshot)} snapshot={snapshot} loadZones={loadZones} />;
}

function ScopedZonesSection({ snapshot, loadZones }: Required<Props>) {
  const [local, setLocal] = useState<CoachAthleteZonesSectionState | null>(null);
  const active = useRef(false);
  const mounted = useRef(false);
  const deniedByLoader = snapshot.state.kind === "denied";

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Mask a denial during this render, then poison this keyed instance before paint.
  // A new loader revision remounts it and is the only recovery path.
  useLayoutEffect(() => {
    if (deniedByLoader) {
      setLocal((current) => (current?.kind === "denied" ? current : { kind: "denied" }));
    }
  }, [deniedByLoader]);

  const denied = deniedByLoader || local?.kind === "denied";
  const state = denied ? { kind: "denied" as const } : (local ?? snapshot.state);
  const retry = async () => {
    if (active.current || denied) return;
    active.current = true;
    setLocal({ kind: "loading" });
    try {
      const result = await loadZones({
        data: {
          organizationId: snapshot.organizationId,
          athleteProfileId: snapshot.athleteProfileId,
        },
      });
      if (!mounted.current) return;
      setLocal((current) =>
        current?.kind === "denied"
          ? current
          : result.status === "granted"
            ? { kind: "granted", result }
            : { kind: "denied" },
      );
    } catch {
      if (mounted.current)
        setLocal((current) => (current?.kind === "denied" ? current : { kind: "failed" }));
    } finally {
      active.current = false;
    }
  };

  const identity = {
    organizationId: snapshot.organizationId,
    athleteProfileId: snapshot.athleteProfileId,
  };
  if (state.kind === "granted")
    return <CoachAthleteZonesCard identity={identity} result={state.result} />;
  if (state.kind === "denied")
    return <CoachAthleteZonesCard identity={identity} result={{ status: "forbidden" }} />;
  return (
    <CoachAthleteZonesCard
      identity={identity}
      result={null}
      error={state.kind === "failed"}
      retryPending={state.kind === "loading"}
      onRetry={retry}
    />
  );
}
