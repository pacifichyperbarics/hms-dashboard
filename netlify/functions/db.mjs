const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Prefer': 'return=representation',
};

export default async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return Response.json({ error: 'Database not configured' }, { status: 503 });
  }

  const url = `${SUPABASE_URL}/rest/v1/dashboard_data?id=eq.1`;

  if (req.method === 'GET') {
    const res = await fetch(url, { headers });
    const rows = await res.json();
    if (!rows.length) return Response.json({ error: 'No data found' }, { status: 404 });
    return Response.json(rows[0].data);
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ data: body, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: err }, { status: res.status });
    }
    return new Response(null, { status: 204 });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = { path: '/api/db' };
