// Seeds Supabase with current dashboard data.
// Run: node scripts/seed-db.mjs
// Requires SUPABASE_URL and SUPABASE_SERVICE_KEY env vars.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dir, '../index.html'), 'utf8');

const match = html.match(/^let DATA = (\{[\s\S]*?\n\});$/m);
if (!match) { console.error('Could not find DATA in index.html'); process.exit(1); }

const data = JSON.parse(match[1]);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars first.');
  process.exit(1);
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/dashboard_data`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Prefer': 'resolution=merge-duplicates',
  },
  body: JSON.stringify({ id: 1, data }),
});

if (res.ok || res.status === 201 || res.status === 200) {
  console.log('✓ Database seeded successfully.');
} else {
  const err = await res.text();
  console.error('Seed failed:', res.status, err);
  process.exit(1);
}
