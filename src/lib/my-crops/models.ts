import type { InstantDiagnosisFromImageAndSymptomsOutput } from '@/ai/flows/instant-diagnosis-from-image-and-symptoms';

export const CROP_OPTIONS = ['Wheat', 'Maize', 'Rice', 'Cotton', 'Sugarcane', 'Potato', 'Tomato', 'Chilli', 'Onion', 'Mustard', 'Sunflower', 'Chickpea', 'Mango', 'Citrus', 'Geranium'];

export type MyCrop = {
  deletingAt?: string;
  id: string; name: string; nameKey: string; plantCount: number; nextPlantNumber: number;
  createdAt: string; updatedAt: string;
};
export type MyPlant = {
  id: string; cropId: string; name: string; nameKey: string; code: string; age: string;
  imageThumb: string; recordCount: number; latestRecordId: string;
  latestSeverityScore: number | null; latestDisease?: string;
  createdAt: string; updatedAt: string;
};
export type PlantRecord = {
  id: string; cropId: string; plantId: string; reportId: string; cropName: string;
  age: string; symptoms: string; imageThumb: string;
  status: 'Processing' | 'Complete' | 'Error';
  severityScore: number | null; severityExplanation?: string;
  diagnosis?: InstantDiagnosisFromImageAndSymptomsOutput; error?: string;
  createdAt: string; completedAt?: string;
};

export function cleanName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}
export function nameKey(value: string): string { return cleanName(value).toLowerCase(); }
export function validateName(value: string, kind: 'crop' | 'plant'): string {
  const name = cleanName(value);
  if (!name) throw new Error(`Please enter a ${kind} name.`);
  if (name.length > 64) throw new Error(`Keep the ${kind} name within 64 characters.`);
  if (/[\u0000-\u001f\u007f]/u.test(name)) throw new Error('Please use a name without control characters.');
  return name;
}
export async function nameId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nameKey(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function plantCode(cropName: string, number: number): string {
  const prefix = cleanName(cropName).replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase() || 'PL';
  return `${prefix}-${String(number).padStart(3, '0')}`;
}
export function severityTone(score: number | null): string {
  if (score === null) return 'bg-slate-300';
  return score > 66 ? 'bg-orange-500' : score > 33 ? 'bg-amber-400' : 'bg-emerald-500';
}
