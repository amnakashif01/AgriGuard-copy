import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../src/app/api/weather/route';
import { fetchRealSuppliersFromOpenStreetMap } from '../src/lib/external-suppliers';

const originalFetch = globalThis.fetch;
const originalWeatherKey = process.env.OPENWEATHERMAP_API_KEY;
after(() => {
  globalThis.fetch = originalFetch;
  if (originalWeatherKey === undefined) delete process.env.OPENWEATHERMAP_API_KEY;
  else process.env.OPENWEATHERMAP_API_KEY = originalWeatherKey;
});
const request = (body: unknown) => new Request('http://localhost/api/weather', {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }
});
const weather = { current: { temperature_2m: 28, relative_humidity_2m: 65, wind_speed_10m: 2, precipitation: 0, weather_code: 0, time: '2026-10-07T12:00' }, timezone: 'Asia/Karachi' };

test('weather resolves a Pakistani city without an API key', async () => {
  delete process.env.OPENWEATHERMAP_API_KEY;
  const requests: string[] = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return Response.json(String(url).includes('geocoding-api')
      ? { results: [{ latitude: 31.52, longitude: 74.35, country_code: 'PK' }] }
      : weather);
  };
  const response = await POST(request({ location: 'Lahore, Pakistan' }));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.source, 'Open-Meteo');
  assert.match(data.weatherConditions, /28°C/);
  assert.equal(requests.length, 2);
});

test('weather falls back when an optional key is invalid and accepts zero coordinates', async () => {
  process.env.OPENWEATHERMAP_API_KEY = 'invalid-test-key';
  globalThis.fetch = async (url) => String(url).includes('openweathermap')
    ? new Response('', { status: 401 }) : Response.json(weather);
  const response = await POST(request({ lat: 0, lon: 0 }));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.lat, 0);
  assert.equal(data.source, 'Open-Meteo');
});

test('weather validates input and never invents conditions on provider failure', async () => {
  delete process.env.OPENWEATHERMAP_API_KEY;
  globalThis.fetch = async () => { throw new Error('provider down'); };
  assert.equal((await POST(request({ lat: 91, lon: 0 }))).status, 400);
  assert.equal((await POST(request({}))).status, 400);
  const response = await POST(request({ lat: 31.52, lon: 74.35 }));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).weatherConditions, undefined);
});

test('supplier search requests way centers and excludes missing coordinates', async () => {
  globalThis.fetch = async (_url, options) => {
    const body = decodeURIComponent(String(options?.body));
    assert.match(body, /out center tags/);
    assert.ok(options?.signal);
    return Response.json({ elements: [
      { type: 'node', id: 1, lat: 31.52, lon: 74.35, tags: { name: 'Test seed shop' } },
      { type: 'way', id: 2, center: { lat: 31.53, lon: 74.36 }, tags: { name: 'Test farm shop' } },
      { type: 'way', id: 3, tags: { name: 'Missing coordinates' } },
      { type: 'node', id: 4, lat: 0, lon: 0, tags: { name: 'Zero coordinate shop' } }
    ] });
  };
  const suppliers = await fetchRealSuppliersFromOpenStreetMap(31.52, 74.35);
  assert.equal(suppliers.length, 2);
  assert.ok(suppliers.every(s => s.distance! <= 50));
  assert.ok(suppliers.every(s => Number.isFinite(s.location.coordinates.lat) && Number.isFinite(s.distance)));
});

import { normalizePakistanPhone } from '../src/lib/phone-number';
test('demo phone formats resolve to the exact configured Firebase test number', () => {
  for (const value of ['03001234567', '3001234567', '+923001234567', '923001234567', '00923001234567', '+92 300 123 4567']) {
    assert.equal(normalizePakistanPhone(value), '+923001234567');
  }
  assert.equal(normalizePakistanPhone('03244149474'), '+923244149474');
  assert.equal(normalizePakistanPhone('92300123456'), null);
  assert.equal(normalizePakistanPhone('01234567890'), null);
});
