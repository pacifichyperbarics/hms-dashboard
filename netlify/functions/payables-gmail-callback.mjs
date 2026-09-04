import { completeGmailOAuth } from './lib/payables-gmail-auth.mjs';

function redirect(req, path) {
  const origin = new URL(req.url).origin;
  const target = String(path || '/hms-payables/?gmail=error#settings');
  return new Response(null, {
    status: 302,
    headers: {
      location: `${origin}${target.startsWith('/') ? target : '/hms-payables/?gmail=error#settings'}`,
      'cache-control': 'no-store',
    },
  });
}

function errorCode(error) {
  const message = error instanceof Error ? error.message : String(error || 'oauth_error');
  return encodeURIComponent(message.split(':')[0].slice(0, 100));
}

export default async (req) => {
  try {
    const result = await completeGmailOAuth(req);
    return redirect(req, result.returnPath || '/hms-payables/?gmail=connected#settings');
  } catch (error) {
    console.error('payables-gmail-callback failed', error instanceof Error ? error.message : 'unknown_error');
    return redirect(req, `/hms-payables/?gmail=${errorCode(error)}#settings`);
  }
};

export const config = {
  path: '/api/hms-payables/gmail/callback',
};
