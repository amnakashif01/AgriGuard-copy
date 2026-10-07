import { nameKey } from './models';

// Bundled photos keep crop cards independent of third-party image services.
// Attribution and licenses: /images/crops/credits.html
const CROP_PHOTOS: Readonly<Record<string, string>> = {
  wheat: '/images/crops/wheat.jpg',
  maize: '/images/crops/maize.jpg',
  rice: '/images/crops/rice.jpg',
  cotton: '/images/crops/cotton.jpg',
  sugarcane: '/images/crops/sugarcane.jpg',
  potato: '/images/crops/potato.jpg',
  tomato: '/images/crops/tomato.jpg',
  chilli: '/images/crops/chilli.jpg',
  onion: '/images/crops/onion.jpg',
  mustard: '/images/crops/mustard.jpg',
  sunflower: '/images/crops/sunflower.jpg',
  chickpea: '/images/crops/chickpea.jpg',
  mango: '/images/crops/mango.jpg',
  citrus: '/images/crops/citrus.jpg',
  geranium: '/images/crops/geranium.jpg',
};

export function cropPhotoSource(name: string): string | undefined {
  const key = nameKey(name);
  return Object.hasOwn(CROP_PHOTOS, key) ? CROP_PHOTOS[key] : undefined;
}
