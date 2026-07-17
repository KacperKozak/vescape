# Legal Mode Speed Limits

Seed reference for Legal Mode jurisdiction defaults.

This is not legal advice. Micromobility categories differ by country: Poland has **UTO**, France uses EDPM, Germany's eKFV covers e-scooters and Segways but not monowheels/hoverboards/electric skateboards, and some countries let cities add stricter rules. Use these values only as app defaults that the rider can edit.

Legal Mode needs two separate ideas:

- **Legal Speed Limit**: the speed value used by the app for warning/limit controls.
- **Legal Road Status**: whether the board category appears road-legal in that jurisdiction.

A country can have a useful speed default while still being not road-legal for this board category. In that case, keep the speed controls visible and show a warning badge on the Legal Mode icon.

Sources checked on 2026-07-17:

- European Consumer Centre Germany, "Country overview: E-scooter regulations in Europe", updated 2025-04-02: https://www.evz.de/en/topics/transport/e-mobility/two-wheelers/e-scooter-rules/
- EU Urban Mobility Observatory, "Overview of policy relating to e-scooters in European countries", first published 2020-07-23: https://urban-mobility-observatory.transport.ec.europa.eu/resources/case-studies/overview-policy-relating-e-scooters-european-countries_en
- Gov.pl / Ministry of Infrastructure, Polish UTO and e-scooter rules: https://www.gov.pl/web/infrastruktura/nowe-przepisy-dotyczace-hulajnog-elektrycznych-i-urzadzen-transportu-osobistego
- Germany eKFV, official law text: https://www.gesetze-im-internet.de/ekfv/

## UI Rules

- If `legalRoadStatus` is `notRoadLegal` or `restricted`, show a red warning mark on the Legal Mode icon.
- Tapping the warning opens a short explanation of why the status is risky or not road-legal.
- Do not hide the speed controls when status is warned. Riders still need warning/limit tools even where the vehicle category is not fully legal.
- For not-road-legal or unknown countries, use the nearest regulated micromobility limit (for example, e-scooters or the local small-electric-vehicle class) as the editable safety-control speed while showing the warning/status clearly.
- For numeric legal speed countries, default warning speed remains `legalSpeedKmh - 5`.

## GPS Lookup Rules

- Do not continuously check GPS for Legal Mode.
- Run jurisdiction lookup only once when the app has a usable GPS/country signal and no saved Legal Mode jurisdiction result exists.
- Persist the resolved jurisdiction result so app restart reuses it without another lookup.
- A later explicit rider action may refresh jurisdiction, but passive UI rendering must not poll GPS or re-run lookup.
- Legal Mode UI should re-render only when the saved jurisdiction result changes or the rider edits Legal Mode values.

## Seed Table

`warningSpeedKmh` should default to `legalSpeedKmh - 5` when a numeric limit exists. For `notRoadLegal` and `unknown` countries, the speed is the nearest regulated micromobility max-speed reference, not a claim that the one-wheel category is road-legal.

