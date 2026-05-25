# Metric Sanitizers preserve raw telemetry

Ride metrics can be polluted by telemetry that should not contribute to a specific metric, such as airborne wheel spin for max speed or very low speed samples for moving average speed. Metric Sanitizers therefore run on the native side before aggregate buckets are built, preserving raw Telemetry Samples while writing Metric Exclusions that remove selected metric values from derived ride metrics and make those removals visible in graphs.

## Considered Options

- **Drop or mutate raw Telemetry Samples.** Rejected because it would hide diagnostic evidence and make future sanitizer changes destructive.
- **Sanitize only in JS read paths.** Rejected because native owns durable truth, profile stats, and bucket aggregation; duplicating the rules in every UI read path would be fragile.
- **Sanitize inside minute bucket aggregation.** Rejected because future spike sanitizers may need samples before and after the current point and must not be constrained by minute boundaries.
- **Keep moving average speed eligibility separate from Metric Sanitizers.** Rejected because every metric-affecting removal should be inspectable on graphs.
- **Run a native sanitization pass over ordered raw samples before aggregation.** Chosen because it preserves raw data, supports future lookaround-based sanitizers, makes all metric removals visible, and keeps derived ride metrics consistent.

## Consequences

- Live board readouts and raw graphs continue to show the board's raw behavior.
- Live max/range values may briefly include a spike, then correct after recent samples are sanitized.
- Ride History and profile metrics read sanitized aggregate values while raw graph views can later mark excluded points.
- Speed exclusions initially use board speed compared with nearby precise GPS speed; duty exclusions initially follow speed exclusions for the same Telemetry Sample.
- Moving average speed eligibility is also represented as Metric Exclusions, so low-speed samples excluded from average speed can be marked on graphs.
- Changing sanitizer rules can rebuild all Metric Exclusions and aggregate buckets from raw Telemetry Samples.
