import { theme } from '@/constants/theme'
import type { LegalRoadStatus } from '@/lib/legal/types'

export interface LegalLimitCountry {
  name: string
  code: string
  alpha3: string
  legalSpeedKmh: number
  warningSpeedKmh: number
  status: LegalRoadStatus
  confidence: 'high' | 'medium' | 'low'
  labelCoordinate: [number, number]
  warningText: string | null
  sourceUrl: string
  checkedAt: string
}

export interface LegalLimitCountryDetail {
  vehicleScope: string
  where: string
  equipment: string
  insurance: string
  notes: string
}

const EVZ_SOURCE_URL =
  'https://www.evz.de/en/topics/transport/e-mobility/two-wheelers/e-scooter-rules/'
const ASTRA_SOURCE_URL = 'https://blog.astra.admin.ch/elektrische-trendfahrzeuge/'
const AUSTRIA_SOURCE_URL = 'https://www.bmimi.gv.at/en/topics/mobility/walkcyc/escooter.html'
export const LEGAL_LIMIT_DATA_CHECKED_AT = '2026-07-17'

function country(
  input: Omit<LegalLimitCountry, 'checkedAt' | 'sourceUrl' | 'warningText'> & {
    sourceUrl?: string
    warningText?: string | null
  },
): LegalLimitCountry {
  return {
    ...input,
    checkedAt: LEGAL_LIMIT_DATA_CHECKED_AT,
    sourceUrl: input.sourceUrl ?? EVZ_SOURCE_URL,
    warningText: input.warningText ?? null,
  }
}

export const LEGAL_LIMIT_COUNTRIES: readonly LegalLimitCountry[] = [
  country({
    name: 'Austria',
    code: 'AT',
    alpha3: 'AUT',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'notRoadLegal',
    confidence: 'medium',
    labelCoordinate: [14.4, 47.6],
    sourceUrl: AUSTRIA_SOURCE_URL,
  }),
  country({
    name: 'Belgium',
    code: 'BE',
    alpha3: 'BEL',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [4.7, 50.7],
  }),
  country({
    name: 'Bulgaria',
    code: 'BG',
    alpha3: 'BGR',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [25.2, 42.7],
  }),
  country({
    name: 'Croatia',
    code: 'HR',
    alpha3: 'HRV',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [16.4, 45.1],
  }),
  country({
    name: 'Cyprus',
    code: 'CY',
    alpha3: 'CYP',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [33.2, 35.0],
  }),
  country({
    name: 'Czech Republic',
    code: 'CZ',
    alpha3: 'CZE',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'likelyLegal',
    confidence: 'medium',
    labelCoordinate: [15.5, 49.8],
  }),
  country({
    name: 'Denmark',
    code: 'DK',
    alpha3: 'DNK',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [10.0, 56.1],
  }),
  country({
    name: 'Estonia',
    code: 'EE',
    alpha3: 'EST',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [25.0, 58.7],
  }),
  country({
    name: 'Finland',
    code: 'FI',
    alpha3: 'FIN',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [26.0, 64.6],
  }),
  country({
    name: 'France',
    code: 'FR',
    alpha3: 'FRA',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'likelyLegal',
    confidence: 'high',
    labelCoordinate: [2.2, 46.6],
    warningText: null,
  }),
  country({
    name: 'Germany',
    code: 'DE',
    alpha3: 'DEU',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'notRoadLegal',
    confidence: 'high',
    labelCoordinate: [10.4, 51.1],
    sourceUrl: 'https://www.gesetze-im-internet.de/ekfv/',
  }),
  country({
    name: 'Greece',
    code: 'GR',
    alpha3: 'GRC',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [22.9, 39.0],
  }),
  country({
    name: 'Hungary',
    code: 'HU',
    alpha3: 'HUN',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'low',
    labelCoordinate: [19.4, 47.1],
  }),
  country({
    name: 'Iceland',
    code: 'IS',
    alpha3: 'ISL',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'restricted',
    confidence: 'medium',
    labelCoordinate: [-18.8, 64.9],
  }),
  country({
    name: 'Ireland',
    code: 'IE',
    alpha3: 'IRL',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [-8.2, 53.2],
  }),
  country({
    name: 'Italy',
    code: 'IT',
    alpha3: 'ITA',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [12.6, 42.7],
  }),
  country({
    name: 'Latvia',
    code: 'LV',
    alpha3: 'LVA',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [24.9, 56.9],
  }),
  country({
    name: 'Lithuania',
    code: 'LT',
    alpha3: 'LTU',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [23.9, 55.2],
  }),
  country({
    name: 'Luxembourg',
    code: 'LU',
    alpha3: 'LUX',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [6.1, 49.8],
  }),
  country({
    name: 'Malta',
    code: 'MT',
    alpha3: 'MLT',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'restricted',
    confidence: 'medium',
    labelCoordinate: [14.4, 35.9],
  }),
  country({
    name: 'Netherlands',
    code: 'NL',
    alpha3: 'NLD',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'restricted',
    confidence: 'medium',
    labelCoordinate: [5.3, 52.2],
  }),
  country({
    name: 'Norway',
    code: 'NO',
    alpha3: 'NOR',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [8.5, 61.4],
  }),
  country({
    name: 'Poland',
    code: 'PL',
    alpha3: 'POL',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'likelyLegal',
    confidence: 'high',
    labelCoordinate: [19.1, 52.1],
    sourceUrl:
      'https://www.gov.pl/web/infrastruktura/nowe-przepisy-dotyczace-hulajnog-elektrycznych-i-urzadzen-transportu-osobistego',
    warningText: null,
  }),
  country({
    name: 'Portugal',
    code: 'PT',
    alpha3: 'PRT',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [-8.0, 39.6],
  }),
  country({
    name: 'Romania',
    code: 'RO',
    alpha3: 'ROU',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [24.9, 45.9],
  }),
  country({
    name: 'Slovakia',
    code: 'SK',
    alpha3: 'SVK',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'likelyLegal',
    confidence: 'medium',
    labelCoordinate: [19.5, 48.7],
  }),
  country({
    name: 'Slovenia',
    code: 'SI',
    alpha3: 'SVN',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [14.9, 46.1],
  }),
  country({
    name: 'Spain',
    code: 'ES',
    alpha3: 'ESP',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [-3.6, 40.2],
  }),
  country({
    name: 'Switzerland',
    code: 'CH',
    alpha3: 'CHE',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'notRoadLegal',
    confidence: 'high',
    labelCoordinate: [8.2, 46.8],
    sourceUrl: ASTRA_SOURCE_URL,
  }),
  country({
    name: 'Sweden',
    code: 'SE',
    alpha3: 'SWE',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'unknown',
    confidence: 'medium',
    labelCoordinate: [15.0, 62.0],
  }),
  country({
    name: 'United Kingdom',
    code: 'GB',
    alpha3: 'GBR',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'notRoadLegal',
    confidence: 'medium',
    labelCoordinate: [-2.6, 54.3],
  }),
]