| Country        | Country code | Legal speed default | Warning speed default | Speed basis                                        | Legal Road Status for VESC board-style vehicle | Confidence | Notes                                                                                                                                               |
| -------------- | ------------ | ------------------: | --------------------: | -------------------------------------------------- | ---------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Austria        | AT           |              5 km/h |                4 km/h | Walking-pace play/sports-device rule               | restricted                                     | high       | Walking pace only (shown as 5 km/h because the rule has no fixed numeric value); not a road or cycle-lane vehicle.                                  |
| Belgium        | BE           |             25 km/h |               20 km/h | One-wheel/self-balancing category limit            | likelyLegal                                    | high       | No warning.                                                                                                                                         |
| Bulgaria       | BG           |             25 km/h |               20 km/h | Nearest regulated micromobility reference limit    | unknown                                        | low        | No authoritative rule explicitly covering handlebarless one-wheel devices was located.                                                              |
| Croatia        | HR           |             25 km/h |               20 km/h | One-wheel/self-balancing category limit            | likelyLegal                                    | high       | Only devices with continuous rated power up to 600 W qualify.                                                                                       |
| Cyprus         | CY           |             20 km/h |               15 km/h | E-scooter reference limit                          | notRoadLegal                                   | medium     | The legal e-scooter category requires handlebars and at least two wheels.                                                                           |
| Czech Republic | CZ           |             25 km/h |               20 km/h | E-scooter/bicycle-equivalent reference limit       | notRoadLegal                                   | medium     | Ordinary consumer OneWheels/EUCs lack the technical approval required for this vehicle form.                                                        |
| Denmark        | DK           |             20 km/h |               15 km/h | One-wheel/self-balancing category limit            | likelyLegal                                    | high       | No warning.                                                                                                                                         |
| Estonia        | EE           |             25 km/h |               20 km/h | One-wheel/self-balancing category limit            | likelyLegal                                    | high       | No warning.                                                                                                                                         |
| Finland        | FI           |             25 km/h |               20 km/h | One-wheel/self-balancing category limit            | likelyLegal                                    | high       | Maximum rated power is 1 kW; faster or more powerful devices need another approval category.                                                        |
| France         | FR           |             25 km/h |               20 km/h | One-wheel/self-balancing category limit            | likelyLegal                                    | high       | No warning.                                                                                                                                         |
| Germany        | DE           |             20 km/h |               15 km/h | eKFV small-electric-vehicle reference limit        | notRoadLegal                                   | high       | The eKFV approval route requires a steering or holding bar and therefore excludes ordinary monowheels/OneWheels.                                    |
| Greece         | GR           |             25 km/h |               20 km/h | One-wheel/self-balancing category limit            | likelyLegal                                    | medium     | No warning.                                                                                                                                         |
| Hungary        | HU           |             25 km/h |               20 km/h | E-scooter reference fallback                       | unknown                                        | low        | A 2026 draft traffic code is not yet the law; the current national classification remains unclear.                                                  |
| Iceland        | IS           |             25 km/h |               20 km/h | E-scooter reference fallback                       | unknown                                        | low        | The official guidance located covers electric scooters but does not clearly include handlebarless one-wheel devices.                                |
| Ireland        | IE           |             20 km/h |               15 km/h | E-scooter reference limit                          | notRoadLegal                                   | high       | Public use of powered personal transporters is prohibited except for compliant two-or-more-wheel e-scooters.                                        |
| Italy          | IT           |             20 km/h |               15 km/h | E-scooter reference limit                          | notRoadLegal                                   | medium     | Historic municipal experimentation for monowheels should not be treated as current nationwide permission.                                           |
| Latvia         | LV           |             25 km/h |               20 km/h | E-scooter reference limit                          | notRoadLegal                                   | medium     | The statutory electric-scooter category requires two wheels and handlebars.                                                                         |
| Lithuania      | LT           |             20 km/h |               15 km/h | One-wheel/self-balancing category limit            | likelyLegal                                    | high       | The device must be no more than 1 kW and no more than 25 km/h by design.                                                                            |
| Luxembourg     | LU           |             25 km/h |               20 km/h | One-wheel/self-balancing category limit            | likelyLegal                                    | high       | The category is limited to 1 kW and a design speed of 6–25 km/h.                                                                                    |
| Malta          | MT           |             20 km/h |               15 km/h | E-kickscooter reference limit                      | notRoadLegal                                   | medium     | The registration scheme located is for e-kickscooters; no public-road approval path for ordinary one-wheel devices was identified.                  |
| Netherlands    | NL           |             25 km/h |               20 km/h | Approved special-moped reference limit             | notRoadLegal                                   | high       | The Dutch government expressly lists monowheels and Onewheels among vehicles prohibited on roads and pavements.                                     |
| Norway         | NO           |             20 km/h |               15 km/h | One-wheel/self-balancing category limit            | likelyLegal                                    | high       | The device must be permanently design-limited to 20 km/h and meet size/weight limits.                                                               |
| Poland         | PL           |             20 km/h |               15 km/h | One-wheel/self-balancing category limit            | likelyLegal                                    | high       | UTO devices may not use the carriageway; this differs from the rule for e-scooters.                                                                 |
| Portugal       | PT           |             25 km/h |               20 km/h | Restricted one-wheel/self-balancing category limit | restricted                                     | high       | Only self-balancing devices up to 250 W continuous power and 25 km/h are bicycle-equivalent.                                                        |
| Romania        | RO           |             25 km/h |               20 km/h | E-scooter reference limit                          | notRoadLegal                                   | medium     | The statutory e-scooter definition requires two or three wheels and handlebars.                                                                     |
| Slovakia       | SK           |             25 km/h |               20 km/h | One-wheel/self-balancing category limit            | likelyLegal                                    | high       | Current rules explicitly cover self-balancing vehicles; a revised small-electric-vehicle regime starts 1 September 2026.                            |
| Slovenia       | SI           |             25 km/h |               20 km/h | E-scooter/light-motor-vehicle reference limit      | notRoadLegal                                   | high       | Light motor vehicles without handlebars are not permitted in road traffic.                                                                          |
| Spain          | ES           |             25 km/h |               20 km/h | Restricted one-wheel/self-balancing category limit | restricted                                     | high       | Registration, an identifying label and compulsory insurance are required; non-certified legacy VMPs may circulate only until 22 January 2027.       |
| Switzerland    | CH           |             20 km/h |               15 km/h | E-scooter reference limit                          | notRoadLegal                                   | high       | ASTRA states mono-wheel/smart-wheel devices may be used only on private property.                                                                   |
| Sweden         | SE           |             20 km/h |               15 km/h | One-wheel/self-balancing category limit            | likelyLegal                                    | high       | A self-balancing device qualifies as a bicycle only when designed for no more than 20 km/h.                                                         |
| United Kingdom | GB           |             25 km/h |               20 km/h | Rental e-scooter trial reference limit             | notRoadLegal                                   | high       | Powered unicycles and similar devices are motor vehicles but cannot ordinarily meet public-road licensing, registration and insurance requirements. |

## Implementation Notes

- Keep Legal Mode out of map internals. The map may show Legal Mode controls or badges, but jurisdiction data, saved Legal Mode settings, and speed-warning Alert Rule materialization live under `src/lib/legalMode.ts` and `src/store/legalModeStore.ts`.
- The Legal Mode warning is a managed native Alert Rule with the stable id `legal-mode-speed-alert`. Generic alert editing hides that rule; gauges may still render its speed marker.
- Treat `legalRoadStatus` separately from numeric speed defaults. A `notRoadLegal` status still gets editable speed controls.
- Use country-level GPS only as a suggestion. The rider must be able to override values because city rules can be stricter.
- Start with country code lookup. Avoid municipality-level geofencing until there is a sourced city-rule dataset and a privacy review.
- Keep source URL and checked date with each record if this table becomes code data.
- Persist the chosen jurisdiction/default result with enough metadata to avoid repeat lookups on every render/startup.
