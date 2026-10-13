import { iso1A2Code } from '@rapideditor/country-coder';
import { deleteApp, initializeServerApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { collection, getDocs, getFirestore } from 'firebase/firestore/lite';
import { firebaseConfig } from './firestore';
import type { Supplier } from './models';
import { nearbySuppliers, validCoordinates, matchesSupplierQuery, type Coordinates } from './supplier-location';
import pakistanDirectory from './pakistan-suppliers.json';

export type MarketplaceSupplier = Supplier & { source: 'registered' | 'openstreetmap' };
export const countryAt = (point: Coordinates) => validCoordinates(point) ? iso1A2Code([point.lng, point.lat]) : undefined;

/** A coarse regional tile, never the device's precise coordinates, goes to OSM. */
export function supplierSearchBounds(point: Coordinates): string[] {
  const south = Math.max(-90, Math.floor(point.lat - 50 / 110));
  const north = Math.min(90, Math.ceil(point.lat + 50 / 110));
  const latitude = Math.min(89, Math.max(Math.abs(south), Math.abs(north)));
  const pad = Math.min(180, 50 / (110 * Math.cos(latitude * Math.PI / 180)));
  const west = Math.floor(point.lng - pad);
  const east = Math.ceil(point.lng + pad);
  if (east - west >= 360) return [`${south},-180,${north},180`];
  if (west < -180) return [`${south},${west + 360},${north},180`, `${south},-180,${north},${east}`];
  if (east > 180) return [`${south},${west},${north},180`, `${south},-180,${north},${east - 360}`];
  return [`${south},${west},${north},${east}`];
}

export function filterMarketplaceSuppliers(suppliers: Supplier[], origin: Coordinates, radiusKm: number, query = ''): Supplier[] {
  const country = countryAt(origin);
  if (!country) return [];
  return nearbySuppliers(suppliers, origin, radiusKm).filter(supplier =>
    countryAt(supplier.location.coordinates) === country && matchesSupplierQuery(supplier, query));
}

type OSMElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string | undefined> };

const supplierSelectors = [
  '["shop"~"^(agrarian|agriculture|agro|agricultural_supplies|agricultural_machinery|seed|seeds|farm|garden_centre|garden_machinery|tractor)$"]',
  '["landuse"="plant_nursery"]["name"]',
  '["trade"~"agricultur|irrigation",i]',
];
const productLabels: Record<string, string> = {
  seed: 'Seeds', seeds: 'Seeds', fertilizer: 'Fertilizers', fertiliser: 'Fertilizers',
  pesticide: 'Pesticides', fungicide: 'Fungicides', agricultural_machinery: 'Farm Equipment',
  machine_parts: 'Equipment Parts', tools: 'Tools', irrigation: 'Irrigation',
};

export function osmSupplier(element: OSMElement): MarketplaceSupplier | null {
  const tags = element.tags || {};
  const coordinates = { lat: element.lat ?? element.center?.lat, lng: element.lon ?? element.center?.lon };
  if (!tags.name || !validCoordinates(coordinates)) return null;
  if (/^(school|kindergarten|childcare|college|university)$/.test(tags.amenity || '')
    || /nursery\s+school|pre[- ]?school|kindergarten/i.test(tags.name)
    || ['disused', 'abandoned', 'demolished', 'closed'].some(key => tags[key] === 'yes' || tags[`${key}:shop`])
    || /^(vacant|no|closed)$/.test(tags.shop || '')) return null;
  const declared = [tags.product, tags.produce, tags.crop, tags['agricultural:products'], tags.agrarian, tags['shop:agrarian']]
    .filter((value): value is string => typeof value === 'string').flatMap(value => value.split(';')).map(value => value.trim()).filter(Boolean)
    .map(value => productLabels[value.toLowerCase()] || value.replace(/_/g, ' '));
  // Farm shops can sell dairy, poultry or honey; do not advertise them as seed dealers.
  const cropTerms = /seed|fertili[sz]er|pesticide|fungicide|agro|agri|grain|wheat|rice|maize|corn|tomato|mango|fruit|vegetable|crop|irrigation|tractor/i;
  if (/poultry|dairy|honey|beekeep/i.test(tags.name) && !cropTerms.test([...declared, tags.name].join(' '))) return null;
  if (tags.shop === 'farm' && !cropTerms.test([tags.name, ...declared].join(' '))) return null;
  const products = [...new Set(declared)];
  for (const [pattern, label] of [[/seed/i, 'Seeds'], [/fertili[sz]er/i, 'Fertilizers'], [/pesticide/i, 'Pesticides'], [/fungicide/i, 'Fungicides'], [/equipment|machinery|tractor/i, 'Farm Equipment'], [/irrigation/i, 'Irrigation']] as const) {
    if (pattern.test(tags.name) && !products.includes(label)) products.push(label);
  }
  if (tags.landuse === 'plant_nursery' || /nurser(y|ies)|نرسری/i.test(tags.name)) products.push('Plants & Nursery Supplies');
  if (/^(tractor|agricultural_machinery|garden_machinery)$/.test(tags.shop || '') || tags.craft === 'agricultural_engines') products.push('Farm Equipment');
  if (!products.length) products.push(tags.shop === 'garden_centre' ? 'Garden Supplies' : 'Agricultural Supplies');
  return {
    id: `osm-${element.type}-${element.id}`, source: 'openstreetmap', name: tags.name, type: 'supplier',
    location: { coordinates, address: tags['addr:full'] || [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', '), city: tags['addr:city'] || '', province: tags['addr:state'] || '' },
    products: [...new Set(products)], services: [], contact: { phone: tags.phone || tags['contact:phone'] || tags.mobile || '', ...(tags['contact:whatsapp'] && { whatsapp: tags['contact:whatsapp'] }) },
    rating: 0, availability: 'available', pricing: { competitive: false }, verification: { verified: false },
  };
}

