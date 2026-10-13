import type { Supplier } from './models';
import { matchesSupplierQuery } from './supplier-location';

// Manually checked public Google Maps listings on 2026-10-13. These are dated
// snapshots, not a live Google Places feed; no paid API, customer quotes or photos.
const checkedAt = '2026-10-13';
function listing(id: string, name: string, city: string, address: string, lat: number, lng: number,
  rating: number, count: number, phone: string, products: string[], placeId: string, summary: string): Supplier {
  return { id, name, type: 'supplier', source: 'public-review',
    location: { city, address, province: city === 'Lahore' ? 'Punjab' : 'Islamabad Capital Territory', coordinates: { lat, lng } },
    rating, products, services: [], contact: { phone }, availability: 'available',
    pricing: { competitive: false }, verification: { verified: false },
    reviewEvidence: { count, checkedAt, source: 'Google Maps',
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + city)}${placeId ? `&query_place_id=${placeId}` : ''}`, summary },
  };
}
export const reviewedSuppliers: Supplier[] = [
  listing('review-hamza-barki', 'Hamza Nursery Farm & Landscaping', 'Lahore', 'Barki Road, opposite Barki Hospital, near UBL',
    31.4785744, 74.5089385, 5.0, 83, '+923008858583', ['Fruit Plants', 'Vegetable Plants', 'Herbs', 'Plants & Nursery Supplies'], '',
    'Reviewers highlight healthy plants, careful packaging and helpful service.'),
  listing('review-sky-seeds', 'Sky Seeds', 'Lahore', 'Shop 89, Vegetable Market, Multan Chungi, Wahdat Road',
    31.4983127, 74.2680469, 4.1, 1004, '+923324111426', ['Seeds', 'Vegetable Seeds', 'Fertilizers', 'Gardening Tools', 'Plant Protection'], '',
    'A seed and garden-supply shop with a substantial customer-review history.'),
  listing('review-lahore-nursery', 'Lahore Nursery', 'Lahore', 'Plot 88, Block E, Model Town',
    31.4824906, 74.3172305, 4.4, 39, '', ['Plants & Nursery Supplies'], 'ChIJq9qeGWgEGTkRnJNHrSvOJxs',
    'A well-rated wholesale plant nursery within your selected area.'),
  listing('review-daisy-model-town', 'Daisy Model Town Plant Nursery', 'Lahore', 'Plot 88 F, Model Town',
    31.4817112, 74.3166496, 4.6, 91, '', ['Plants & Nursery Supplies'], 'ChIJ8ciO0AcEGTkRkaFjkUVnR5k',
    'A highly rated local plant nursery with a larger review sample.'),
  listing('review-awan-f8', 'Awan Garden Center', 'Islamabad', 'F-8 Markaz, Islamabad',
    33.7111292, 73.0405681, 4.3, 80, '+92512260454', ['Seeds', 'Vegetable Seeds', 'Fertilizers', 'Pesticides', 'Gardening Tools'], 'ChIJ7xeqMr6_3zgRh8MExv3m2mk',
    'Feedback mentions product variety and advice; confirm delivery charges before ordering.'),
  listing('review-mehfooz-f8', 'Mehfooz Seeds Store', 'Islamabad', 'Kohistan Road, F-8 Markaz',
    33.7115774, 73.0413121, 4.4, 36, '+923468080239', ['Seeds', 'Gardening Tools', 'Fertilizers'], '',
    'Reviewers mention helpful advice, seed selection and gardening supplies.'),
  listing('review-alfazal-h9', 'Al Fazal Nursery Farm', 'Islamabad', 'Plot 12, Service Road East, H-9/3, near Excise Office',
    33.6769759, 73.0520876, 4.3, 57, '+923334595966', ['Plants & Nursery Supplies', 'Seedlings', 'Pots'], 'ChIJuZLTM32V3zgRHk7Unt2-5kk',
    'Feedback highlights seedlings, plant variety and helpful staff. Confirm individual plant prices.'),
  listing('review-makkah-nursery', 'Makkah Nursery Farm', 'Islamabad', '3 Mains Farm Road, H-9',
    33.6755839, 73.0406217, 4.3, 359, '+923005326195', ['Plants & Nursery Supplies'], 'ChIJjwyh19e_3zgRFXFGqm2FtiM',
    'A local plant nursery with an established customer-review history.'),
];

/** Only rank already nearby, query-filtered results. Never widen the radius or
 * fabricate a review for an unrated shop. More reviews reduce small-sample bias. */
export function recommendSuppliers(suppliers: Supplier[], radiusKm: number, crops: string[] = [], now = Date.now()): Supplier[] {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return [];
  const seen = new Set<string>();
  const ranked = suppliers.filter(s => {
    const r = s.reviewEvidence;
    if (s.type !== 'supplier' || s.availability === 'unavailable' || !Number.isFinite(s.distance)
      || s.distance! < 0 || s.distance! > radiusKm || !Number.isFinite(s.rating) || s.rating < 4 || s.rating > 5
      || !r || !Number.isInteger(r.count) || r.count < 5 || !/^https:\/\/www\.google\.com\/maps\//.test(r.url)) return false;
    const age = now - Date.parse(r.checkedAt);
    if (!Number.isFinite(age) || age < 0 || age > 180 * 86400000 || seen.has(s.id)) return false;
    seen.add(s.id); return true;
  });
  const score = (s: Supplier) => {
    const count = s.reviewEvidence!.count;
    const weightedRating = (s.rating * count + 4 * 20) / (count + 20);
    const cropMatch = crops.some(crop => crop.trim() && matchesSupplierQuery(s, crop)) ? 0.3 : 0;
    return weightedRating - 0.35 * (s.distance! / Math.max(1, radiusKm)) + cropMatch;
  };
  return ranked.sort((a, b) => score(b) - score(a) || a.distance! - b.distance! || a.id.localeCompare(b.id)).slice(0, 3);
}
