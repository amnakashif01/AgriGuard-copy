import { NextRequest, NextResponse } from 'next/server';
import { loadRegisteredSuppliers, searchMarketplace } from '@/lib/marketplace-search';
import { resolveSupplierCity, validCoordinates } from '@/lib/supplier-location';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const current = searchParams.get('mode') === 'current';
  const location = current ? undefined : searchParams.get('location')?.trim();
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  const radius = Number(searchParams.get('radius') ?? '50000'); // meters
  if (!Number.isFinite(radius) || radius < 1000 || radius > 50000) {
    return NextResponse.json({ success: false, error: 'Choose a search radius between 1 and 50 km.' }, { status: 400 });
  }
  if (!location && (!searchParams.get('lat')?.trim() || !searchParams.get('lng')?.trim() || !validCoordinates({ lat, lng }))) {
    return NextResponse.json({ success: false, error: 'Use My Location or add your city in Profile to find nearby suppliers.' }, { status: 400 });
  }
  if (location && location.length > 200) {
    return NextResponse.json({ success: false, error: 'Please enter a valid city.' }, { status: 400 });
  }
  try {
    // Resolve the saved city first: old GPS coordinates may belong to an earlier location.
    const origin = location ? await resolveSupplierCity(location) : { lat, lng, city: current ? 'Current location' : 'Saved location' };
    const query = (searchParams.get('query')?.trim() || '').slice(0, 200);
    const authorization = request.headers.get('authorization');
    const authIdToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined;
    const result = await searchMarketplace(origin, radius / 1000, query, () => loadRegisteredSuppliers(authIdToken));
    return NextResponse.json({ success: true, ...result, count: result.suppliers.length, location: { ...origin, countryCode: result.countryCode }, radiusKm: radius / 1000 }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Nearby suppliers are temporarily unavailable. Please try again.' }, { status: 502 });
  }
}
