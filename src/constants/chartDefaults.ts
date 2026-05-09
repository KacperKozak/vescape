export const CHART_DEFAULTS = {
  duty: { min: 0, max: 100 },
  speed: { min: 0, max: 50 },
  motorTemp: { min: 0, max: 80 },
  controllerTemp: { min: 0, max: 80 },
  motorCurrent: { min: -30, max: 30 },
  battCurrent: { min: -30, max: 30 },
  pitch: { min: -15, max: 15 },
  roll: { min: -15, max: 15 },
  balance: { min: -15, max: 15 },
  adc: { min: 0, max: 3.3 },
} as const
