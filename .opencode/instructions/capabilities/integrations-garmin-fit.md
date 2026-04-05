# Garmin FIT Capability

Load only for Garmin FIT parsing, encoding, import, export, or payload-mapping work.

Focus:
- Keep FIT-specific parsing or encoding isolated from broader app logic.
- Map FIT data into shared contracts, not app-local shapes.
- Be careful with units, timestamps, and developer fields.

Important paths:
- search for Garmin or FIT-specific adapters before introducing new seams
- integration mapping and import or export surfaces

Verify with:
- focused fixture-based tests for changed FIT behavior
- relevant package tests where mapping code lives

References:
- `https://developer.garmin.com/fit/overview/`
- `https://developer.garmin.com/fit/download/`
