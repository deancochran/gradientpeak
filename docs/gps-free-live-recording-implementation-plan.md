# GPS-free live recording implementation plan

## Accepted boundary

New web and mobile recordings never capture GPS. Existing completed activities, supported historical FIT/GPX/TCX imports, and provider-ingested activities keep their GPS tracks, maps, and location-derived data.

This is a hard boundary between live capture and historical ingestion:

- Live recording must not request location permission, start foreground or background location work, write coordinate evidence, or add coordinates to its FIT artifact.
- Web and mobile may import supported historical FIT, GPX, and TCX files that contain coordinates.
- Completed and provider-ingested activity data is not rewritten or deleted.
- Unfinished coordinate-bearing recordings from older app versions are not resumed, completed, uploaded, or migrated.
- Mobile Bluetooth sensors and FTMS trainers remain supported without making location permission a recording prerequisite.

## Implementation

### Shared live-recording contract

- Force every new launch and session contract to use GPS mode `off` and location capture `none`.
- Reject recovery data that contains coordinate records rather than promoting it into a new activity.
- Keep historical activity ingestion contracts separate from live-recording contracts.

### Mobile recorder and native configuration

- Remove the GPS choice, status, live-location map, heading, and route-following controls from recording setup and the recording cockpit.
- Remove Expo location/task configuration, native location permissions, location dependencies, foreground watchers, background tasks, and headless location startup.
- Ignore coordinate-shaped sensor readings and strip coordinate fields when writing a new recording artifact.
- Preserve timer, plans, laps, manual completion values, Bluetooth sensor metrics, FTMS trainer control, recovery, review, and submission.

Android 11 and older couple Bluetooth scanning to location authorization. The location-free policy does not request that authorization, so sensor discovery is unavailable there rather than weakening the recording privacy boundary. Android 12+ uses Bluetooth scan/connect permissions directly. Physical-device verification remains required before claiming supported-device BLE or FTMS runtime proof.

### Historical activities and imports

- Continue rendering routes, maps, elevation, and location-derived values from completed activities.
- Continue provider ingestion of coordinate-bearing activity files.
- Keep historical FIT, GPX, and TCX import available on web and mobile, including retry behavior and coordinate-bearing files.
- Keep historical import visibly separate from live recording so importing a route does not turn on live location capture.

### Capability reporting

- Report implementation state separately from runtime proof. Source or component tests can establish implementation but cannot stand in for a maintained browser/device journey.
- Keep pause, resume, finish, review, submit, sensor discovery, sensor connection, measurement streaming, reconnect, FTMS command execution, and FTMS control recovery as separate capability rows.
- Require an exact test identity for each Playwright or Maestro reference so stale runtime claims fail validation.

## Automated verification

Cover at least:

1. Every new mobile launch source producing a GPS-free session.
2. No native location configuration, dependency, task, or active recorder location effect.
3. Coordinate-free FIT output from new in-app recordings.
4. Rejection of coordinate-bearing unfinished recorder recovery.
5. Supported coordinate-bearing historical FIT, GPX, and TCX import on web and mobile.
6. Existing and provider-ingested GPS activity display.
7. Timer, plan, lap, review, submission, sensor, and trainer behavior without a location prerequisite.
8. Atomic parity classification and exact runtime-evidence identities.

## Runtime proof still required

Automated source and component checks do not replace supported-device validation. Before claiming full runtime proof, verify on physical iOS and Android devices that:

- starting and completing a recording never presents a location prompt;
- Bluetooth discovery, connection, measurement streaming, disconnect, and reconnect work on supported versions;
- an FTMS target command is accepted and control-loss recovery is safe; and
- a supported historical coordinate-bearing import succeeds and displays its route.
