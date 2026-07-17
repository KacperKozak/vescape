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
  speedLimitBasis: string
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
export const LEGAL_LIMIT_DATA_CHECKED_AT = '2026-07-17'

function country(
  input: Omit<LegalLimitCountry, 'checkedAt' | 'sourceUrl' | 'warningText' | 'speedLimitBasis'> & {
    sourceUrl?: string
    speedLimitBasis?: string
    warningText?: string | null
  },
): LegalLimitCountry {
  return {
    ...input,
    checkedAt: LEGAL_LIMIT_DATA_CHECKED_AT,
    speedLimitBasis: input.speedLimitBasis ?? speedLimitBasisForCountry(input.code, input.status),
    sourceUrl: input.sourceUrl ?? EVZ_SOURCE_URL,
    warningText: input.warningText ?? null,
  }
}

function speedLimitBasisForCountry(countryCode: string, status: LegalRoadStatus): string {
  const basisByCountry: Partial<Record<string, string>> = {
    AT: 'Walking-pace play/sports-device rule',
    CY: 'E-scooter reference limit',
    CZ: 'E-scooter/bicycle-equivalent reference limit',
    DE: 'eKFV small-electric-vehicle reference limit',
    HU: 'E-scooter reference fallback',
    IS: 'E-scooter reference fallback',
    IE: 'E-scooter reference limit',
    IT: 'E-scooter reference limit',
    LV: 'E-scooter reference limit',
    MT: 'E-kickscooter reference limit',
    NL: 'Approved special-moped reference limit',
    RO: 'E-scooter reference limit',
    SI: 'E-scooter/light-motor-vehicle reference limit',
    CH: 'E-scooter reference limit',
    GB: 'Rental e-scooter trial reference limit',
  }
  const basis = basisByCountry[countryCode]
  if (basis) return basis
  if (status === 'likelyLegal') return 'One-wheel/self-balancing category limit'
  if (status === 'restricted') return 'Restricted one-wheel/self-balancing category limit'
  return 'Nearest regulated micromobility reference limit'
}

