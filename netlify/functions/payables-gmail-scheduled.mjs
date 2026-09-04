import { gmailConfigurationStatus } from './lib/payables-gmail-auth.mjs';
import { scanAllActiveConnections } from './lib/payables-gmail-scanner.mjs';

export default async () => {
  const configuration = gmailConfigurationStatus();
  if (!configuration.configured) {
    console.log('HMS Gmail payables scan skipped: integration is not configured.');
    return;
  }

  const results = await scanAllActiveConnections({
    triggerType: 'scheduled',
    maxMessages: 40,
    deviceId: null,
  });
  console.log('HMS Gmail payables scheduled scan', JSON.stringify(results.map((result) => ({
    ok: result.ok,
    sourceAccount: result.sourceAccount,
    messagesScanned: result.messagesScanned || 0,
    candidatesCreated: result.candidatesCreated || 0,
    error: result.error || null,
  }))));
};

export const config = {
  schedule: '17 * * * *',
};
