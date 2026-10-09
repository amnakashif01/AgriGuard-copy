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

/** Explain score rejection separately from a model that failed to run. */
export function classifierConfidenceIssue(result: ClassifierResult): string | undefined {
  if (result.status !== 'classified' || !result.prediction) return undefined;
  const checks = [
    ['crop identification', result.prediction.crop.score],
    ['category', result.prediction.category.score],
    ['condition match', result.prediction.condition.score],
  ] as const;
  if (checks.some(([, score]) => !Number.isFinite(score) || score < 0 || score > 100)) {
    return 'DaViT returned an invalid score, so its prediction was not used. Gemini reviewed the image.';
  }
  const low = checks.filter(([, score]) => score < CLASSIFIER_MIN_SCORE);
  if (!low.length) return undefined;
  return `DaViT completed, but ${low.map(([name, score]) => `${name} (${score.toFixed(2)}%)`).join(', ')} did not reach the ${CLASSIFIER_MIN_SCORE}% confirmation threshold. Gemini reviewed the image.`;
}
