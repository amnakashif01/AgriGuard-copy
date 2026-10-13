import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewedSuppliers, recommendSuppliers } from '../src/lib/supplier-recommendations';
import { filterMarketplaceSuppliers, loadMarketplaceDirectory } from '../src/lib/marketplace-search';
import type { Supplier } from '../src/lib/models';

const now = Date.parse('2026-10-13T12:00:00Z');
const lahore = { lat: 31.558, lng: 74.3507 };
const islamabad = { lat: 33.6844, lng: 73.0479 };

test('recommendations stay inside the selected Lahore or Islamabad radius', async () => {
  for (const [city, origin] of [['Lahore', lahore], ['Islamabad', islamabad]] as const) {
    const directory = await loadMarketplaceDirectory(origin);
    for (const radius of [10, 15, 20, 25, 50]) {
      const nearby = filterMarketplaceSuppliers(directory, origin, radius);
      const picks = recommendSuppliers(nearby, radius, [], now);
      assert.equal(picks.length, Math.min(3, nearby.filter(s => s.reviewEvidence).length));
      assert.ok(picks.length >= 1);
      assert.ok(picks.every(s => s.location.city === city && s.distance! <= radius));
    }
  }
});

test('seed search recommends only matching shops and never widens radius to fill three cards', () => {
  const nearby = filterMarketplaceSuppliers(reviewedSuppliers, lahore, 50, 'seeds');
  const picks = recommendSuppliers(nearby, 50, [], now);
  assert.deepEqual(picks.map(s => s.name), ['Sky Seeds']);
  assert.deepEqual(recommendSuppliers(nearby, 1, [], now), []);
});

test('missing, stale, future, invalid or insufficient review evidence is excluded', () => {
  const base: Supplier = { ...reviewedSuppliers[0], distance: 2 };
  const evidence = base.reviewEvidence!;
  const invalid: Supplier[] = [
    { ...base, reviewEvidence: undefined },
    { ...base, reviewEvidence: { ...evidence, count: 1 } },
    { ...base, reviewEvidence: { ...evidence, checkedAt: '2025-01-01' } },
    { ...base, reviewEvidence: { ...evidence, checkedAt: '2027-01-01' } },
    { ...base, reviewEvidence: { ...evidence, url: 'https://example.com' } },
    { ...base, distance: NaN }, { ...base, rating: 6 },
    { ...base, availability: 'unavailable' },
  ];
  assert.deepEqual(recommendSuppliers(invalid, 50, [], now), []);
  assert.deepEqual(recommendSuppliers([base], NaN, [], now), []);
});

test('ranking balances review count, proximity and crop relevance without mutating input', () => {
  const base = reviewedSuppliers[0];
  const make = (id: string, count: number, products: string[] = []) => ({
    ...base, id, rating: 4.5, distance: 5, products,
    reviewEvidence: { ...base.reviewEvidence!, count },
  });
  const candidates = [make('small-sample', 5), make('established', 200), make('crop-match', 100, ['Tomato Seeds'])];
  const before = structuredClone(candidates);
  assert.equal(recommendSuppliers(candidates, 50, [], now)[0].id, 'established');
  assert.equal(recommendSuppliers(candidates, 50, ['Tomato'], now)[0].id, 'crop-match');
  assert.deepEqual(candidates, before);
  assert.equal(recommendSuppliers([candidates[0], candidates[0]], 50, [], now).length, 1);
});
