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

/**
 * Rich telemetry values from the Refloat VESC package (COMMAND_GET_ALLDATA).
 * Provides balance-specific data — pitch, roll, speed, state — in addition
 * to the standard motor metrics.
 */
export type RefloatValues = {
  /** True if the motor controller reported an active fault. */
  hasFault: boolean;
  /** mc_fault_code value (0 = FAULT_CODE_NONE). Only meaningful when hasFault=true. */
  faultCode: number;

  // --- IMU / balance ---
  /** Board pitch angle in degrees (nose-up positive) */
  pitch: number;
  /** Board roll angle in degrees */
  roll: number;
  /** Balance controller's filtered pitch setpoint in degrees */
  balancePitch: number;
  /** Balance PID output current in A */
  balanceCurrent: number;

  // --- Kinematics ---
  /** Ground speed in km/h (signed: positive = forward) */
  speed: number;
  /** Electrical RPM (signed) */
  erpm: number;
  /** Duty cycle as a fraction, range -1..1 */
  dutyCycle: number;

  // --- Electrical ---
  /** Battery pack voltage in V */
  batteryVoltage: number;
  /** Motor phase current in A */
  motorCurrent: number;
  /** Battery draw/regen current in A */
  batteryCurrent: number;

  // --- Footpad / state ---
  /** Raw state byte: bits[3:0] = state_compat, bits[7:4] = sat_compat */
  state: number;
  /** Raw switch byte: footpad sensor state + handtest/beep flags */
  switchState: number;
  /** Front footpad ADC fraction, approx 0..1 */
  adc1: number;
  /** Rear footpad ADC fraction, approx 0..1 */
  adc2: number;

  // --- Mode ≥ 2 (present when mode=2 response is long enough) ---
  /** Total absolute odometer in metres (null if mode < 2 packet) */
  odometer: number | null;
  /** MOSFET temperature in °C (null if mode < 2 packet) */
  tempMosfet: number | null;
  /** Motor temperature in °C (null if mode < 2 packet) */
  tempMotor: number | null;
};
