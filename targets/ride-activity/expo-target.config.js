/**
 * Widget extension that renders the Board Session Live Activity (Lock Screen + Dynamic Island).
 * The activity itself is driven natively from the main app (`RideLiveActivityController`); this
 * target only renders the shared `RideActivityAttributes.ContentState`.
 *
 * @type {import('@bacons/apple-targets').Config}
 */
// The `widget` type already links WidgetKit + SwiftUI + ActivityKit + AppIntents by default.
module.exports = {
  type: 'widget',
  name: 'RideActivity',
  deploymentTarget: '17.0',
}
