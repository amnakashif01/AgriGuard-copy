import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/suppliers/real/route';
import { nearbySuppliers, distanceKm, supplierLocationParams, resolveSupplierCity } from '../src/lib/supplier-location';
import { fetchRealSuppliersFromOpenStreetMap, fetchRealSuppliersFromGooglePlaces } from '../src/lib/external-suppliers';
import type { Supplier } from '../src/lib/models';

const originalFetch = globalThis.fetch;
const originalKey = process.env.GOOGLE_PLACES_API_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
  else process.env.GOOGLE_PLACES_API_KEY = originalKey;
});
const islamabad = { lat: 33.7215, lng: 73.0433 };
const pointSupplier = (id: string, lat: number, lng: number, distance = 0) => ({
  id, name: id, type: 'supplier', location: { coordinates: { lat, lng } }, distance,
} as Supplier);
const req = (query: string) => new NextRequest(`http://localhost/api/suppliers/real?${query}`);

test('radius is enforced using coordinates, with zero distance and nearest-first ordering', () => {
  const input = [pointSupplier('rawalpindi', 33.5651, 73.0169), pointSupplier('karachi', 24.8569, 66.9748),
    pointSupplier('same-place', islamabad.lat, islamabad.lng, 9999), pointSupplier('lahore', 31.5497, 74.3436),
    pointSupplier('bad', NaN, 73), pointSupplier('missing', undefined as any, 73)];
  const result = nearbySuppliers(input, islamabad, 50);
  assert.deepEqual(result.map(s => s.id), ['same-place', 'rawalpindi']);
  assert.equal(result[0].distance, 0);
  assert.ok(result[1].distance! > 17 && result[1].distance! < 18);
  assert.equal(input[2].distance, 9999);
  assert.deepEqual(nearbySuppliers(input, islamabad, 10).map(s => s.id), ['same-place']);
  assert.deepEqual(nearbySuppliers(input, islamabad, NaN), []);
});

test('radius boundaries are inclusive, invalid coordinates excluded, and empty results stay empty', () => {
  const supplier = pointSupplier('boundary', 0, 0.01);
  const radius = distanceKm({ lat: 0, lng: 0 }, supplier.location.coordinates);
  assert.equal(nearbySuppliers([supplier], { lat: 0, lng: 0 }, radius).length, 1);
  assert.equal(nearbySuppliers([supplier], { lat: 0, lng: 0 }, radius - 0.001).length, 0);
  assert.deepEqual(nearbySuppliers([supplier], { lat: 91, lng: 0 }), []);
  assert.deepEqual(nearbySuppliers([], islamabad), []);
});

test('saved city wins over stale coordinates; no silent Lahore or GPS fallback', () => {
  assert.equal(supplierLocationParams({ location: 'Islamabad, Punjab', lat: 31.52, lon: 74.35 })?.toString(), 'location=Islamabad%2C+Punjab');
  assert.equal(supplierLocationParams({ lat: 0, lon: 0 })?.toString(), 'lat=0&lng=0');
  assert.equal(supplierLocationParams(null), null);
  assert.equal(supplierLocationParams({ lat: NaN, lon: 0 }), null);
});

test('all offline fallback paths respect the radius rather than listing the whole country', async () => {
  for (const mode of ['http-error', 'html', 'empty', 'throw']) {
    globalThis.fetch = async () => {
      if (mode === 'throw') throw new Error('offline');
      if (mode === 'http-error') return new Response('', { status: 503 });
      if (mode === 'html') return new Response('<html/>', { headers: { 'Content-Type': 'text/html' } });
      return Response.json({ elements: [] });
    };
    const suppliers = await fetchRealSuppliersFromOpenStreetMap(islamabad.lat, islamabad.lng, 25000);
    assert.ok(suppliers.length > 0);
    assert.ok(suppliers.every(s => s.distance! <= 25));
    assert.ok(suppliers.every(s => ['Islamabad', 'Rawalpindi'].includes(s.location.city)));
    assert.deepEqual(await fetchRealSuppliersFromOpenStreetMap(islamabad.lat, islamabad.lng, 1000, 'nonexistent-product'), []);
  }
});

test('OSM provider results are sorted and outside-radius shops are excluded', async () => {
  globalThis.fetch = async () => Response.json({ elements: [
    { id: 1, lat: 31.5497, lon: 74.3436, tags: { name: 'Far shop' } },
    { id: 2, center: { lat: 33.5651, lon: 73.0169 }, tags: { name: 'Rawalpindi shop' } },
    { id: 3, lat: 33.7215, lon: 73.0433, tags: { name: 'Nearest shop' } },
  ] });
  const result = await fetchRealSuppliersFromOpenStreetMap(islamabad.lat, islamabad.lng, 25000);
  assert.deepEqual(result.map(s => s.name), ['Nearest shop', 'Rawalpindi shop']);
});

test('Google provider results cannot bypass the radius filter', async () => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  globalThis.fetch = async url => String(url).includes('nearbysearch')
    ? Response.json({ status: 'OK', results: [{ place_id: 'far' }, { place_id: 'near' }] })
    : Response.json({ status: 'OK', result: { name: 'Seed shop', formatted_address: 'Pakistan', geometry: { location: String(url).includes('place_id=far') ? { lat: 24.8569, lng: 66.9748 } : islamabad } } });
  const result = await fetchRealSuppliersFromGooglePlaces(islamabad.lat, islamabad.lng, 50000, 'seeds');
  assert.deepEqual(result.map(s => s.id), ['near']);
});

test('API resolves Islamabad even with an incorrect province and stale Lahore coordinates', async () => {
  const urls: string[] = [];
  globalThis.fetch = async (url, options) => {
    urls.push(String(url));
    if (String(url).includes('geocoding-api')) return Response.json({ results: [
      { name: 'Islamabad', latitude: 34, longitude: 70, country_code: 'AF', population: 9000000 },
      { name: 'Islamabad', latitude: 33.7215, longitude: 73.0433, country_code: 'PK', admin1: 'Islamabad Capital Territory' },
    ] });
    assert.match(decodeURIComponent(String(options?.body)), /around:10000,33.7215,73.0433/);
    return Response.json({ elements: [
      { id: 1, lat: 33.7215, lon: 73.0433, tags: { name: 'Nearby seeds' } },
      { id: 2, lat: 31.5497, lon: 74.3436, tags: { name: 'Lahore seeds' } },
    ] });
  };
  const response = await GET(req('source=osm&location=Islamabad%2C%20Punjab&lat=31.52&lng=74.35&radius=10000'));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.location.city, 'Islamabad, Islamabad Capital Territory');
  assert.deepEqual(data.suppliers.map((s: Supplier) => s.name), ['Nearby seeds']);
  assert.equal(data.radiusKm, 10);
  assert.equal(urls.length, 2);
});

test('API rejects missing/invalid location and radius before calling providers', async () => {
  globalThis.fetch = async () => { throw new Error('must not fetch'); };
  for (const query of ['', 'lat=NaN&lng=73', 'lat=91&lng=73', 'lat=33&lng=181', 'lat=33&lng=73&radius=0', 'lat=33&lng=73&radius=1000000']) {
    assert.equal((await GET(req(query))).status, 400);
  }
});

test('unresolvable city produces a visible error instead of unrelated results', async () => {
  globalThis.fetch = async () => Response.json({ results: [{ name: 'Other', latitude: 40, longitude: -75, country_code: 'US' }] });
  await assert.rejects(resolveSupplierCity('Unknown'), /City not found in Pakistan/);
  const response = await GET(req('location=Unknown&source=osm'));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).success, false);
});
