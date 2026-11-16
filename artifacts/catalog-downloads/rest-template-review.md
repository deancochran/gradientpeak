# Passive-rest template review

This records the original rest-target conversion. The later, user-requested [strength/running coaching review](strength-running-coaching-review.md) intentionally revises selected strength rest durations/RPE and recovery instructions. Its changes supersede the preservation statement below for those explicitly listed fields; the passive-rest classifications remain unchanged.

Reviewed all 68 active system templates and every authored step, including the two print exclusions. Changed 27 existing step definitions across 18 templates. Repeated occurrences reuse those definitions. No steps, durations, distances, repeat counts, names, instructions, or active targets changed. Saved user plans were not rewritten.

## Decisions

Passive rest means stopping exercise for the prescribed time: pool-wall rests and between-set strength rests. Easy movement remains active recovery. A word such as “recovery” or “rest” in a workout description does not determine its target.

| Template | Decision |
| --- | --- |
| Cycling FTP Assessment | Keep all targets: easy spins and testing are active. |
| Running Threshold Pace Assessment | Keep all targets: easy jogs and testing are active; “without rest” is not rest. |
| Swimming CSS Assessment — 400 m / 200 m | Convert the 20-second wall-rest step; keep five-minute easy-swim recovery active. |
| VO2 Max Development | Keep power targets, including low-power recovery and preparation. |
| Sprint Power Development | Keep recovery power targets: “complete recovery” describes recovery quality, not stopping. |
| Threshold Heart Rate Intervals | Keep easy-spin recovery active. |
| Sweet Spot Intervals | Keep easy-spin recovery active. |
| VO2 Max Intervals | Keep 50% FTP recovery active; “full recovery” does not override prescribed pedaling. |
| FTP Intervals | Keep 55% FTP recovery active. |
| Threshold Run Development 1 | Keep easy jog/walk recovery active. |
| Threshold Run Development 2 | Keep recovery jog active. |
| Speed Intervals | Keep recovery jog active. |
| Hill Intervals | Keep easy-jog descent active. |
| 5K Pace Intervals | Keep moving recovery active. |
| Fartlek Training | Keep low-intensity running recovery active. |
| Threshold Intervals | Keep easy jog active. |
| Marathon Pace Long Run | Keep all targets: continuous running. |
| Track 100m Strides | Keep distance-based walk/shuffle recovery active. |
| Track 200m Repeats | Keep distance-based jog recovery active. |
| Track 400m Repeats | Keep distance-based jog/walk recovery active. |
| Track Yasso 800s | Keep easy-lap recovery active. |
| Track Mile Repeats | Keep easy-lap jog recovery active. |
| Track Ladder Activity | Keep all six distance-based recovery steps active. |
| Outdoor Sweet Spot Intervals | Keep easy spinning active. |
| Tempo Intervals | Keep easy spinning active. |
| Climbing Intervals | Keep descent recovery active; spinning/coasting is not a stationary rest interval. |
| Group Ride Simulation | Keep group tempo and easy spinning active. |
| Progressive Long Endurance Ride | Keep reset active: pedals remain moving. |
| Tempo Control Intervals | Keep easy pedaling active. |
| Threshold Power Intervals | Keep easy pedaling active. |
| Anaerobic Repeatability | Keep easy pedaling active. |
| Neuromuscular Sprint Set | Keep easy pedaling active. |
| Cadence Endurance Blocks | Keep 70% FTP + 90 rpm work and 50% FTP recovery unchanged. |
| Cruise Tempo Run | Keep walk/jog recovery active. |
| Anaerobic Hill Surges | Keep walk/jog recovery active. |
| Neuromuscular Strides | Keep walk/jog recovery active. |
| Recovery Feel Swim | Convert wall-rest step; keep swimming active. |
| Aerobic Continuity Swim | Convert wall-rest step; keep swimming active. |
| Tempo Pull Set | Convert wall-rest step; keep pull work active. |
| CSS Threshold Swim | Convert wall-rest step; keep swimming active. |
| VO2 Pace Swim | Convert wall-rest step; keep swimming active. |
| Anaerobic 50s | Convert wall-rest step; keep swimming active. |
| Neuromuscular 25s | Convert wall-rest step; keep swimming active. |
| Sighting Endurance Swim | Convert wall-rest step; keep swimming active. |
| Tempo Negative-Split Swim | Convert wall-rest step; keep swimming active. |
| Movement Capacity Strength | Convert both between-set rest steps; keep movement prep and cooldown active. |
| Compound Strength | Convert both between-set rest steps; keep movement prep and cooldown active. |
| Single-Leg Control | Convert both between-set rest steps; keep movement prep and cooldown active. |
| Power Production | Convert both between-set rest steps; keep movement prep and cooldown active. |
| Trunk and Carry Strength | Convert both between-set rest steps; keep movement prep and cooldown active. |
| Mobility Reset | Keep mobility movements active, even at low RPE. |
| Yoga Balance Flow | Keep poses and transitions active. |
| Norwegian 4×4 Run | Keep explicitly active jog recovery. |
| Norwegian Controlled Threshold Long Repeats | Keep easy-jog float recovery. |
| Norwegian 25×400 Controlled Threshold | Keep easy-jog float recovery. |
| Critical Swim Speed (CSS) | Convert 15-second wall-rest step. |
| Full Body Circuit | Keep mixed work/rest circuit step active; do not split it. Keep walking recovery and stretches active. |
| Core and Stability | Keep walking recovery and mobility active. |
| Functional Movement | Keep walking/setup transition and movement integration active. |
| Upper Body Strength | Convert all three between-set rest steps. |
| Lower Body Strength | Convert all three between-set rest steps. |
| Sprint Intervals | Keep distance-based backstroke/freestyle recovery active. |
| Threshold Set | Keep distance-based swimming recovery active. |
| Technique Focus | Keep distance-based swimming recovery active. |
| Endurance Set | Keep distance-based swimming recovery active. |
| CrossFit WOD | Keep mixed exercise steps active (print-excluded template). |
| Rowing Erg Threshold Intervals | Keep easy rowing active. |
| Other Race Simulation | Keep continuous activity active (print-excluded template). |

