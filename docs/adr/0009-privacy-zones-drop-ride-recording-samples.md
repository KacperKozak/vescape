# Privacy Zones drop Ride Recording samples

Privacy Zones protect places such as home or work by preventing Ride Recording data from being retained while the rider is inside an enabled zone. We drop whole Telemetry Samples for future recording writes inside those zones, leaving Live State unchanged and allowing Ride History to show natural gaps instead of storing hidden coordinates or privacy markers.

## Considered Options

- **Strip only GPS data.** Rejected for the first implementation because keeping telemetry while removing location preserves metrics but makes the privacy behavior harder to explain and reason about.
- **Pause recording inside zones.** Rejected because recording state changes would add lifecycle complexity and could expose privacy-boundary timing in the UI.
- **Filter zones only in Ride History.** Rejected because durable telemetry would still contain private samples.
- **Drop whole recording samples in native persistence.** Chosen because native owns durable ride truth, the rule survives reloads/backgrounding, and gaps make the privacy effect explicit without storing zone names in rides.

## Consequences

- Privacy Zones affect Ride Recording only; live telemetry and live map behavior stay unchanged.
- Ride History may contain route and telemetry gaps when recordings pass through enabled Privacy Zones.
- Saved Privacy Zones must live in native storage so the recorder can apply them before persistence.
- Changing Privacy Zones affects future samples only and does not rewrite existing Ride History.
