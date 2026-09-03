import { getStore } from '@netlify/blobs';
import { syncPayablesToFinance } from './lib/payables-finance-shadow.mjs';

const STORE_NAME = 'hms-payables';
const STATE_KEY = 'state-v1';

export default async () => {
  try {
    const store = getStore(STORE_NAME, { consistency: 'strong' });
    const state = await store.get(STATE_KEY, { type: 'json' });
    if (!state || !Array.isArray(state.items)) {
      console.error('Payables finance shadow: source state not found');
      return;
    }
    const stats = await syncPayablesToFinance(state);
    console.log('Payables finance shadow sync complete', JSON.stringify(stats));
  } catch (error) {
    console.error('Payables finance shadow scheduled sync failed', error instanceof Error ? error.message : error);
  }
};

export const config = {
  schedule: '* * * * *',
};
