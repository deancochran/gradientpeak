# Provider Route Sync Recommendation

Route-only activity plans should not be converted into fake interval workouts. Treat the scheduled event, navigation route/course, and structured workout as separate provider resources.

## Provider Policy

- Wahoo: upload the route, then create the scheduled workout with `route_id` and no `plan_id` for route-only plans. Use `plan_id` only when the activity plan has interval structure.
- Garmin: publish route-only plans as Courses through the Courses API. Do not use the Training API unless intervals/targets exist.
- Strava: public API supports reading/exporting routes and uploading completed activities, not publishing planned route/course workouts. Mark route-only outbound sync unsupported.
- TrainingPeaks: structured workout export/sync depends on Workout Builder structure. Mark route-only outbound device sync unsupported unless partner API docs provide a route/course surface.
- Komoot/RideWithGPS-style route providers: use route/course library sync where an authorized API exists; do not imply calendar workout structure.

## Backend Rule

Classify provider export intent before invoking provider-specific converters:

- `structured_workout`: intervals or targets exist; publish provider workout/plan.
- `scheduled_route_workout`: provider supports a calendar workout with a route but without a workout plan, currently Wahoo.
- `route_course`: provider supports course/route publication without calendar workout semantics, currently Garmin future work.
- `unsupported`: provider has no suitable outbound route/course publishing surface.

Store provider IDs independently for route/course, workout/event, and plan/template resources.
