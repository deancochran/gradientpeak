import { formatActivityPlanPrintDuration } from "@repo/core/activity-plan";
import {
  createSimulationDefinition,
  createSimulationState,
  reduceSimulation,
  SIMULATION_MULTIPLIERS,
  type SimulationCommand,
  type SimulationDefinition,
} from "@repo/core/recording/simulation";
import { simulationPositionAt } from "@repo/core/recording/simulation-route";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Form, FormBoundedNumberField } from "@repo/ui/components/form";
import { useZodFormSubmit } from "@repo/ui/hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { GeographicRouteMap } from "../recording/geographic-route-map";

export function PlanRouteSimulator({
  planSnapshot,
  coordinates,
  loading,
  error,
  onLockChange,
}: {
  planSnapshot?: unknown;
  coordinates?: unknown;
  loading: boolean;
  error: string | null;
  onLockChange: (locked: boolean) => void;
}) {
  const [definition, setDefinition] = useState<SimulationDefinition | null>(null);
  const form = useForm<{ speedKph: number | null; multiplier: number }>({
    defaultValues: { speedKph: null, multiplier: 1 },
  });
  const submit = useZodFormSubmit({
    form,
    shouldRethrow: false,
    onSubmit: ({ speedKph, multiplier }: { speedKph: number | null; multiplier: number }) => {
      if (loading || error) throw new Error(error ?? "Wait for the selected resources to load.");
      if (speedKph === null) throw new Error("Enter an explicit virtual speed assumption.");
      setDefinition(
        createSimulationDefinition({
          assumptions: { virtualSpeedMps: speedKph / 3.6, clockMultiplier: multiplier },
          ...(planSnapshot === undefined ? {} : { planSnapshot }),
          ...(coordinates === undefined ? {} : { coordinates }),
        }),
      );
    },
  });
  return (
    <Card data-testid="plan-route-simulation">
      <CardHeader>
        <div className="flex gap-2">
          <Badge>Simulation</Badge>
          <Badge variant="outline">Synthetic · display only</Badge>
        </div>
        <CardTitle role="heading" aria-level={2}>
          Plan and route simulation
        </CardTitle>
        <CardDescription>
          Uses your virtual speed assumption, not an athlete prediction. No Bluetooth connections,
          trainer commands, recording queue, activity saves, or calendar/history updates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {definition ? (
          <SimulationRun
            definition={definition}
            onEdit={() => setDefinition(null)}
            onLockChange={onLockChange}
          />
        ) : (
          <Form {...form}>
            <form className="space-y-4" onSubmit={submit.handleSubmit} noValidate>
              {loading ? <p role="status">Loading simulation resources…</p> : null}
              {error ? <p role="alert">{error}</p> : null}
              <FormBoundedNumberField
                control={form.control}
                name="speedKph"
                label="Virtual speed assumption"
                unitLabel="km/h"
                min={0}
                max={200}
                decimals={1}
                emptyValue={null}
                required
                rules={{ required: "Enter a virtual speed assumption." }}
                disabled={loading}
                helperText="Explicit synthetic travel during activity steps; rest and transition segments are stationary."
              />
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Clock multiplier</legend>
                <div className="flex flex-wrap gap-2">
                  {SIMULATION_MULTIPLIERS.map((value) => (
                    <Button
                      type="button"
                      key={value}
                      variant="outline"
                      aria-pressed={form.watch("multiplier") === value}
                      onClick={() => form.setValue("multiplier", value)}
                    >
                      {value}×
                    </Button>
                  ))}
                </div>
              </fieldset>
              <p className="text-sm text-muted-foreground">
                The plan ends the simulation when all steps are processed. A shorter route clamps at
                its endpoint while the plan continues. Route-only runs stop at the route end.
                Simulations have a 30-virtual-day safety limit.
              </p>
              {submit.submitError ? <p role="alert">{submit.submitError.message}</p> : null}
              <Button type="submit" disabled={loading || Boolean(error) || submit.isSubmitting}>
                Start simulation
              </Button>
            </form>
          </Form>
        )}
        {definition && error ? (
          <p role="alert">
            Resource refresh unavailable. This simulation retains its frozen inputs: {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function useSimulationRun(definition: SimulationDefinition) {
  const [state, setState] = useState(() =>
    reduceSimulation(definition, createSimulationState(definition), { type: "start" }),
  );
  const current = useRef(state);
  const lastWall = useRef<number | null>(null);
  const alive = useRef(true);
  const dispatch = useCallback(
    (command: SimulationCommand, settle = true) => {
      if (!alive.current) return;
      if (
        (command.type === "start" || command.type === "resume") &&
        document.visibilityState === "hidden"
      )
        return;
      const now = performance.now();
      let next = current.current;
      if (settle && next.status === "running" && lastWall.current !== null)
        next = reduceSimulation(definition, next, {
          type: "tick",
          wallDeltaMs: Math.max(0, now - lastWall.current),
        });
      lastWall.current = now;
      next = reduceSimulation(definition, next, command);
      current.current = next;
      setState(next);
    },
    [definition],
  );
  useEffect(() => {
    alive.current = true;
    const hidden = () => {
      if (document.visibilityState === "hidden") dispatch({ type: "pause" }, false);
    };
    const pageHide = () => dispatch({ type: "pause" }, false);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pageHide);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", pageHide);
    };
  }, [dispatch]);
  useEffect(() => {
    if (state.status !== "running") return;
    if (document.visibilityState === "hidden") {
      dispatch({ type: "pause" }, false);
      return;
    }
    lastWall.current = performance.now();
    let request = 0;
    let published = -Infinity;
    const tick = (now: number) => {
      if (!alive.current || current.current.status !== "running") return;
      if (document.visibilityState === "hidden") {
        dispatch({ type: "pause" }, false);
        return;
      }
      const next = reduceSimulation(definition, current.current, {
        type: "tick",
        wallDeltaMs: Math.max(0, now - (lastWall.current ?? now)),
      });
      lastWall.current = now;
      current.current = next;
      if (now - published >= 100 || next.status === "finished") {
        published = now;
        setState(next);
      }
      if (next.status === "running") request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [definition, dispatch, state.status]);
  return { state, dispatch };
}

function SimulationRun({
  definition,
  onEdit,
  onLockChange,
}: {
  definition: SimulationDefinition;
  onEdit: () => void;
  onLockChange: (locked: boolean) => void;
}) {
  const { state, dispatch } = useSimulationRun(definition);
  const occurrence =
    state.occurrenceIndex === null
      ? null
      : (definition.plan?.occurrences[state.occurrenceIndex] ?? null);
  const next =
    state.occurrenceIndex === null
      ? null
      : (definition.plan?.occurrences[state.occurrenceIndex + 1] ?? null);
  const position = definition.route
    ? simulationPositionAt(definition.route, state.travelMeters)
    : null;
  useEffect(() => {
    onLockChange(state.status === "running" || state.status === "paused");
    return () => onLockChange(false);
  }, [onLockChange, state.status]);
  const manual =
    occurrence?.duration.type === "repetitions" || occurrence?.duration.type === "untilFinished";
  const finishMessage =
    state.finishReason === "plan_complete"
      ? "Plan processed. Simulation ended; remaining route distance is not simulated."
      : state.finishReason === "route_complete"
        ? "Route end reached. Simulation ended."
        : state.finishReason === "time_limit"
          ? "Virtual time limit reached. Simulation ended."
          : state.finishReason === "user_stopped"
            ? "Simulation ended by you; unfinished steps remain unfinished."
            : state.status === "paused"
              ? "Simulation paused."
              : state.status === "ready"
                ? "Simulation reset. Ready to start."
                : "Simulation running.";
  return (
    <div className="space-y-4">
      <p role="status">{finishMessage}</p>
      <div className="flex flex-wrap gap-2">
        {state.status === "running" ? (
          <Button onClick={() => dispatch({ type: "pause" })}>Pause simulation</Button>
        ) : state.status === "paused" ? (
          <Button
            onClick={() => {
              if (document.visibilityState !== "hidden") dispatch({ type: "resume" }, false);
            }}
          >
            Resume simulation
          </Button>
        ) : state.status === "ready" ? (
          <Button onClick={() => dispatch({ type: "start" }, false)}>Start simulation</Button>
        ) : null}
        <Button variant="outline" onClick={() => dispatch({ type: "restart" }, false)}>
          Restart simulation
        </Button>
        <Button variant="outline" onClick={onEdit}>
          Change assumptions
        </Button>
        <Button
          variant="outline"
          disabled={state.status !== "running" && state.status !== "paused"}
          onClick={() => dispatch({ type: "finish" })}
        >
          End simulation
        </Button>
      </div>
      <dl aria-live="off" className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt>Simulated elapsed</dt>
          <dd data-testid="simulation-elapsed">{(state.elapsedMs / 1000).toFixed(1)} s</dd>
        </div>
        <div>
          <dt>Virtual travel</dt>
          <dd data-testid="simulation-travel">{state.travelMeters.toFixed(1)} m</dd>
        </div>
        <div>
          <dt>Speed assumption</dt>
          <dd>{(definition.assumptions.virtualSpeedMps * 3.6).toFixed(1)} km/h</dd>
        </div>
        <div>
          <dt>Clock multiplier</dt>
          <dd>{definition.assumptions.clockMultiplier}×</dd>
        </div>
      </dl>
      {definition.planSnapshot ? (
        <p className="text-sm text-muted-foreground">
          Frozen plan: {definition.planSnapshot.name}, revision{" "}
          {definition.planSnapshot.activityPlanRevision}
          {definition.planSnapshot.plannedSession
            ? ` · calendar session revision ${definition.planSnapshot.plannedSession.sessionRevision}`
            : ""}
          .
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Guidance label="Current step" definition={definition} occurrence={occurrence} />
        <Guidance label="Upcoming step" definition={definition} occurrence={next} />
      </div>
      {occurrence ? (
        <div className="space-y-2">
          <p className="text-sm" aria-live="off">
            Step progress: {(state.occurrenceElapsedMs / 1000).toFixed(1)} virtual seconds ·{" "}
            {state.occurrenceDistanceMeters.toFixed(1)} virtual meters.
          </p>
          <div className="flex gap-2">
            <Button
              disabled={!manual || (state.status !== "running" && state.status !== "paused")}
              onClick={() => dispatch({ type: "complete", occurrenceId: occurrence.occurrenceId })}
            >
              Complete manual step
            </Button>
            <Button
              variant="outline"
              disabled={state.status !== "running" && state.status !== "paused"}
              onClick={() => dispatch({ type: "skip", occurrenceId: occurrence.occurrenceId })}
            >
              Skip simulated step
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Time and distance steps advance from the virtual clock/travel. Repetitions and open
            steps require your explicit completion or skip.
          </p>
        </div>
      ) : null}
      {definition.route && position ? (
        <div className="space-y-2" aria-live="off">
          <GeographicRouteMap
            coordinates={definition.route.points}
            currentPosition={position}
            currentPositionLabel="Synthetic position from your virtual speed assumption; not GPS."
            fallback={<SimulationMap route={definition.route} position={position} />}
            routeKey={`simulation:${definition.route.points.length}:${definition.route.totalDistanceMeters}`}
          />
          <p data-testid="simulation-route-progress">
            Synthetic route progress: {position.distanceMeters.toFixed(1)} /{" "}
            {definition.route.totalDistanceMeters.toFixed(1)} m (
            {((position.distanceMeters / definition.route.totalDistanceMeters) * 100).toFixed(1)}%).
          </p>
          <p data-testid="simulation-position">
            Synthetic position: {position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}
          </p>
          <p data-testid="simulation-terrain">
            Synthetic elevation:{" "}
            {position.elevationMeters === null
              ? "Unknown"
              : `${position.elevationMeters.toFixed(1)} m`}{" "}
            · Synthetic segment grade:{" "}
            {position.gradePercent === null ? "Unknown" : `${position.gradePercent.toFixed(1)}%`}
          </p>
          {position.routeEnded && state.status !== "finished" ? (
            <p>
              Route end reached. The plan continues with virtual travel; no geometry or grade is
              invented beyond the endpoint.
            </p>
          ) : null}
        </div>
      ) : (
        <p>No route selected. Virtual travel has no geographic position.</p>
      )}
      <p className="text-sm text-muted-foreground">
        All progress and positions here are synthetic. Targets are prescription guidance, not
        measured power, heart rate, speed, or adherence.
      </p>
    </div>
  );
}

function Guidance({
  label,
  definition,
  occurrence,
}: {
  label: string;
  definition: SimulationDefinition;
  occurrence: NonNullable<SimulationDefinition["plan"]>["occurrences"][number] | null;
}) {
  const step = occurrence
    ? definition.planSnapshot?.structure.items
        .flatMap((item) => (item.type === "step" ? [item] : item.steps))
        .find((candidate) => candidate.id === occurrence.stepId)
    : null;
  return (
    <section className="rounded-lg border border-border p-3">
      <h3 className="font-medium">{label}</h3>
      {occurrence ? (
        <>
          <p>{step?.name ?? "Plan step"}</p>
          <p>{formatActivityPlanPrintDuration(occurrence.duration)}</p>
          <p>
            Target guidance:{" "}
            {occurrence.targets.length
              ? occurrence.targets
                  .map((target) =>
                    target.type === "rest" ? "Rest" : `${target.type} ${target.intensity}`,
                  )
                  .join(" · ")
              : "None prescribed"}
          </p>
        </>
      ) : (
        <p>{definition.plan ? "No remaining step" : "Route-only simulation"}</p>
      )}
    </section>
  );
}

function SimulationMap({
  route,
  position,
}: {
  route: NonNullable<SimulationDefinition["route"]>;
  position: NonNullable<ReturnType<typeof simulationPositionAt>>;
}) {
  const plot = useMemo(() => {
    const origin = route.points[0];
    if (!origin) return null;
    const x = (longitude: number) => ((longitude - origin.longitude + 540) % 360) - 180;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const point of route.points) {
      minX = Math.min(minX, x(point.longitude));
      maxX = Math.max(maxX, x(point.longitude));
      minY = Math.min(minY, point.latitude);
      maxY = Math.max(maxY, point.latitude);
    }
    const project = (point: { latitude: number; longitude: number }) => ({
      x: 10 + ((x(point.longitude) - minX) / Math.max(maxX - minX, 0.000001)) * 280,
      y: 190 - ((point.latitude - minY) / Math.max(maxY - minY, 0.000001)) * 180,
    });
    const stride = Math.max(1, Math.ceil(route.points.length / 2000));
    return {
      project,
      points: route.points
        .filter((_, index) => index % stride === 0 || index === route.points.length - 1)
        .map((point) => {
          const value = project(point);
          return `${value.x},${value.y}`;
        })
        .join(" "),
    };
  }, [route]);
  if (!plot) return null;
  const marker = plot.project(position);
  return (
    <figure>
      <figcaption>Synthetic route position · schematic reference geometry</figcaption>
      <svg
        className="h-64 w-full rounded-lg bg-muted/20"
        role="img"
        aria-label="Simulated position on the selected route"
        viewBox="0 0 300 200"
      >
        <polyline
          points={plot.points}
          fill="none"
          stroke="currentColor"
          className="text-muted-foreground"
          strokeWidth={1}
        />
        <circle
          data-testid="simulation-marker"
          data-latitude={position.latitude}
          data-longitude={position.longitude}
          cx={marker.x}
          cy={marker.y}
          r={4}
          fill="currentColor"
          className="text-primary"
        />
      </svg>
      <p className="text-xs text-muted-foreground">
        Position follows the full route distance index using spherical interpolation.
        Grade/elevation require known heights; the backdrop is reduced only for display.
      </p>
    </figure>
  );
}
