import { z } from 'zod';

export const PLANT_MODEL_ID = 'onnx-community/mobilenet_v2_1.0_224-plant-disease-identification-ONNX';
export const PLANT_MODEL_REVISION = '95110a1ffcc188d1b5a36524d52e303e40c2403d';
export const PLANT_MODEL_SHA256 = 'c209f96f0a87a265b0ff6765c2e84d48038a7d8b8692d7629445b4513c344eb7';

export const PlantModelAssessmentSchema = z.object({
  model: z.literal(PLANT_MODEL_ID),
  revision: z.literal(PLANT_MODEL_REVISION),
  runtime: z.literal('ONNX Runtime CPU'),
  status: z.enum(['predicted', 'unsupported', 'unavailable']),
  predictions: z.array(z.object({ label: z.string(), score: z.number().min(0).max(100) })).max(3),
  elapsedMs: z.number().nonnegative(),
  note: z.string(),
  review: z.enum(['agreed', 'uncertain', 'disagreed', 'not_applicable', 'unavailable']).optional(),
  reviewReason: z.string().optional(),
});
export type PlantModelAssessment = z.infer<typeof PlantModelAssessmentSchema>;

export const PlantModelReviewSchema = z.object({
  applicable: z.boolean().describe('True only for a supported crop and a clear leaf image matching the classifier training scope.'),
  agrees: z.boolean().describe('True only when the visible evidence independently supports the top classifier prediction.'),
  reason: z.string().describe('Briefly explain agreement, disagreement, or why this leaf classifier is not applicable.'),
});

const CROP_ALIASES: Record<string, string> = {
  apple: 'apple', blueberry: 'blueberry', cherry: 'cherry', maize: 'maize', corn: 'maize',
  'corn (maize)': 'maize', grape: 'grape', orange: 'orange', peach: 'peach',
  'bell pepper': 'bell pepper', potato: 'potato', raspberry: 'raspberry',
  soybean: 'soybean', soyabean: 'soybean', squash: 'squash', strawberry: 'strawberry', tomato: 'tomato',
};
export function plantModelSupportsCrop(crop?: string): boolean {
  const value = crop?.trim().toLowerCase();
  // Unknown images still require independent image validation; a classifier
  // always has a top label, including for unsupported or non-plant images.
  return !value || ['unknown crop', 'unknown', 'other', 'auto', 'auto-detect'].includes(value) || !!CROP_ALIASES[value];
}

export function reviewPlantModel(
  assessment: PlantModelAssessment,
  review?: z.infer<typeof PlantModelReviewSchema>,
): PlantModelAssessment {
  if (assessment.status !== 'predicted') return { ...assessment, review: assessment.status === 'unsupported' ? 'not_applicable' : 'unavailable' };
  if (!review) return { ...assessment, review: 'uncertain', reviewReason: 'The independent image review did not confirm this prediction.' };
  const score = assessment.predictions[0]?.score ?? 0;
  const margin = score - (assessment.predictions[1]?.score ?? 0);
  return {
    ...assessment,
    review: !review.applicable ? 'not_applicable' : !review.agrees ? 'disagreed' : score < 80 || margin < 20 ? 'uncertain' : 'agreed',
    reviewReason: review.reason,
  };
}
