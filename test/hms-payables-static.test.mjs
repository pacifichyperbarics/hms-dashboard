import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../hms-payables/index.html', import.meta.url), 'utf8');
const redirects = await readFile(new URL('../_redirects', import.meta.url), 'utf8');

test('production shell uses absolute asset paths', () => {
  assert.match(html, /href="\/hms-payables\/assets\/app\.css/);
  assert.match(html, /src="\/hms-payables\/src\/main\.js/);
  assert.doesNotMatch(html, /\.\/app\.css/);
  assert.doesNotMatch(html, /hms-finance-staging/);
});

test('bare path canonicalizes to a physical trailing-slash directory', () => {
  assert.match(redirects, /^\/hms-payables \/hms-payables\/ 301!/m);
  assert.doesNotMatch(redirects, /^\/hms-payables\/\* \/hms-finance-staging/m);
});
