# Map camera is intent-driven and centrally profiled

Mapbox camera mutations go through a volatile Map Camera Controller instead of being spread across screen controllers, gesture handlers, style reloads, and history loading effects. UI code sends Map Camera Intents, the controller applies named Map Camera Profiles for navigation modes and views, and History Camera Refinement retargets in-flight movement from approximate ride framing to exact route framing with selection/generation guards. Map style, layers, overlays, Ride History data, GPS fixes, and Map Points stay outside the controller.
