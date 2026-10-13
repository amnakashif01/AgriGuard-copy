import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/suppliers/real/route';
import { countryAt, filterMarketplaceSuppliers, osmSupplier, searchMarketplace, supplierSearchBounds } from '../src/lib/marketplace-search';
import { getCurrentSupplierLocation, supplierLocationParams, matchesSupplierQuery, distanceKm } from '../src/lib/supplier-location';
import type { Supplier } from '../src/lib/models';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
// Public city centres and synthetic shops; no device or personal locations.
const lahore = { lat: 31.558, lng: 74.3507 };
const shop = (name: string, lat: number, lng: number, products = ['Seeds']) => ({
  id: name, name, type: 'supplier', location: { coordinates: { lat, lng } }, products, services: [],
} as unknown as Supplier);

test('Lahore border regression: Indian shops inside 50 km are excluded, Pakistan shops retained', () => {
  const india = shop('Indian border shop', 31.4, 74.75);
  const pakistan = shop('Lahore seeds', 31.5, 74.32);
  assert.ok(distanceKm(lahore, india.location.coordinates) < 50);
  assert.equal(countryAt(india.location.coordinates), 'IN');
  assert.equal(countryAt(lahore), 'PK');
  assert.deepEqual(filterMarketplaceSuppliers([india, pakistan], lahore, 50).map(s => s.id), ['Lahore seeds']);
  assert.deepEqual(filterMarketplaceSuppliers([pakistan], lahore, 1), []);
});

test('current GPS overrides stale profile city and remains the origin after radius/query changes', () => {
  const params = supplierLocationParams({ location: 'Lahore, Punjab', lat: 31.5, lon: 74.3 }, { lat: 33.7, lng: 73.04 })!;
  assert.equal(params.get('location'), null);
  assert.equal(params.get('mode'), 'current');
  params.set('radius', '15000'); params.set('query', 'wheat');
  assert.equal(params.get('lat'), '33.7');
  assert.equal(supplierLocationParams({ location: 'Lahore, Punjab' }, null)?.get('location'), 'Lahore, Punjab');
});

test('GPS requests a fresh high-accuracy reading and handles denied, unavailable and timed-out permission', async () => {
  const position = { coords: { latitude: 33.7, longitude: 73.04, accuracy: 12 } } as GeolocationPosition;
  const result = await getCurrentSupplierLocation({ getCurrentPosition(success, _error, options) {
    assert.deepEqual(options, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); success(position);
  } });
  assert.deepEqual(result, { lat: 33.7, lng: 73.04, accuracy: 12 });
  for (const [code, message] of [[1, /denied/], [2, /unavailable/], [3, /too long/]] as const) {
    await assert.rejects(getCurrentSupplierLocation({ getCurrentPosition(_success, error) { error!({ code } as GeolocationPositionError); } }), message);
  }
  await assert.rejects(getCurrentSupplierLocation(undefined), /not supported/);
});

test('directory request uses only a broad integer tile; no exact GPS or paid provider', async () => {
  const urls: string[] = [];
  globalThis.fetch = async (url, options) => {
    urls.push(String(url));
    const query = new URLSearchParams(String(options?.body)).get('data')!;
    assert.ok(query.includes('(31,73,33,75)'));
    assert.ok(query.includes('["landuse"="plant_nursery"]'));
    assert.ok(query.includes('agricultural_machinery'));
    assert.ok(query.includes('["trade"'));
    assert.ok(!query.includes(String(lahore.lat)) && !query.includes(String(lahore.lng)));
    return Response.json({ elements: [] });
  };
  const result = await searchMarketplace(lahore, 50, '', async () => []);
  assert.equal(result.countryCode, 'PK');
  assert.deepEqual(result.suppliers, []);
  assert.deepEqual(urls, ['https://overpass-api.de/api/interpreter']);
  assert.equal(supplierSearchBounds({ lat: 1.2, lng: 179.9 }).length, 2);
});

test('coarse directory bounds cover every 50 km bearing around Islamabad and Lahore', () => {
  for (const origin of [lahore, { lat: 33.72148, lng: 73.04329 }]) {
    const [south, west, north, east] = supplierSearchBounds(origin)[0].split(',').map(Number);
    assert.ok([south, west, north, east].every(Number.isInteger));
    for (let bearing = 0; bearing < 360; bearing += 15) {
      const direction = bearing * Math.PI / 180;
      const lat = origin.lat * Math.PI / 180;
      const arc = 50 / 6371;
      const nextLat = Math.asin(Math.sin(lat) * Math.cos(arc) + Math.cos(lat) * Math.sin(arc) * Math.cos(direction));
      const nextLng = origin.lng + Math.atan2(Math.sin(direction) * Math.sin(arc) * Math.cos(lat), Math.cos(arc) - Math.sin(lat) * Math.sin(nextLat)) * 180 / Math.PI;
      assert.ok(nextLat * 180 / Math.PI >= south && nextLat * 180 / Math.PI <= north);
      assert.ok(nextLng >= west && nextLng <= east);
    }
  }
});

