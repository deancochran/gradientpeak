import { type CalendarDayVisualState, describeCalendarDayVisualState } from "@repo/core/calendar";
import { cn } from "@repo/ui/lib/cn";

function CalendarDateMark({
  day,
  state,
  today,
}: {
  day: number;
  state: CalendarDayVisualState;
  today: boolean;
}) {
  if (state.signal.kind === "rest") {
    return (
      <span
        className={cn("text-base font-semibold", today ? "text-primary" : "text-foreground")}
        data-testid={`calendar-day-number-${day}`}
      >
        {day}
      </span>
    );
  }

  return (
    <span className="relative flex size-11 items-center justify-center">
      {state.signal.kind === "goal" ? (
        <span
          className="absolute inset-0 z-10 overflow-hidden rounded-full border-2 border-yellow-200 bg-amber-500 shadow-[inset_0_-4px_0_rgb(180_83_9_/_0.28),0_0_10px_rgb(245_158_11_/_0.3)]"
          data-signal="goal"
        >
          <span className="absolute left-2 top-1.5 h-1.5 w-4 -rotate-12 rounded-full bg-yellow-100/80" />
        </span>
      ) : null}

      {state.signal.kind === "planned" ? (
        <span
          className={cn(
            "absolute inset-0 rounded-full border-2 border-blue-500",
            state.signal.loadDepth === "unknown" && "opacity-40",
          )}
          data-signal="planned"
        />
      ) : null}

      {state.signal.kind === "completed" ? (
        <span
          className={cn(
            "absolute inset-0 rounded-full border-2 border-emerald-400 bg-emerald-500",
            state.signal.loadDepth === "unknown" && "opacity-40",
          )}
          data-signal="completed"
        />
      ) : null}

      {state.signal.kind === "completed_with_unaccounted_plan" ? (
        <span
          className={cn(
            "absolute inset-0 flex overflow-hidden rounded-full",
            state.signal.loadDepth === "unknown" && "opacity-40",
          )}
          data-signal="completed-with-unaccounted-plan"
        >
          <span
            className={cn(
              "h-full flex-1 rounded-l-full border-y-2 border-l-2 border-r-0 border-y-emerald-500 border-l-emerald-500",
            )}
            data-signal-half="completed"
          />
          <span
            className={cn(
              "h-full flex-1 rounded-r-full border-y-2 border-r-2 border-l-0 border-y-blue-500 border-r-blue-500",
            )}
            data-signal-half="planned"
          />
        </span>
      ) : null}

      <span
        className={cn(
          "relative z-20 text-base font-bold",
          state.signal.kind === "goal"
            ? "text-slate-950"
            : state.signal.kind === "completed"
              ? "text-white"
              : "text-foreground",
        )}
        data-testid={`calendar-day-number-${day}`}
      >
        {day}
      </span>
    </span>
  );
}

export function CalendarDayVisual({
  day,
  decorative = false,
  muted = false,
  selected = false,
  state,
  today = false,
}: {
  day: number;
  decorative?: boolean;
  muted?: boolean;
  selected?: boolean;
  state: CalendarDayVisualState;
  today?: boolean;
}) {
  return (
    <div
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : describeCalendarDayVisualState(state)}
      className={cn(
        "flex size-14 items-center justify-center rounded-full border-2",
        selected ? "border-primary" : "border-transparent",
        muted && "opacity-35",
      )}
      data-load-depth={state.signal.loadDepth}
      data-signal={state.signal.kind}
      role="img"
    >
      <CalendarDateMark day={day} state={state} today={today} />
    </div>
  );
}
