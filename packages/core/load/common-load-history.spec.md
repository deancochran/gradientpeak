# Completed Common Load history specification

**History policy:** `common_load_history_v1`
**History calculation:** `gradientpeak_common_load_history@1`
**Input Common Load:** `gradientpeak_relative_load@1`
**Basis:** `completed_activity_history`

## Inputs, units, and daily basis

- A daily input is the full-precision sum of compatible, completed Common Load points whose
  activity start instant belongs to that athlete planning-calendar date. Common Load is a relative
  load-point quantity; it is not watts, heart-rate load, elapsed time, or a provider score.
- One ordered update is applied per planning-calendar date. The current planning date is excluded.
  The latest 84 complete dates are returned for history display; up to 366 dates may be replayed.
- The zero seed is explicit. A complete 84-day replay is `establishing_baseline`; 168 complete days
  (four 42-day time constants) is `mature`. Maturity describes seed convergence, not evidence
  quality or an immutable stored revision.

## Version 1 recurrence

For complete daily Common Load `x[t]`, with both initial states equal to zero:

```text
longAlpha = 1 - exp(-1 / 42)
recentAlpha = 1 - exp(-1 / 7)
LongTermLoad[t] = LongTermLoad[t-1] + longAlpha * (x[t] - LongTermLoad[t-1])
RecentLoad[t] = RecentLoad[t-1] + recentAlpha * (x[t] - RecentLoad[t-1])
LoadBalance[t] = LongTermLoad[t] - RecentLoad[t]
```

The 42 and 7 values are exponential time constants in calendar days, not trailing arithmetic
windows. A larger complete daily input cannot lower either next state when the prior state is held
fixed. An evidenced zero-load date applies the recurrence with `x[t] = 0`, so prior state decays.

## Evidence, absence, and compatibility

- `observed` means all activities on the date have complete, compatible Common Load evidence.
  `known_zero` requires a complete bounded source read proving no completed activity on the date.
- An absent date is missing evidence, never zero. `unavailable`, a partial source date, a partial or
  unavailable Common Load aggregate, query truncation, source-coverage uncertainty, or a duplicate
  date/evidence identity makes the history unavailable before recurrence.
- Every day must declare the same history calculation as-of instant. Evidence calculated after the
  requested as-of is rejected. Duplicate evidence fingerprints are rejected across the replay so a
  contribution cannot be counted twice.
- Only `gradientpeak_relative_load@1` days may combine. Another Common Load model/version or another
  history calculation model/version returns an explicit incompatible result; values are not
  converted across versions.

## Timezone and DST

- Canonical grouping uses the athlete profile planning timezone recorded in the history identity.
  A viewer/device timezone is not canonical history authority.
- IANA timezone rules map each activity start instant to a calendar date. Spring-forward dates still
  receive one daily update and fall-back repeated wall-clock hours remain one date. A 23- or 25-hour
  local date does not rescale Common Load or the recurrence.

## Status, identity, rounding, and forecasts

- A successful result is `available` with complete coverage and either `establishing_baseline` or
  `mature` maturity. Incomplete evidence is `unavailable`; no numeric history is emitted for it.
- The identity contains policy, basis, history calculation model/version/as-of, planning timezone,
  date bounds, Common Load model/version, and canonical evidence fingerprints. Replaying identical
  facts with the same versions and as-of is deterministic.
- Inputs and recurrence states retain full IEEE-754 precision. There is no calculation rounding;
  presentation rounding is external. Fixture tolerances cover only cross-runtime floating-point
  evaluation.
- Planned days use the separate `planned_forecast` / `common_load_forecast_v1` result. A planned
  forecast cannot be parsed as completed history and never changes completed-history evidence.