const LEGAL_LIMIT_COUNTRY_DETAILS: Record<string, LegalLimitCountryDetail> = {
  AT: {
    vehicleScope: 'Austrian e-scooter guidance covers scooter-style e-scooters.',
    where: 'E-scooters use cycle lanes and bicycle rules.',
    equipment: 'E-scooters need bicycle-style road equipment.',
    insurance:
      'No ordinary e-scooter liability insurance requirement found in the Austrian guidance.',
    notes: 'Confirm the vehicle category with local authority guidance.',
  },
  BE: {
    vehicleScope:
      'EVZ notes Belgian rules also cover motorised mobility devices without handlebars, including monowheels.',
    where:
      'Cycle infrastructure and road use generally follow bicycle-like rules; pavements are not allowed.',
    equipment:
      'Lights, brakes/reflectors, and audible warning rules depend on the exact device type.',
    insurance: 'No compulsory third-party insurance for ordinary e-scooters noted by EVZ.',
    notes: 'City and rental rules can be stricter.',
  },
  BG: {
    vehicleScope: 'EVZ gives e-scooter rules.',
    where:
      'Cycle paths, or roads up to 50 km/h when no cycle path exists; pavements and bus lanes are forbidden.',
    equipment: 'Lights; reflective clothing in the dark.',
    insurance: 'No compulsory insurance for private e-scooters noted by EVZ.',
    notes: 'Check local authority guidance before riding.',
  },
  HR: {
    vehicleScope: 'EVZ gives e-scooter rules.',
    where:
      'Cycle paths; roads up to 50 km/h if no cycle path exists; pedestrian areas only at walking speed.',
    equipment: 'Helmet required; reflective clothing in poor visibility.',
    insurance: 'No ordinary e-scooter insurance requirement highlighted by EVZ.',
    notes: 'Check local authority guidance before riding.',
  },
  CY: {
    vehicleScope: 'EVZ gives e-scooter rules.',
    where:
      'Cycle paths/lanes and roads up to 30 km/h; pavements, footpaths, and squares are forbidden unless signs allow it.',
    equipment: 'Brake system, lights, bell, and reflective clothing in the dark.',
    insurance: 'No ordinary e-scooter insurance requirement highlighted by EVZ.',
    notes: 'Check local authority guidance before riding.',
  },
  CZ: {
    vehicleScope:
      'EVZ and Czech Transport Ministry reporting describe 25 km/h e-scooter-class rules.',
    where:
      'Cycle paths, or built-up-area roads when no cycle path exists; pavements are forbidden.',
    equipment: 'Lights, reflectors, bell; helmet required under 18.',
    insurance: 'No compulsory e-scooter insurance noted by EVZ.',
    notes: 'Local signs and city rules can still be stricter.',
  },
  DK: {
    vehicleScope: 'EVZ gives e-scooter rules.',
    where:
      'Cycle lanes where available; pavements, footpaths, and pedestrian crossings are forbidden.',
    equipment: 'Helmet required; lights day and night; reflectors; CE and size/weight limits.',
    insurance: 'No compulsory e-scooter insurance noted by EVZ.',
    notes: 'Designed speed over 20 km/h is not allowed on roads.',
  },
  EE: {
    vehicleScope: 'EVZ gives e-scooter rules.',
    where:
      'Cycle paths/lanes and pavements; road use in urban areas when no cycle lane or footpath exists.',
    equipment: 'Brakes, bell, front/rear lights, reflectors or side lights.',
    insurance: 'No ordinary e-scooter insurance requirement highlighted by EVZ.',
    notes: 'Check local authority guidance before riding.',
  },
  FI: {
    vehicleScope: 'EVZ gives e-scooter rules.',
    where:
      'Cycle paths/lanes, roads, or dirt tracks if no cycle facility exists; pavements forbidden except children under 12 at 15 km/h.',
    equipment: 'Front light, rear reflector, bell; helmet recommended.',
    insurance: 'No compulsory e-scooter insurance noted by EVZ.',
    notes: 'Check local authority guidance before riding.',
  },
  FR: {
    vehicleScope:
      'EVZ explicitly says French EDPM rules also apply to Segways, monowheels, and hoverboards.',
    where:
      'Urban cycle paths/lanes; roads up to 50 km/h if no cycle facility; pedestrian areas at walking speed if pedestrians are not obstructed.',
    equipment: 'Design-limited to 25 km/h; lights/reflectors and other EDPM equipment apply.',
    insurance:
      'French EDPM liability requirements can apply; riders should confirm local insurance.',
    notes: 'Monowheels are explicitly in scope, with normal EDPM restrictions.',
  },
  DE: {
    vehicleScope:
      'German eKFV applies to approved small electric vehicles with handlebars/holding bars; EVZ says it does not apply to monowheels, hoverboards, or electric skateboards.',
    where: 'Approved e-scooters use cycle infrastructure or the road where allowed.',
    equipment:
      'Approved category needs lights, brakes, reflectors, operating permit, and insurance plate.',
    insurance: 'Mandatory insurance for approved e-scooters.',
    notes: 'Public-road use outside approved categories is not allowed.',
  },
  GR: {
    vehicleScope: 'EVZ gives e-scooter rules.',
    where: 'E-scooter use is regulated by speed class; pavement exception for very slow devices.',
    equipment: 'Local equipment and visibility rules apply.',
    insurance: 'No ordinary e-scooter insurance requirement highlighted by EVZ.',
    notes: 'Check local authority guidance before riding.',
  },
  HU: {
    vehicleScope: 'EVZ reports unclear/no clear national e-scooter legislation.',
    where: 'No stable national route rule in this dataset.',
    equipment: 'Unknown.',
    insurance: 'Unknown.',
    notes: 'Low confidence; rider should check local authority guidance.',
  },
  IS: {
    vehicleScope: 'EVZ gives e-scooter rules.',
    where: 'E-scooter road riding is restricted; local rules should be checked.',
    equipment: 'Standard e-scooter equipment rules apply where allowed.',
    insurance: 'No ordinary e-scooter insurance requirement highlighted by EVZ.',
    notes: 'Road riding is limited; check local rules before riding.',
  },
  IE: {
    vehicleScope: 'EVZ covers e-scooters legal since 2024-05-20.',
    where:
      'Bicycle and bus lanes plus local, regional, and national roads; sidewalks, pedestrian zones, and highways forbidden.',
    equipment: 'Brakes, front/rear lights, reflectors; motor power cap applies.',
    insurance: 'No compulsory e-scooter insurance noted by EVZ.',
    notes: 'Check local authority guidance before riding.',
  },
  IT: {
    vehicleScope: 'EVZ gives e-scooter rules after 2024 changes.',
    where:
      'Inner-city roads up to 50 km/h; pavements, bicycle lanes, pedestrian areas, and outside built-up areas forbidden.',
    equipment:
      'Helmet, insurance, plate, lights, brakes, reflectors, indicators, and reflective clothing rules apply.',
    insurance: 'Liability insurance with license plate is mandatory for e-scooters.',
    notes: 'Check local authority guidance before riding.',
  },
  LV: {
    vehicleScope: 'EVZ covers approved registered e-scooters.',
    where: 'Cycle paths, pavements at walking speed, and roads up to 50 km/h.',
    equipment: 'Brakes, front/rear lights; registration sticker required for approved e-scooters.',
    insurance: 'Registration/approval required; insurance not highlighted by EVZ.',
    notes: 'Check local authority guidance before riding.',
  },
  LT: {
    vehicleScope: 'EVZ gives e-scooter rules.',
    where: 'E-scooter route rules apply; 7 km/h when overtaking pedestrians.',
    equipment: 'Power/design-speed caps and helmet rules apply.',
    insurance: 'No ordinary e-scooter insurance requirement highlighted by EVZ.',
    notes: 'Check local authority guidance before riding.',
  },
  LU: {
    vehicleScope: 'EVZ gives e-scooter rules.',
    where:
      'E-scooter use follows local route rules; walking speed can apply in pedestrian contexts.',
    equipment: 'Standard lighting/braking visibility rules apply.',
    insurance: 'No ordinary e-scooter insurance requirement highlighted by EVZ.',
    notes: 'Check local authority guidance before riding.',
  },
  MT: {
    vehicleScope: 'EVZ notes approval-dependent e-scooter use.',
    where: 'Use depends on authority approval and local rules.',
    equipment: 'Approved-vehicle equipment rules apply.',
    insurance: 'Approval/registration context should be checked.',
    notes: 'Use depends on approval and local rules.',
  },
  NL: {
    vehicleScope:
      'EVZ says most e-scooters need national RDW type approval before public-road use.',
    where: 'Only approved vehicles may use public roads under the approved-category rules.',
    equipment: 'Approved vehicle requirements apply.',
    insurance: 'Approval/registration requirements apply; rider should confirm insurance.',
    notes: 'Most unapproved devices are not road-legal.',
  },
  NO: {
    vehicleScope: 'EVZ gives e-scooter rules.',
    where: 'E-scooter route rules apply; rider should check local restrictions.',
    equipment: 'Standard e-scooter equipment rules apply.',
    insurance: 'Liability insurance is required since 2023 according to the source notes.',
    notes: 'Check local authority guidance before riding.',
  },
  PL: {
    vehicleScope: 'Polish UTO/e-scooter rules cover personal transport devices.',
    where:
      'Cycle lanes/paths; road only when no cycle facility exists and road speed limit is not over 30 km/h; pavement exception at pedestrian speed.',
    equipment: 'Country UTO/e-scooter rules apply.',
    insurance: 'No compulsory e-scooter insurance noted by EVZ.',
    notes: 'Cities and local road signs can still be stricter.',
  },
  PT: {
    vehicleScope: 'EVZ gives e-scooter rules.',
    where: 'Cycle lanes/paths; city-centre roads if no cycle facility exists.',
    equipment: 'Helmet recommended; local rental caps may apply.',
    insurance: 'No ordinary e-scooter insurance requirement highlighted by EVZ.',
    notes: 'Lisbon rentals can be capped to 20 km/h.',
  },
  RO: {
    vehicleScope: 'EVZ gives e-scooter rules.',
    where: 'E-scooter road/cycle rules apply by local conditions.',
    equipment: 'Standard e-scooter equipment rules apply.',
    insurance: 'No ordinary e-scooter insurance requirement highlighted by EVZ.',
    notes: 'Check local authority guidance before riding.',
  },
  SK: {
    vehicleScope: 'EVZ describes 25 km/h e-scooter-class rules.',
    where:
      'E-scooter route rules apply; pavement riding is at walking speed, with a 6 km/h sidewalk reference in force from 2026.',
    equipment: 'Standard e-scooter equipment rules apply.',
    insurance: 'No ordinary e-scooter insurance requirement highlighted by EVZ.',
    notes: 'Local signs and conflict situations can still make the practical limit stricter.',
  },
  SI: {
    vehicleScope: 'EVZ gives e-scooter rules.',
    where: 'Cycle infrastructure and road rules apply; local restrictions possible.',
    equipment: 'Standard e-scooter equipment rules apply.',
    insurance: 'No ordinary e-scooter insurance requirement highlighted by EVZ.',
    notes: 'Check local authority guidance before riding.',
  },
  ES: {
    vehicleScope: 'EVZ gives e-scooter/VMP rules.',
    where: 'VMP route rules vary by city; city rules can be stricter.',
    equipment: 'Design speed cap and city equipment rules apply.',
    insurance: 'Insurance can depend on municipality and vehicle category.',
    notes: 'Check local authority guidance before riding.',
  },
  CH: {
    vehicleScope:
      'ASTRA lists mono wheel / smart wheel separately from approved e-scooters and says it may be used only on private property.',
    where: 'Private property only for mono wheel / smart wheel.',
    equipment: 'No public-road equipment path for this category in ASTRA guidance.',
    insurance: 'No public-road approval path for this category in ASTRA guidance.',
    notes: 'Public-road use outside approved categories is not allowed.',
  },
  SE: {
    vehicleScope:
      'EVZ says e-scooters can be classified as bicycles when speed/power limits are met.',
    where:
      'Cycle paths should be used; road use up to 50 km/h roads for riders at least 15; pavements forbidden.',
    equipment: 'Brakes, bell, lights/reflectors in the dark.',
    insurance:
      'Motor vehicle liability insurance can be required when design speed/weight thresholds are exceeded.',
    notes: 'Check local authority guidance before riding.',
  },
  GB: {
    vehicleScope:
      'EVZ says private e-scooters are not permitted on public roads; rental trials exist in some places.',
    where: 'Private e-scooters are limited to private land, except authorised rental trials.',
    equipment: 'Trial rental rules apply where available.',
    insurance: 'Rental trial operators handle permitted-vehicle requirements.',
    notes: 'Private e-scooters are not permitted on public roads outside authorised rental trials.',
  },
}

