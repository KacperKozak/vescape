/**
 * Nordic UART Service (NUS) UUIDs.
 * VESC BLE modules (e.g. VESC Express, HM-10, nRF52) expose this service.
 *
 * Reference: https://infocenter.nordicsemi.com/topic/sdk_nrf5_v16.0.0/ble_sdk_app_nus_eval.html
 */

/** NUS service UUID */
export const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

/**
 * TX characteristic — write here to send data to the VESC.
 * (From the phone's perspective this is a write-without-response characteristic.)
 */
export const NUS_TX_CHAR = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

/**
 * RX characteristic — subscribe to notifications to receive data from the VESC.
 */
export const NUS_RX_CHAR = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

/**
 * Common VESC BLE device name prefixes.
 * Used to filter scan results so only relevant devices surface.
 */
export const VESC_NAME_PREFIXES = [
  'VESC',
  'Float Wheel',
  'Floatwheel',
  'OneWheel',
];
