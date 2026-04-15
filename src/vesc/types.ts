/**
 * Telemetry values returned by COMM_GET_VALUES (command 0x04).
 * Field order matches commands.c in vedderb/bldc firmware.
 */
export type VescValues = {
  /** MOSFET temperature in °C */
  tempMosfet: number;
  /** Motor temperature in °C */
  tempMotor: number;
  /** Motor current in A */
  currentMotor: number;
  /** Input (battery) current in A */
  currentInput: number;
  /** D-axis current in A */
  id: number;
  /** Q-axis current in A */
  iq: number;
  /** Duty cycle 0..1 */
  dutyCycle: number;
  /** Electrical RPM (ERPM) */
  rpm: number;
  /** Input voltage in V */
  voltage: number;
  /** Amp-hours drawn */
  ampHours: number;
  /** Amp-hours charged (regen) */
  ampHoursCharged: number;
  /** Watt-hours drawn */
  wattHours: number;
  /** Watt-hours charged (regen) */
  wattHoursCharged: number;
  /** Tachometer (motor steps since reset) */
  tachometer: number;
  /** Absolute tachometer (total motor steps) */
  tachometerAbs: number;
  /** Fault code — 0 = FAULT_CODE_NONE */
  faultCode: number;
};

/** Human-readable fault code names matching mc_fault_code enum in datatypes.h */
export const FAULT_NAMES: Record<number, string> = {
  0: 'NONE',
  1: 'OVER_VOLTAGE',
  2: 'UNDER_VOLTAGE',
  3: 'DRV',
  4: 'ABS_OVER_CURRENT',
  5: 'OVER_TEMP_FET',
  6: 'OVER_TEMP_MOTOR',
  7: 'GATE_DRIVER_OVER_VOLTAGE',
  8: 'GATE_DRIVER_UNDER_VOLTAGE',
  9: 'MCU_UNDER_VOLTAGE',
  10: 'BOOTING_FROM_WATCHDOG_RESET',
  11: 'ENCODER_SPI',
  12: 'ENCODER_SINCOS_BELOW_MIN_AMPLITUDE',
  13: 'ENCODER_SINCOS_ABOVE_MAX_AMPLITUDE',
  14: 'FLASH_CORRUPTION',
  15: 'HIGH_OFFSET_CURRENT_SENSOR_1',
  16: 'HIGH_OFFSET_CURRENT_SENSOR_2',
  17: 'HIGH_OFFSET_CURRENT_SENSOR_3',
  18: 'UNBALANCED_CURRENTS',
  19: 'BRK',
  20: 'RESOLVER_LOT',
  21: 'RESOLVER_DOS',
  22: 'RESOLVER_LOS',
  23: 'FLASH_CORRUPTION_APP_CFG',
  24: 'FLASH_CORRUPTION_MC_CFG',
  25: 'ENCODER_NO_MAGNET',
  26: 'ENCODER_MAGNET_TOO_STRONG',
  27: 'PHASE_FILTER',
  28: 'ENCODER_FAULT',
  29: 'LV_OUTPUT_FAULT',
};

/** Firmware version returned by COMM_FW_VERSION (stubbed for PoC) */
export type FwVersion = {
  major: number;
  minor: number;
  hwName: string;
};
