const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const FILE = `${SUPABASE_URL}/storage/v1/object/hms-data/dashboard.json`;

const authHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
};

export default async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return Response.json({ error: 'Database not configured' }, { status: 503 });
  }

  if (req.method === 'GET') {
    const res = await fetch(FILE, { headers: authHeaders });
    if (!res.ok) return Response.json({ error: 'Failed to load data' }, { status: res.status });
    const data = await res.json();
    return Response.json(data);
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const res = await fetch(FILE, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(body),
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
