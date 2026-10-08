import { NextRequest, NextResponse } from 'next/server';
import { fetchRealSuppliersFromGooglePlaces, fetchRealSuppliersFromOpenStreetMap } from '@/lib/external-suppliers';
import { nearbySuppliers, resolveSupplierCity, validCoordinates } from '@/lib/supplier-location';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const location = searchParams.get('location')?.trim();
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  const radius = Number(searchParams.get('radius') ?? '50000'); // meters
  if (!Number.isFinite(radius) || radius < 1000 || radius > 50000) {
    return NextResponse.json({ success: false, error: 'Choose a search radius between 1 and 50 km.' }, { status: 400 });
  }
  if (!location && (!searchParams.has('lat') || !searchParams.has('lng') || !validCoordinates({ lat, lng }))) {
    return NextResponse.json({ success: false, error: 'Add your city in Profile to find nearby suppliers.' }, { status: 400 });
  }
  if (location && location.length > 200) {
    return NextResponse.json({ success: false, error: 'Please enter a valid city.' }, { status: 400 });
  }
  try {
    // Resolve the saved city first: old GPS coordinates may belong to an earlier location.
    const origin = location ? await resolveSupplierCity(location) : { lat, lng, city: 'Saved location' };
    const query = searchParams.get('query')?.trim() || undefined;
    const source = searchParams.get('source') || 'auto';
    const candidates = await (source === 'osm' ? fetchRealSuppliersFromOpenStreetMap : fetchRealSuppliersFromGooglePlaces)(origin.lat, origin.lng, radius, query);
    // Enforce the radius even if a provider or fallback ignores its requested radius.
    const suppliers = nearbySuppliers(candidates, origin, radius / 1000);
    return NextResponse.json({ success: true, count: suppliers.length, location: origin, radiusKm: radius / 1000, suppliers });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Nearby suppliers are temporarily unavailable. Please try again.' }, { status: 502 });
  }
}
