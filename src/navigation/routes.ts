export const routes = {
  home: '/',
  addBoardScan: '/addBoard/scan',
  addBoardDetails: '/addBoard/details',
  controlSpeed: '/control/speed',
  controlBattery: '/control/battery',
  controlDuty: '/control/duty',
  controlMotorTemp: '/control/motor-temp',
  controlMotorCurrent: '/control/motor-current',
  controlControllerTemp: '/control/controller-temp',
  controlBattCurrent: '/control/batt-current',
  controlState: '/control/state',
  controlFootpad: '/control/footpad',
  controlImu: '/control/imu',
} as const

export const stackScreens = {
  home: 'index',
  addBoardScan: 'addBoard/scan',
  addBoardDetails: 'addBoard/details',
} as const