export const LEGAL_LIMIT_COUNTRIES: readonly LegalLimitCountry[] = [
  country({
    name: 'Austria',
    code: 'AT',
    alpha3: 'AUT',
    legalSpeedKmh: 5,
    warningSpeedKmh: 4,
    status: 'restricted',
    confidence: 'high',
    labelCoordinate: [14.4, 47.6],
    sourceUrl: 'https://www.oesterreich.gv.at/de/themen/mobilitaet/spielen_auf_der_strasse',
    warningText:
      'Walking pace only (shown as 5 km/h because the rule has no fixed numeric value); not a road or cycle-lane vehicle.',
  }),
  country({
    name: 'Belgium',
    code: 'BE',
    alpha3: 'BEL',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'likelyLegal',
    confidence: 'high',
    labelCoordinate: [4.7, 50.7],
    sourceUrl: 'https://mobilit.belgium.be/fr/mobilite-durable/trottinettes-et-monoroues',
    warningText: null,
  }),
  country({
    name: 'Bulgaria',
    code: 'BG',
    alpha3: 'BGR',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'low',
    labelCoordinate: [25.2, 42.7],
    sourceUrl:
      'https://www.evz.de/en/travelling-motor-vehicles/e-mobility/two-wheelers/e-scooter-regulations-in-europe.html',
    warningText:
      'No authoritative rule explicitly covering handlebarless one-wheel devices was located.',
  }),
  country({
    name: 'Croatia',
    code: 'HR',
    alpha3: 'HRV',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'likelyLegal',
    confidence: 'high',
    labelCoordinate: [16.4, 45.1],
    sourceUrl: 'https://mup.gov.hr/u-modi-su-nova-pravila/288945',
    warningText: 'Only devices with continuous rated power up to 600 W qualify.',
  }),
  country({
    name: 'Cyprus',
    code: 'CY',
    alpha3: 'CYP',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'notRoadLegal',
    confidence: 'medium',
    labelCoordinate: [33.2, 35.0],
    sourceUrl: 'https://www.mcw.gov.cy/mtcw/pwd/pwd.nsf/all/F7C5047A7194BB0FC2258B4E002650DD',
    warningText: 'The legal e-scooter category requires handlebars and at least two wheels.',
  }),
  country({
    name: 'Czech Republic',
    code: 'CZ',
    alpha3: 'CZE',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'notRoadLegal',
    confidence: 'medium',
    labelCoordinate: [15.5, 49.8],
    sourceUrl:
      'https://md.gov.cz/Media/Na-pravou-miru/Elektricka-vozitka-Pravidla-a-regulace?returl=%2FZajimave-stranky',
    warningText:
      'Ordinary consumer OneWheels/EUCs lack the technical approval required for this vehicle form.',
  }),
  country({
    name: 'Denmark',
    code: 'DK',
    alpha3: 'DNK',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'likelyLegal',
    confidence: 'high',
    labelCoordinate: [10.0, 56.1],
    sourceUrl: 'https://www.retsinformation.dk/eli/lta/2019/40',
    warningText: null,
  }),
  country({
    name: 'Estonia',
    code: 'EE',
    alpha3: 'EST',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'likelyLegal',
    confidence: 'high',
    labelCoordinate: [25.0, 58.7],
    sourceUrl: 'https://www.riigiteataja.ee/en/eli/ee/502012026001/consolide/current',
    warningText: null,
  }),
  country({
    name: 'Finland',
    code: 'FI',
    alpha3: 'FIN',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'likelyLegal',
    confidence: 'high',
    labelCoordinate: [26.0, 64.6],
    sourceUrl: 'https://traficom.fi/en/transport/road/electric-personal-transportation-devices',
    warningText:
      'Maximum rated power is 1 kW; faster or more powerful devices need another approval category.',
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
    sourceUrl:
      'https://www.masecurite.interieur.gouv.fr/fr/fiches-pratiques/securite-routiere-et-transport/regles-route',
    warningText: null,
  }),
  country({
    name: 'Germany',
    code: 'DE',
    alpha3: 'DEU',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'notRoadLegal',
    confidence: 'high',
    labelCoordinate: [10.4, 51.1],
    sourceUrl: 'https://www.gesetze-im-internet.de/ekfv/',
    warningText:
      'The eKFV approval route requires a steering or holding bar and therefore excludes ordinary monowheels/OneWheels.',
  }),
  country({
    name: 'Greece',
    code: 'GR',
    alpha3: 'GRC',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'likelyLegal',
    confidence: 'medium',
    labelCoordinate: [22.9, 39.0],
    sourceUrl:
      'https://europa.eu/youreurope/citizens/vehicles/cars/road-rules-and-safety/index_en.htm',
    warningText: null,
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
    sourceUrl: 'https://net.jogtar.hu/jogszabaly?docid=97500001.KPM',
    warningText:
      'A 2026 draft traffic code is not yet the law; the current national classification remains unclear.',
  }),
  country({
    name: 'Iceland',
    code: 'IS',
    alpha3: 'ISL',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'unknown',
    confidence: 'low',
    labelCoordinate: [-18.8, 64.9],
    sourceUrl:
      'https://www.evz.de/en/travelling-motor-vehicles/e-mobility/two-wheelers/e-scooter-regulations-in-europe.html',
    warningText:
      'The official guidance located covers electric scooters but does not clearly include handlebarless one-wheel devices.',
  }),
  country({
    name: 'Ireland',
    code: 'IE',
    alpha3: 'IRL',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'notRoadLegal',
    confidence: 'high',
    labelCoordinate: [-8.2, 53.2],
    sourceUrl: 'https://www.irishstatutebook.ie/eli/2024/si/199/made/en/print',
    warningText:
      'Public use of powered personal transporters is prohibited except for compliant two-or-more-wheel e-scooters.',
  }),
  country({
    name: 'Italy',
    code: 'IT',
    alpha3: 'ITA',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'notRoadLegal',
    confidence: 'medium',
    labelCoordinate: [12.6, 42.7],
    sourceUrl:
      'https://www.normattiva.it/uri-res/N2Ls?urn%3Anir%3Astato%3Adecreto.legge%3A2019-12-30%3B162~art33bis=',
    warningText:
      'Historic municipal experimentation for monowheels should not be treated as current nationwide permission.',
  }),
  country({
    name: 'Latvia',
    code: 'LV',
    alpha3: 'LVA',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'notRoadLegal',
    confidence: 'medium',
    labelCoordinate: [24.9, 56.9],
    sourceUrl: 'https://likumi.lv/ta/en/en/id/45467-road-traffic-law',
    warningText: 'The statutory electric-scooter category requires two wheels and handlebars.',
  }),
  country({
    name: 'Lithuania',
    code: 'LT',
    alpha3: 'LTU',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'likelyLegal',
    confidence: 'high',
    labelCoordinate: [23.9, 55.2],
    sourceUrl: 'https://e-seimas.lrs.lt/portal/legalAct/lt/TAD/TAIS.111999/asr',
    warningText: 'The device must be no more than 1 kW and no more than 25 km/h by design.',
  }),
  country({
    name: 'Luxembourg',
    code: 'LU',
    alpha3: 'LUX',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'likelyLegal',
    confidence: 'high',
    labelCoordinate: [6.1, 49.8],
    sourceUrl:
      'https://police.public.lu/en/legislation/code-de-la-route/micro-vehicules-electriques.html',
    warningText: 'The category is limited to 1 kW and a design speed of 6–25 km/h.',
  }),
  country({
    name: 'Malta',
    code: 'MT',
    alpha3: 'MLT',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'notRoadLegal',
    confidence: 'medium',
    labelCoordinate: [14.4, 35.9],
    sourceUrl: 'https://www.transport.gov.mt/land/roadsafety/e-kickscooters-4704',
    warningText:
      'The registration scheme located is for e-kickscooters; no public-road approval path for ordinary one-wheel devices was identified.',
  }),
  country({
    name: 'Netherlands',
    code: 'NL',
    alpha3: 'NLD',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'notRoadLegal',
    confidence: 'high',
    labelCoordinate: [5.3, 52.2],
    sourceUrl:
      'https://www.rijksoverheid.nl/themas/verkeer-en-vervoer/voertuigen-op-de-weg/verboden-voertuigen-op-de-weg',
    warningText:
      'The Dutch government expressly lists monowheels and Onewheels among vehicles prohibited on roads and pavements.',
  }),
  country({
    name: 'Norway',
    code: 'NO',
    alpha3: 'NOR',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'likelyLegal',
    confidence: 'high',
    labelCoordinate: [8.5, 61.4],
    sourceUrl: 'https://lovdata.no/dokument/SF/forskrift/2022-05-25-918',
    warningText:
      'The device must be permanently design-limited to 20 km/h and meet size/weight limits.',
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
      'https://www.gov.pl/web/infrastruktura/nowe-przepisy-dotyczace-hulajnog-elektrycznych-i-urzadzen-transportu-osobistego2',
    warningText:
      'UTO devices may not use the carriageway; this differs from the rule for e-scooters.',
  }),
  country({
    name: 'Portugal',
    code: 'PT',
    alpha3: 'PRT',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'restricted',
    confidence: 'high',
    labelCoordinate: [-8.0, 39.6],
    sourceUrl: 'https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/2013-116041830',
    warningText:
      'Only self-balancing devices up to 250 W continuous power and 25 km/h are bicycle-equivalent.',
  }),
  country({
    name: 'Romania',
    code: 'RO',
    alpha3: 'ROU',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'notRoadLegal',
    confidence: 'medium',
    labelCoordinate: [24.9, 45.9],
    sourceUrl: 'https://legislatie.just.ro/Public/DetaliiDocument/74028',
    warningText: 'The statutory e-scooter definition requires two or three wheels and handlebars.',
  }),
  country({
    name: 'Slovakia',
    code: 'SK',
    alpha3: 'SVK',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'likelyLegal',
    confidence: 'high',
    labelCoordinate: [19.5, 48.7],
    sourceUrl: 'https://static.slov-lex.sk/static/SK/ZZ/2009/8/20260101.print.html',
    warningText:
      'Current rules explicitly cover self-balancing vehicles; a revised small-electric-vehicle regime starts 1 September 2026.',
  }),
  country({
    name: 'Slovenia',
    code: 'SI',
    alpha3: 'SVN',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'notRoadLegal',
    confidence: 'high',
    labelCoordinate: [14.9, 46.1],
    sourceUrl:
      'https://www.policija.si/eng/prevention/traffic-safety/traffic-safety-advice-for-users-of-electric-scooters',
    warningText: 'Light motor vehicles without handlebars are not permitted in road traffic.',
  }),
  country({
    name: 'Spain',
    code: 'ES',
    alpha3: 'ESP',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'restricted',
    confidence: 'high',
    labelCoordinate: [-3.6, 40.2],
    sourceUrl:
      'https://www.dgt.es/nuestros-servicios/tu-vehiculo/vehiculos-de-movilidad-personal-vmp/',
    warningText:
      'Registration, an identifying label and compulsory insurance are required; non-certified legacy VMPs may circulate only until 22 January 2027.',
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
    sourceUrl:
      'https://www.astra.admin.ch/astra/en/home/topics/vehicles/vehicles-without-type-approval.html',
    warningText:
      'ASTRA states mono-wheel/smart-wheel devices may be used only on private property.',
  }),
  country({
    name: 'Sweden',
    code: 'SE',
    alpha3: 'SWE',
    legalSpeedKmh: 20,
    warningSpeedKmh: 15,
    status: 'likelyLegal',
    confidence: 'high',
    labelCoordinate: [15.0, 62.0],
    sourceUrl:
      'https://www.transportstyrelsen.se/sv/vagtrafik/fordon/fordonsregler/regler-for-olika-fordonsslag/cykel/',
    warningText:
      'A self-balancing device qualifies as a bicycle only when designed for no more than 20 km/h.',
  }),
  country({
    name: 'United Kingdom',
    code: 'GB',
    alpha3: 'GBR',
    legalSpeedKmh: 25,
    warningSpeedKmh: 20,
    status: 'notRoadLegal',
    confidence: 'high',
    labelCoordinate: [-2.6, 54.3],
    sourceUrl:
      'https://www.gov.uk/government/publications/powered-transporters/information-sheet-guidance-on-powered-transporters',
    warningText:
      'Powered unicycles and similar devices are motor vehicles but cannot ordinarily meet public-road licensing, registration and insurance requirements.',
  }),
]