## Scope and evidence

- Regression manifest identifies the exact 27 slots by template and step IDs; a pre-conversion structural digest protects all other prescription content across all 68 templates.
- The Full Body Circuit contains short rests inside a mixed six-minute instruction. Converting the entire step to rest would be wrong; splitting it would violate the requested preservation of steps. Its embedded instructions remain intact.
- Cycling “full/complete recovery” wording remains active where a low-power prescription already specifies pedaling. No inferred passive rest was added there.
- Web and mobile use running-session time, despite legacy “moving time” names. Stationary rest counts; explicit pauses freeze progression. Regression tests exercise these semantics without distance or sensor observations.
- Wahoo export of explicit rest is currently unsupported and is rejected rather than silently dropping the interval.
- SQL validator changes are local only. No remote schema deployment or saved-record migration was performed.

## Verification results

- Core suite: 272 files passed, 2,316 tests passed, 1 skipped.
- Core, Web, and Mobile typechecks passed.
- Focused Core/Web/catalog/provider tests: 81 passed; focused Wahoo converter/sync tests: 12 passed (overlapping coverage, not additive totals).
- Mobile editor and stationary-rest/pause tests: 17 passed.
- Full `pnpm --filter @repo/db db:verify` passed, including 549 Core/SQL differential cases, two fresh disposable database builds, fingerprint/parity, security, lint, and schema diff checks. The fingerprint was regenerated through the guarded fresh-target workflow for the approved validator changes.
- Catalog: 66 printed workouts, 90 A5 pages; export preflight passed. ZIP integrity and packaged/standalone/download PDF byte comparisons passed. Visually inspected the swim and strength rest pages.
- Remaining unrelated checkout issue: API typecheck references retired sample exports `OPTION_1_FAVORITE_SWIM` and `SAMPLE_RECOVERY_WORKOUT` in existing tests. The full repository is therefore not release-gate clean.
- No physical-device or printer proof was performed. Automated stationary-rest tests exercise the real session-clock and pause semantics with sensor distance unchanged.
