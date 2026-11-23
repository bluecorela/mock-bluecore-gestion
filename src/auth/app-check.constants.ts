export const APP_CHECK_HEADER = 'x-firebase-appcheck';
export const APP_CHECK_INVALID_CODE = 'APP_CHECK_INVALID';
export const APP_CHECK_INVALID_MESSAGE = 'Verificación de App Check fallida';

export type AppCheckRejectReason =
  | 'missing'
  | 'invalid'
  | 'expired'
  | 'unavailable';