test('nurseries and agricultural tags add useful listings without nursery schools or closed shops', () => {
  const element = { type: 'node', id: 4, lat: 33.7, lon: 73.04 };
  const nursery = osmSupplier({ ...element, tags: { name: 'City Nursery', landuse: 'plant_nursery' } })!;
  assert.deepEqual(nursery.products, ['Plants & Nursery Supplies']);
  const seeds = osmSupplier({ ...element, tags: { name: 'Growers Centre', shop: 'agrarian', agrarian: 'seed;fertilizer;agricultural_machinery' } })!;
  assert.deepEqual(seeds.products, ['Seeds', 'Fertilizers', 'Farm Equipment']);
  assert.equal(matchesSupplierQuery(seeds, 'fertiliser'), true);
  assert.equal(matchesSupplierQuery(seeds, 'mango'), false);
  assert.equal(osmSupplier({ ...element, tags: { name: 'City Nursery School', shop: 'yes' } }), null);
  assert.equal(osmSupplier({ ...element, tags: { name: 'City Nursery', amenity: 'kindergarten' } }), null);
  assert.equal(osmSupplier({ ...element, tags: { name: 'Old Seeds', shop: 'agrarian', disused: 'yes' } }), null);
});

test('public mirror recovers from an unavailable or incomplete provider while enforcing radius', async () => {
  for (const firstResponse of [new Response('', { status: 503 }), Response.json({ elements: [], remark: 'Query timed out' })]) {
    const urls: string[] = [];
    globalThis.fetch = async url => {
      urls.push(String(url));
      return urls.length === 1 ? firstResponse : Response.json({ elements: [
        { type: 'node', id: 8, lat: 31.55, lon: 74.35, tags: { name: 'Local Nursery', landuse: 'plant_nursery' } },
        { type: 'node', id: 9, lat: 32.5, lon: 74.35, tags: { name: 'Far Nursery', landuse: 'plant_nursery' } },
      ] });
    };
    const result = await searchMarketplace(lahore, 50, '', async () => []);
    assert.deepEqual(result.suppliers.map(s => s.name), ['Local Nursery']);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(urls, ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']);
  }
});

test('only genuine listing products match; poultry farms cannot claim seeds or arbitrary search terms', () => {
  assert.equal(osmSupplier({ type: 'node', id: 1, lat: 31.5, lon: 74.3, tags: { name: 'Poultry farm', shop: 'farm' } }), null);
  assert.equal(osmSupplier({ type: 'node', id: 3, lat: 31.5, lon: 74.3, tags: { name: 'Poultry farm', shop: 'agrarian' } }), null);
  const supplier = osmSupplier({ type: 'node', id: 2, lat: 31.5, lon: 74.3, tags: { name: 'Farm Seed Store', shop: 'agrarian', product: 'Wheat;Rice' } })!;
  assert.equal(matchesSupplierQuery(supplier, 'wheat'), true);
  assert.equal(matchesSupplierQuery(supplier, 'fungicide'), false);
  assert.equal(supplier.products.includes('Fungicide'), false);
});

test('registered and public listings obey the same country, radius and product filters', async () => {
  globalThis.fetch = async () => Response.json({ elements: [
    { type: 'node', id: 1, lat: 31.53, lon: 74.35, tags: { name: 'Public wheat seeds', shop: 'agrarian' } },
    { type: 'node', id: 2, lat: 31.186, lon: 74.687, tags: { name: 'India wheat seeds', shop: 'agrarian' } },
  ] });
  const result = await searchMarketplace(lahore, 15, 'wheat', async () => [shop('Registered wheat seeds', 31.55, 74.35), shop('Far wheat seeds', 24.8, 67.1)]);
  assert.deepEqual(result.suppliers.map(s => s.name), ['Registered wheat seeds', 'Public wheat seeds']);
  assert.deepEqual(result.suppliers.map(s => s.source), ['registered', 'openstreetmap']);
});

test('provider errors never create curated/sample results; registered matches remain available', async () => {
  globalThis.fetch = async () => new Response('', { status: 503 });
  const result = await searchMarketplace(lahore, 50, '', async () => [shop('Registered', 31.55, 74.35)]);
  assert.deepEqual(result.suppliers.map(s => s.id), ['Registered']);
  assert.equal(result.warnings.length, 1);
  await assert.rejects(searchMarketplace(lahore, 50, '', async () => { throw new Error('unavailable'); }), /temporarily unavailable/);
});

test('API current mode ignores a stale city and rejects incomplete or empty GPS', async () => {
  globalThis.fetch = async url => {
    assert.ok(!String(url).includes('geocoding'));
    return Response.json({ elements: [] });
  };
  const req = (query: string) => new NextRequest(`https://example.test/api/suppliers/real?${query}`);
  const response = await GET(req('mode=current&lat=33.7&lng=73.04&location=Lahore&radius=20000'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.location.lat, 33.7); assert.equal(data.location.city, 'Current location');
  assert.equal(data.radiusKm, 20);
  for (const query of ['mode=current&location=Lahore', 'mode=current&lat=&lng=73', 'mode=current&lat=33&lng=']) {
    assert.equal((await GET(req(query))).status, 400);
  }
});