export async function loadMarketplaceDirectory(origin: Coordinates): Promise<MarketplaceSupplier[]> {
  if (countryAt(origin) !== 'PK') return fetchFreeMarketplaceSuppliers(origin);
  // The official regional extract includes businesses mapped only by name as
  // well as nursery areas. It works even when the public Overpass API is down,
  // and does not transmit the user's location to an external map service.
  return pakistanDirectory.elements.map(osmSupplier)
    .filter((supplier): supplier is MarketplaceSupplier => supplier !== null);
}

export async function fetchFreeMarketplaceSuppliers(origin: Coordinates): Promise<MarketplaceSupplier[]> {
  const country = countryAt(origin);
  if (!country) throw new Error('We could not identify your location. Please use your saved city or try locating again.');
  // Narrow by country and indexed business tags before searching the coarse tile.
  // Unrestricted office/name scans can exhaust the public provider's time budget.
  const queries = supplierSearchBounds(origin).flatMap(bounds => supplierSelectors.map(selector => `nwr${selector}(area.country)(${bounds});`)).join('');
  // Stay within the route's 60 s budget, including saved-city lookup. Both services
  // expose the same free OSM data; a temporary outage must not silently hide shops.
  for (const [endpoint, seconds, deadline] of [
    ['https://overpass-api.de/api/interpreter', 12, 15000],
    ['https://overpass.private.coffee/api/interpreter', 20, 35000],
  ] as const) {
    const query = `[out:json][timeout:${seconds}];area["ISO3166-1"="${country}"]["admin_level"="2"]->.country;(${queries});out center tags;`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST', body: new URLSearchParams({ data: query }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AgriGuard/1.0 (agricultural supplier directory)' },
        signal: AbortSignal.timeout(deadline), next: { revalidate: 900 },
      });
      if (!response.ok) {
        console.warn('[marketplace] Directory HTTP failure', { provider: new URL(endpoint).hostname, status: response.status });
        continue;
      }
      const data = await response.json();
      if (!Array.isArray(data.elements) || data.remark) {
        console.warn('[marketplace] Directory query incomplete', { provider: new URL(endpoint).hostname });
        continue;
      }
      return data.elements.map(osmSupplier).filter((supplier: MarketplaceSupplier | null): supplier is MarketplaceSupplier =>
        supplier !== null && countryAt(supplier.location.coordinates) === country);
    } catch (error) {
      console.warn('[marketplace] Directory transport failure', { provider: new URL(endpoint).hostname, reason: error instanceof Error ? error.name : 'UnknownError' });
    }
  }
  throw new Error('Public supplier search is temporarily unavailable. Please try again.');
}

export async function loadRegisteredSuppliers(authIdToken?: string): Promise<Supplier[]> {
  // Continue only this caller's session. Firestore still enforces its rules;
  // no admin credential or shared mutable server-side sign-in is used.
  if (authIdToken && authIdToken.length > 10000) throw new Error('Invalid marketplace session');
  const app = initializeServerApp(firebaseConfig, { authIdToken });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const auth = getAuth(app);
        await auth.authStateReady();
        if (authIdToken && !auth.currentUser) throw new Error('Marketplace session expired');
        const snapshot = await getDocs(collection(getFirestore(app), 'suppliers'));
        return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Supplier));
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Registered supplier lookup timed out')), 8000); }),
    ]);
  } finally {
    clearTimeout(timer);
    await deleteApp(app);
  }
}

export async function searchMarketplace(origin: Coordinates, radiusKm: number, query: string, registered = loadRegisteredSuppliers, publicDirectory = loadMarketplaceDirectory) {
  const countryCode = countryAt(origin);
  if (!countryCode) throw new Error('We could not identify your location. Please use your saved city or try locating again.');
  const [saved, directory] = await Promise.allSettled([registered(), publicDirectory(origin)]);
  if (saved.status === 'rejected' && directory.status === 'rejected') throw new Error('Supplier search is temporarily unavailable. Please try again.');
  const candidates: MarketplaceSupplier[] = [
    ...(saved.status === 'fulfilled' ? saved.value.map(supplier => ({ ...supplier, source: 'registered' as const })) : []),
    ...(directory.status === 'fulfilled' ? directory.value : []),
  ];
  const suppliers = filterMarketplaceSuppliers(candidates, origin, radiusKm, query) as MarketplaceSupplier[];
  const seen = new Set<string>();
  const deduplicated = suppliers.filter(supplier => {
    const key = `${supplier.name.trim().toLowerCase()}|${supplier.location.coordinates.lat.toFixed(3)}|${supplier.location.coordinates.lng.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const warnings = [
    ...(saved.status === 'rejected' ? ['Registered listings could not be loaded; showing available public listings.'] : []),
    ...(directory.status === 'rejected' ? ['Public listings could not be loaded; showing available registered listings.'] : []),
  ];
  return { suppliers: deduplicated, countryCode, country: new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode), warnings,
    directoryUpdatedAt: countryCode === 'PK' && publicDirectory === loadMarketplaceDirectory ? pakistanDirectory.updatedAt : undefined };
}
