# Recording capabilities

## Product decision

GradientPeak retains and displays GPS data already stored in completed activities and GPS data received through supported provider ingestion. GradientPeak does not capture GPS during a new live recording on web or mobile. It does not support manual uploads of GPS-bearing outdoor activity files from web or mobile.

This keeps outdoor activity history, routes, and maps useful without making GradientPeak responsible for live location permissions, background location collection, or navigation during a recording.

## User-facing requirements

### Live recording

Both web and mobile must provide the same core recording experience:

- Start, pause, resume, and finish a session.
- Follow a planned workout, including timed steps, transitions, laps, and recovery.
- Recover an interrupted unfinished session and submit a finished session reliably.
- Let the athlete review and add manual completion values, including distance and calories where applicable.
- Never ask for location permission or show a GPS on/off choice for live recording.
- Never collect, calculate from, or upload a new GPS track, live coordinates, heading, elevation, or GPS-derived speed or distance.

Mobile may additionally use supported connected sensors and trainers. Those device capabilities must not change the core recording controls or create a GPS requirement.

### Imported and historical activities

GradientPeak must continue to display GPS data already stored in completed activities and process supported provider activities that contain GPS data.

- Existing GPS tracks, route maps, elevation, distance, and location-derived metrics remain available in activity detail and analysis where the source provides them.
- Existing GPS-enabled activities remain readable and are not rewritten.
- Provider-sync behavior remains unchanged.
- A manual FIT, GPX, or TCX upload containing coordinates is rejected before it creates an activity. GPX is therefore unsupported as a manual upload format.
- An unfinished local GPS recording from an earlier app version is discarded by the cutoff. It is not recovered, completed, uploaded, or migrated.

## Explicitly out of scope

- Live maps, location following, heading, route navigation, and turn-by-turn prompts during a recording.
- Background GPS collection or a location foreground service.
- Manual upload of GPS-bearing outdoor activity files.
- Recovering, uploading, or migrating unfinished GPS recordings created before the cutoff.
- Removing maps, routes, or GPS-derived values from completed or provider-ingested activities.
- Removing mobile sensor or trainer support.

## Implementation outline

### 1. Establish the shared recording contract

Define a GPS-free live-recording capability contract shared by web and mobile.

- New sessions must always launch without GPS recording.
- Remove live-recording GPS fields from new-session contracts and clear unfinished legacy local recording state at the cutoff.
- Keep completed-activity and provider-ingestion GPS data separate from live-recording configuration.
- Update contract tests to prove that neither app can create a GPS-enabled live session.

### 2. Simplify the mobile recorder

Remove the live GPS path while retaining the timer, planned-workout, sensor, trainer, artifact, and submission paths.

- Remove the GPS toggle, GPS status, GPS-unavailable messaging, live map, heading, and route-following controls from recording setup and the recording cockpit.
- Delete the foreground and background location runtime, location buffering, headless location task, and GPS-specific recovery/replay behavior once no other feature uses them.
- Remove GPS permissions, background-location configuration, and location-only dependencies after confirming Android BLE discovery does not need a location permission on supported versions.
- Make distance and speed come from a connected sensor when available; otherwise let the athlete provide a final manual value during review.
- Keep sensor and trainer behavior intentional and independently tested rather than relying on the old GPS-off branch.

### 3. Align the web experience

Keep the existing timer-first web recorder as the baseline user experience.

- Use the same recording labels, plan behavior, completion review, and recovery expectations as mobile.
- Make the GPS-free capability explicit in the shared contract rather than relying on web-only defaults.
- Do not add browser location capture, live maps, or route navigation.

### 4. Keep ingestion and activity display intact

Protect completed activity display and provider ingestion while blocking manual GPS file uploads.

- Continue showing completed and provider-ingested routes/maps in activity views.
- Continue parsing provider GPS data.
- Reject coordinate-bearing FIT, GPX, and TCX files at the manual-upload boundary on web and mobile.
- Add regression coverage for an existing/provider-ingested GPS activity alongside a new GPS-free live recording and rejected manual GPS upload.

### 5. Verify the change

- Unit-test the shared capability and session contracts.
- Test mobile timer, planned workout, sensor/trainer, review, submission, and cutoff cleanup flows without location access.
- Test the web recording lifecycle and review flow against the same core expectations.
- Test that existing and provider-ingested GPS activities still display their route data and that manual GPS uploads are rejected.
- Confirm on a physical Android device that BLE discovery works after location permissions are removed or narrowed.

## Delivery sequence

1. Land the hard cutoff, clear unfinished legacy recording state, and block manual GPS uploads.
2. Remove live-recording GPS contracts and UI.
3. Remove mobile location runtime and native permissions after the sensor compatibility check.
4. Run completed-activity and provider-ingestion regression coverage.
