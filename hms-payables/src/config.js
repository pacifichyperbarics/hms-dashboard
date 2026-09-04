export const APP_CONFIG = Object.freeze({
  name: 'HMS Payables',
  version: '2026.09.04-r1',
  basePath: '/hms-payables/',
  tokenKey: 'hms.device.token.v1',
  deviceKey: 'hms.device.id.v1',
  requestTimeoutMs: 20000,
  endpoints: Object.freeze({
    auth: 'https://sojtoyybfolcxezkppxc.supabase.co/functions/v1/hms-device-auth',
    inbox: 'https://sojtoyybfolcxezkppxc.supabase.co/functions/v1/hms-finance-intake',
    financePayables: 'https://sojtoyybfolcxezkppxc.supabase.co/functions/v1/hms-finance-payables',
    reporting: 'https://sojtoyybfolcxezkppxc.supabase.co/functions/v1/hms-finance-reporting',
    currentPayables: '/.netlify/functions/payables-current',
    gmail: '/api/hms-payables/gmail',
  }),
  screens: Object.freeze(['overview', 'inbox', 'payables', 'cash', 'system']),
});