const LEGAL_LIMIT_COUNTRY_DETAILS: Record<string, LegalLimitCountryDetail> = {
  AT: {
    vehicleScope:
      'Monorovers, hoverboards and comparable small electric self-balancing devices are treated like wheeled play/sports devices, not like e-scooters.',
    where:
      'Only at walking pace on pavements/footpaths and in residential or play streets when pedestrians are not endangered or obstructed; not on carriageways or cycle facilities.',
    equipment:
      'No public-road equipment route applies; the rider must maintain walking pace and yield to pedestrians.',
    insurance:
      'The cited guidance does not establish a motor-liability requirement for this limited pedestrian-area use.',
    notes: 'Do not apply Austria’s bicycle-style e-scooter rules to a handlebarless OneWheel/EUC.',
  },
  BE: {
    vehicleScope:
      'Motorised monowheels are expressly included as motorised mobility devices when design-limited to 25 km/h.',
    where:
      'At no more than walking pace, pedestrian rules apply; above walking pace, cyclist rules apply, including use of cycle facilities where required.',
    equipment:
      'The device must be limited by construction to 25 km/h; lighting and visibility rules apply when riding in darkness or poor visibility.',
    insurance:
      'No compulsory motor insurance is generally required for a compliant 25 km/h mobility device; personal liability cover remains prudent.',
    notes: 'A device capable by design of more than 25 km/h falls outside this category.',
  },
  BG: {
    vehicleScope:
      'Authoritative material located describes handlebar e-scooters, not OneWheel-style boards or electric unicycles.',
    where: 'No reliable national route rule for a handlebarless one-wheel device was confirmed.',
    equipment: 'Not confirmed.',
    insurance: 'Not confirmed.',
    notes: 'Status is intentionally unknown rather than borrowing scooter rules.',
  },
  HR: {
    vehicleScope:
      'Electric monocyles and self-balancing vehicles are expressly included as personal transport devices if they have no seat, continuous rated power no more than 0.6 kW and design speed no more than 25 km/h.',
    where:
      'Use cycle paths/lanes; where none exists, use roads with a speed limit up to 50 km/h as allowed by the traffic rules. Pedestrian areas require pedestrian-safe speed.',
    equipment:
      'Minimum age 14; helmet is mandatory; visibility requirements apply at night or in poor visibility.',
    insurance:
      'No registration or compulsory liability-insurance requirement was identified for a compliant personal transport device.',
    notes:
      'Most high-powered EUCs and some Onewheel models exceed the 600 W continuous-power ceiling.',
  },
  CY: {
    vehicleScope:
      'Cyprus defines its regulated personal mobility/e-scooter device as having handlebars and at least two wheels.',
    where: 'No public-road category was identified for an ordinary handlebarless one-wheel device.',
    equipment: 'Not applicable without a recognised road category.',
    insurance: 'No insurance route was identified for this excluded device form.',
    notes:
      'Use should be limited to private property unless the transport authority confirms a different classification.',
  },
  CZ: {
    vehicleScope:
      'A powered vehicle must retain the normal character of a bicycle or scooter to use the simplified 25 km/h category. A OneWheel/EUC does not.',
    where:
      'Ordinary public-road use requires the vehicle to fit an approved motor-vehicle or category-Z route; typical consumer devices do not have that approval.',
    equipment:
      'Technical approval and, depending on classification, registration, licence and insurance would be required.',
    insurance: 'Insurance does not itself legalise an unapproved device.',
    notes: 'Only a specifically technically approved model could have a different result.',
  },
  DK: {
    vehicleScope:
      'The self-balancing-vehicle and motorised-skateboard scheme expressly covers one-person, self-balancing or board-type electric devices without conventional steering.',
    where:
      'Use bicycle infrastructure and bicycle traffic rules; pavements and pedestrian crossings are not riding areas.',
    equipment: 'Maximum design speed 20 km/h; helmet and required lights/reflectors apply.',
    insurance:
      'No general compulsory third-party insurance requirement was identified for a compliant device.',
    notes: 'The 20 km/h limit is a design requirement, not merely the speed selected in an app.',
  },
  EE: {
    vehicleScope:
      'A personal light electric vehicle expressly includes a self-balancing vehicle and may be handlebarless; maximum design speed is 25 km/h.',
    where:
      'Use cycle/pedestrian infrastructure under the statutory priority and speed rules; road use is allowed where the Act permits it when suitable paths are absent.',
    equipment:
      'Brakes, audible warning and visibility equipment apply; helmet rules apply to younger riders.',
    insurance:
      'Motor liability insurance can be required when the device weighs over 25 kg and has a design speed over 14 km/h.',
    notes:
      'The ordinary 1 kW cap has a specific exception for self-balancing vehicles, but the 25 km/h design limit remains.',
  },
  FI: {
    vehicleScope:
      'Self-balancing devices are light electric vehicles when rated power is at most 1 kW and design speed at most 25 km/h.',
    where:
      'Bicycle rules and cycle facilities apply; a self-balancing device ridden at walking pace may use a pavement under pedestrian-safe conditions.',
    equipment:
      'Minimum age 15; brakes/controls and required lighting/reflectors apply; a helmet is strongly recommended.',
    insurance:
      'Motor liability insurance is required where the statutory speed/weight thresholds are met, including many devices over 25 kg.',
    notes:
      'A device over 1 kW or over 25 km/h is not roadworthy in this category without another approval.',
  },
  FR: {
    vehicleScope:
      'EDPM rules expressly include monowheels, hoverboards and other motorised personal mobility devices limited to 25 km/h.',
    where:
      'Use urban cycle lanes/paths; where none exists, roads normally limited to 50 km/h. Pedestrian areas may be used only at walking pace without obstructing pedestrians.',
    equipment:
      'Minimum age 14; brakes, audible warning, lights and reflectors are required; only one rider.',
    insurance:
      'Third-party civil-liability insurance for motorised personal mobility use is compulsory.',
    notes: 'A device capable by design of more than 25 km/h is not a compliant EDPM.',
  },
  DE: {
    vehicleScope:
      'The eKFV category requires a steering or holding bar, national operating approval and an insurance plate. Ordinary monowheels and Onewheels are excluded.',
    where:
      'No ordinary public-road or cycle-path use; private property only with the owner’s permission.',
    equipment: 'There is no standard public-road approval equipment route for this device form.',
    insurance: 'Buying insurance cannot cure the lack of vehicle approval.',
    notes: 'This is different from an approved German e-scooter.',
  },
  GR: {
    vehicleScope:
      'Greek light personal electric-vehicle rules include electric skateboards and self-balancing personal vehicles with one or two wheels.',
    where:
      'Very slow devices follow pedestrian-type rules; devices up to 25 km/h use bicycle facilities and permitted urban roads, subject to local restrictions.',
    equipment: 'Helmet and prescribed lighting/visibility equipment apply.',
    insurance:
      'No general compulsory insurance requirement was confirmed for an ordinary compliant device.',
    notes: 'Municipal restrictions and signs may narrow where the device can be used.',
  },
  HU: {
    vehicleScope:
      'The current KRESZ does not provide a sufficiently clear, stable national category for ordinary OneWheel/EUC use.',
    where: 'No reliable nationwide route rule was confirmed as of 17 July 2026.',
    equipment: 'Not confirmed.',
    insurance: 'Not confirmed.',
    notes:
      'The February 2026 new-KRESZ proposal remains a draft and must not be presented as current law.',
  },
  IS: {
    vehicleScope:
      'Official guidance located clearly regulates electric scooters/small vehicles but does not clearly state that handlebarless one-wheel devices are included.',
    where: 'No reliable public-road route rule for a OneWheel/EUC was confirmed.',
    equipment: 'Not confirmed for this device form.',
    insurance: 'Not confirmed for this device form.',
    notes: 'Status remains unknown rather than importing the e-scooter rules.',
  },
  IE: {
    vehicleScope:
      'A legal electric scooter must have two or more wheels and handlebars. Irish law prohibits other powered personal transporters in a public place.',
    where: 'Private property only with the owner’s permission.',
    equipment: 'No public-road equipment route applies to an ordinary OneWheel/EUC.',
    insurance: 'Not applicable as a route to public-road legality.',
    notes:
      'The legalisation of e-scooters on 20 May 2024 did not legalise electric unicycles or Onewheel-style boards.',
  },
  IT: {
    vehicleScope:
      'Current nationwide rules regulate electric scooters. Monowheels, hoverboards and similar devices appeared only in the earlier municipal experimentation framework.',
    where:
      'No current nationwide public-road permission for ordinary monowheels/OneWheels was confirmed.',
    equipment:
      'Scooter plate, helmet and equipment rules should not be copied onto a device that is outside the scooter category.',
    insurance:
      'Scooter insurance/plate requirements do not create a legal approval route for a monowheel.',
    notes:
      'Do not treat the expired/time-limited experimentation rules as current nationwide permission.',
  },
  LV: {
    vehicleScope:
      'The Road Traffic Law defines an electric scooter as a two-wheel vehicle with handlebars; a OneWheel/EUC does not meet that definition.',
    where:
      'No alternative public-road category was identified for an ordinary handlebarless one-wheel device.',
    equipment: 'Not applicable without an approved category.',
    insurance: 'No insurance or registration route was identified for this device form.',
    notes: 'Private-property use is the prudent interpretation.',
  },
  LT: {
    vehicleScope:
      'The electric micromobility category expressly includes electric skateboards and electric balancing unicycles, with power no more than 1 kW and design speed no more than 25 km/h.',
    where:
      'Use cycle infrastructure and permitted road areas under micromobility rules; operating speed is generally limited to 20 km/h and to 7 km/h near or while passing pedestrians.',
    equipment:
      'Helmet and lighting/visibility requirements apply, with stricter duties for minors.',
    insurance:
      'No general compulsory motor-insurance requirement was identified for an ordinary compliant device.',
    notes: 'Both the 1 kW power ceiling and 25 km/h construction ceiling matter.',
  },
  LU: {
    vehicleScope:
      'A micro electric vehicle may have one or more wheels, be solely electric, have no more than 1 kW and a design speed above 6 but no more than 25 km/h; hoverboard-type devices are included.',
    where:
      'Bicycle-oriented route rules apply, with pedestrian-speed duties in pedestrian contexts.',
    equipment: 'Required braking, warning, lighting and reflector equipment applies.',
    insurance:
      'No registration or compulsory motor-insurance requirement was identified for the compliant category; civil-liability cover is advisable.',
    notes: 'Devices over 1 kW or 25 km/h fall outside the category.',
  },
  MT: {
    vehicleScope:
      'The Maltese approval, registration and licensing scheme located is for e-kickscooters, not ordinary handlebarless one-wheel devices.',
    where: 'No public-road approval route for a OneWheel/EUC was confirmed.',
    equipment: 'Not applicable without approval and registration.',
    insurance:
      'The e-kickscooter insurance framework should not be assumed to cover an unapproved device form.',
    notes: 'Treat as private-property only unless Transport Malta issues model-specific approval.',
  },
  NL: {
    vehicleScope:
      'The Dutch government expressly identifies monowheels and Onewheels as vehicles that may not be used on public roads or pavements.',
    where:
      'Private property only. Public use would require an RDW-approved special-moped category, which ordinary listed devices do not have.',
    equipment: 'No equipment modification alone makes an unapproved device road-legal.',
    insurance:
      'Insurance and registration apply only after an eligible vehicle approval; they do not legalise an unapproved Onewheel.',
    notes: 'This is a clear prohibition, not merely an uncertain approval status.',
  },
  NO: {
    vehicleScope:
      'A one-person small electric motor vehicle can include standing/self-balancing and board-type devices when it is permanently limited to 20 km/h and meets the 70 kg and dimensional limits.',
    where:
      'Bicycle traffic rules apply; cycle facilities are used where required and pavements only at pedestrian-safe speed.',
    equipment:
      'Minimum age 12; helmet mandatory under 15; lights/reflectors and braking requirements apply.',
    insurance:
      'Compulsory liability insurance has applied to small electric motor vehicles since 1 January 2023.',
    notes:
      'A software riding mode is insufficient if the vehicle is constructed to exceed 20 km/h.',
  },
  PL: {
    vehicleScope:
      'An urządzenie transportu osobistego (UTO) expressly covers electric skateboards and self-balancing devices without a seat or pedals, with maximum design speed 20 km/h.',
    where:
      'Use bicycle paths/lanes. If none is available, a pavement/footpath may be used at pedestrian speed while yielding to pedestrians. UTO riding on the carriageway is prohibited.',
    equipment:
      'The device must meet the UTO construction limits; a helmet is recommended but not generally mandatory.',
    insurance:
      'No compulsory third-party motor insurance is required for an ordinary compliant UTO.',
    notes: 'The road-up-to-30-km/h exception applies to e-scooters, not to UTO devices.',
  },
  PT: {
    vehicleScope:
      'Self-balancing and similar motor devices are bicycle-equivalent only when continuous rated power is no more than 0.25 kW and design speed no more than 25 km/h.',
    where: 'Compliant devices follow bicycle route rules, subject to local traffic restrictions.',
    equipment: 'Bicycle-equivalent lighting/visibility and safety duties apply.',
    insurance:
      'No compulsory motor insurance was identified for a device that remains within the bicycle-equivalent limits.',
    notes:
      'Most consumer Onewheels/EUCs exceed 250 W and therefore do not qualify even if speed-limited.',
  },
  RO: {
    vehicleScope:
      'Romania’s electric-scooter category requires two or three wheels and handlebars; ordinary one-wheel devices are outside it.',
    where: 'No public-road category for an ordinary OneWheel/EUC was confirmed.',
    equipment: 'Not applicable without a recognised category.',
    insurance: 'No insurance route was identified that would make the device road-legal.',
    notes: 'Do not import Romania’s e-scooter route and speed rules into this device type.',
  },
  SK: {
    vehicleScope:
      'Current law expressly defines and regulates self-balancing vehicles, which must not be capable of more than 25 km/h.',
    where:
      'Use the right side of pavements/footways at no more than walking speed (6 km/h) without endangering pedestrians, and the right side of cycle lanes/paths without endangering cyclists. Other road use is age-restricted.',
    equipment:
      'One rider only; applicable safety and visibility rules apply. Some older wording assumes handlebars, so model-specific enforcement can be imperfect.',
    insurance:
      'No general compulsory motor-insurance requirement was identified under the current non-motor-vehicle classification.',
    notes:
      'Law 131/2026 changes the category to “small electric vehicle” from 1 September 2026 and applies cyclist-style rules with a 25 km/h construction limit.',
  },
  SI: {
    vehicleScope:
      'Slovenian police guidance states that light motor vehicles without handlebars are not permitted in road traffic.',
    where: 'Private property only with the owner’s permission.',
    equipment: 'No public-road equipment route exists for an ordinary handlebarless device.',
    insurance: 'Insurance does not create public-road legality.',
    notes:
      'This directly excludes ordinary OneWheel/EUC devices even though e-scooters are regulated.',
  },
  ES: {
    vehicleScope:
      'A VMP may have one or more wheels, one seat/place and electric propulsion, with design speed 6–25 km/h; a OneWheel/EUC can fit only if it satisfies the VMP technical regime.',
    where:
      'Urban use only under national prohibitions and municipal route rules; pavements and interurban roads are prohibited.',
    equipment:
      'Registration and identifying label are required. Certified models must meet the DGT technical manual; older non-certified VMPs have a transition only until 22 January 2027.',
    insurance: 'Compulsory insurance applies through the 2026 national registration system.',
    notes:
      'From 1 October 2026, national rules add minimum age 15, helmet and night/low-visibility reflective requirements; local rules apply before then.',
  },
  CH: {
    vehicleScope:
      'ASTRA lists mono-wheel/smart-wheel devices separately from approved e-scooters and allows them only on private property.',
    where: 'Private property only.',
    equipment: 'No public-road equipment or approval path is provided for this category.',
    insurance:
      'No public-road insurance route applies because the vehicle is not admitted to public traffic.',
    notes: 'Public-road, cycle-path and pavement use are not permitted.',
  },
  SE: {
    vehicleScope:
      'A self-balancing electric vehicle without pedals can be classified as a bicycle when designed for one rider and no more than 20 km/h; unlike ordinary e-scooters, the self-balancing branch is not subject to the 250 W ceiling.',
    where:
      'Bicycle rules apply: use cycle paths normally; eligible riders may use suitable roads under the stated bicycle rules. At walking pace, a self-balancing rider can be treated as a pedestrian.',
    equipment:
      'Brake and bell are required; lights and reflectors are required in darkness. Helmet required for riders under 15.',
    insurance:
      'Motor liability insurance can be required if the device exceeds the statutory weight/speed threshold, notably over 25 kg and over 14 km/h.',
    notes: 'A device designed for more than 20 km/h does not qualify as a bicycle.',
  },
  GB: {
    vehicleScope:
      'Powered transporters expressly include powered unicycles, U-wheels and similar self-balancing devices and are treated as motor vehicles.',
    where:
      'Ordinary use is limited to private land with the owner’s permission; rental e-scooter trials do not authorise private OneWheels/EUCs.',
    equipment:
      'Public-road use would require vehicle approval, registration, licensing and compliant construction that ordinary devices do not have.',
    insurance:
      'Motor insurance would be required for public use, but insurance alone cannot overcome the lack of approval/registration.',
    notes: 'The e-scooter trial exception does not apply to privately owned one-wheel devices.',
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
    features: LEGAL_LIMIT_COUNTRIES.map((country) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: country.labelCoordinate },
      properties: {
        code: country.code,
        label: `${country.legalSpeedKmh}`,
        subtitle: 'km/h',
        speedLimitBasis: country.speedLimitBasis,
        status: LEGAL_ROAD_STATUS_LABELS[country.status],
      },
    })),
  }
}