export const LEGAL_LIMIT_MAP_CAMERA = {
  centerCoordinate: [13, 53] as [number, number],
  zoomLevel: 3.05,
  heading: 0,
  pitch: 0,
}

export const LEGAL_ROAD_STATUS_LABELS: Record<LegalRoadStatus, string> = {
  likelyLegal: 'No major issue',
  restricted: 'Restricted',
  notRoadLegal: 'Not road-legal',
  unknown: 'Unknown',
}

export const LEGAL_ROAD_STATUS_COLORS: Record<LegalRoadStatus, string> = {
  likelyLegal: theme.palette.green.color,
  restricted: theme.palette.amber.color,
  notRoadLegal: theme.palette.red.color,
  unknown: theme.palette.sky.color,
}

export const LEGAL_ROAD_STATUS_LEGEND: readonly LegalRoadStatus[] = [
  'likelyLegal',
  'restricted',
  'notRoadLegal',
  'unknown',
]

export function getLegalLimitCountryByCode(countryCode: string): LegalLimitCountry | null {
  const normalized = countryCode.trim().toUpperCase()
  return (
    LEGAL_LIMIT_COUNTRIES.find(
      (country) => country.code === normalized || country.alpha3 === normalized,
    ) ?? null
  )
}

export function getLegalLimitCountryDetail(
  country: LegalLimitCountry,
): LegalLimitCountryDetail | null {
  return LEGAL_LIMIT_COUNTRY_DETAILS[country.code] ?? null
}

export function legalStatusColorExpression() {
  const expression: unknown[] = ['match', ['get', 'iso_3166_1_alpha_3']]
  for (const country of LEGAL_LIMIT_COUNTRIES) {
    expression.push(country.alpha3, LEGAL_ROAD_STATUS_COLORS[country.status])
  }
  expression.push('transparent')
  return expression
}

export function legalCountryFilterExpression() {
  return [
    'in',
    ['get', 'iso_3166_1_alpha_3'],
    ['literal', LEGAL_LIMIT_COUNTRIES.map((c) => c.alpha3)],
  ]
}

export function legalLimitLabelShape(): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: LEGAL_LIMIT_COUNTRIES.filter((country) => country.status !== 'unknown').map(
      (country) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: country.labelCoordinate },
        properties: {
          code: country.code,
          label: `${country.legalSpeedKmh}`,
          subtitle: 'km/h',
          status: LEGAL_ROAD_STATUS_LABELS[country.status],
        },
      }),
    ),
  }
}
