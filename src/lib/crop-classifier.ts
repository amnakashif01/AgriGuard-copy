import { z } from 'zod';

export const CLASSIFIER_MODEL = 'DaViT-Base' as const;
export const CLASSIFIER_REVISION = '907148a4ef8669e80e5c85ae5f029725b40fb3f3';
export const CLASSIFIER_MIN_SCORE = 80;
const PredictionSchema = z.object({ label: z.string(), score: z.number().finite().min(0).max(100) });
export const ClassifierResultSchema = z.object({
  model: z.literal(CLASSIFIER_MODEL), revision: z.literal(CLASSIFIER_REVISION),
  status: z.enum(['classified', 'unavailable']), elapsedMs: z.number().nonnegative(),
  prediction: z.object({
    crop: PredictionSchema,
    category: z.object({ label: z.enum(['healthy', 'disease', 'pest/weed']), score: z.number().finite().min(0).max(100) }),
    condition: PredictionSchema,
    // Disease scores are conditional on the predicted crop, as in the publisher pipeline.
    cropMasked: z.boolean(),
  }).optional(),
});
export type ClassifierResult = z.infer<typeof ClassifierResultSchema>;
