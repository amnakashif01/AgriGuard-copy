import { NextResponse } from 'next/server';

const validCoordinate = (value: unknown, maximum: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= maximum;

async function fetchJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 600 } });
  if (!response.ok) throw new Error(`Weather provider returned ${response.status}`);
  return response.json();
}

export async function POST(req: Request) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 });
  let { lat, lon } = body;
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  if ((lat != null || lon != null) && (!validCoordinate(lat, 90) || !validCoordinate(lon, 180))) {
    return NextResponse.json({ ok: false, message: 'Invalid coordinates.' }, { status: 400 });
  }
  if (lat == null && !location) {
    return NextResponse.json({ ok: false, message: 'Add your city in Profile to get local weather.' }, { status: 400 });
  }
  try {
    const key = process.env.OPENWEATHERMAP_API_KEY;
    if (lat == null) {
      if (key) {
        try {
          const places = await fetchJson(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${key}`);
          if (places[0]) ({ lat, lon } = places[0]);
        } catch { /* Resolve with the key-free provider below. */ }
      }
      if (lat == null) {
        const city = location.split(',')[0].trim();
        const places = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`);
        const place = places.results?.find((item: { country_code: string }) => item.country_code === 'PK') || places.results?.[0];
        if (!place) return NextResponse.json({ ok: false, message: 'City not found. Update your location in Profile.' }, { status: 404 });
        lat = place.latitude;
        lon = place.longitude;
      }
    }
    if (key) {
      try {
        const w = await fetchJson(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${key}&units=metric`);
        if (typeof w.main?.temp !== 'number') throw new Error('Missing weather readings');
        const weatherConditions = `${w.weather?.[0]?.description || 'Current weather'}; Temp ${w.main.temp}°C; Humidity ${w.main.humidity}%; Wind ${w.wind?.speed} m/s`;
        return NextResponse.json({ ok: true, weatherConditions, lat, lon, source: 'OpenWeather', raw: w });
      } catch { /* Keep weather available when an optional API key fails. */ }
    }
    const w = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&wind_speed_unit=ms&timezone=auto&forecast_days=1`);
    const c = w.current;
    if (!c || typeof c.temperature_2m !== 'number') throw new Error('Missing weather readings');
    const weatherConditions = `Temp ${c.temperature_2m}°C; Humidity ${c.relative_humidity_2m}%; Wind ${c.wind_speed_10m} m/s; Precipitation ${c.precipitation} mm; WMO weather code ${c.weather_code}; Observed ${c.time} (${w.timezone})`;
    return NextResponse.json({ ok: true, weatherConditions, lat, lon, source: 'Open-Meteo', raw: w });
  } catch {
    return NextResponse.json({ ok: false, message: 'Current weather is temporarily unavailable. Please try again.' }, { status: 502 });
  }
}
