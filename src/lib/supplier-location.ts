import type { Supplier } from './models';

export type Coordinates = { lat: number; lng: number };
export const DEFAULT_SUPPLIER_RADIUS_KM = 50;

export function validCoordinates(value: unknown): value is Coordinates {
  const point = value as Coordinates | undefined;
  return !!point && typeof point.lat === 'number' && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90
    && typeof point.lng === 'number' && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
}

export function distanceKm(from: Coordinates, to: Coordinates): number {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const a = Math.sin(rad(to.lat - from.lat) / 2) ** 2
    + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(rad(to.lng - from.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

/** Recalculate distance: provider ordering and cached distance values are not trusted. */
export function nearbySuppliers(suppliers: Supplier[], origin: Coordinates, radiusKm = DEFAULT_SUPPLIER_RADIUS_KM): Supplier[] {
  if (!validCoordinates(origin) || !Number.isFinite(radiusKm) || radiusKm <= 0) return [];
  return suppliers.flatMap(supplier => {
    if (!validCoordinates(supplier.location?.coordinates)) return [];
    const distance = distanceKm(origin, supplier.location.coordinates);
    return distance <= radiusKm ? [{ ...supplier, distance }] : [];
  }).sort((a, b) => a.distance - b.distance);
}

/** A changed city takes precedence over coordinates saved for an earlier city. */
export function supplierLocationParams(profile: { location?: string; lat?: number; lon?: number } | null): URLSearchParams | null {
  if (profile?.location?.trim()) return new URLSearchParams({ location: profile.location.trim() });
  const point = { lat: profile?.lat, lng: profile?.lon };
  return validCoordinates(point) ? new URLSearchParams({ lat: String(point.lat), lng: String(point.lng) }) : null;
}

export async function resolveSupplierCity(location: string): Promise<Coordinates & { city: string }> {
  const city = location.split(',')[0].trim();
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`, {
    signal: AbortSignal.timeout(8000), next: { revalidate: 86400 },
  });
  if (!response.ok) throw new Error('City lookup is temporarily unavailable. Please try again.');
  const data = await response.json();
  const candidates = (Array.isArray(data.results) ? data.results : []).filter((place: any) =>
    place.country_code === 'PK' && validCoordinates({ lat: place.latitude, lng: place.longitude }));
  candidates.sort((a: any, b: any) =>
    Number(String(b.name).toLowerCase() === city.toLowerCase()) - Number(String(a.name).toLowerCase() === city.toLowerCase())
    || (b.population || 0) - (a.population || 0));
  const place = candidates[0];
  if (!place) throw new Error('City not found in Pakistan. Please update your city in Profile.');
  return { lat: place.latitude, lng: place.longitude, city: [place.name, place.admin1].filter(Boolean).join(', ') };
}
