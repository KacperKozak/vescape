export const routes = {
  home: '/',
  profile: '/profile',
  settings: '/settings',
  tune: '/tune',
  tuneHistory: '/tune/history',
  addBoardScan: '/addBoard/scan',
  addBoardDetails: '/addBoard/details',
  controlSpeed: '/control/speed',
  controlBattery: '/control/battery',
  controlDuty: '/control/duty',
  controlTemperatures: '/control/temperatures',
  controlCurrents: '/control/currents',
  controlState: '/control/state',
  controlFootpad: '/control/footpad',
  controlImu: '/control/imu',
} as const

export const stackScreens = {
  home: 'index',
  profile: 'profile',
  settings: 'settings',
  tune: 'tune',
  tuneHistory: 'tune/history',
  addBoardScan: 'addBoard/scan',
  addBoardDetails: 'addBoard/details',
} as const
