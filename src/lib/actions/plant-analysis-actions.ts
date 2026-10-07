'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { verifyCropUser } from '../server/verify-user';
import { diagnoseCrop } from './diagnosis-actions';

const inputSchema = z.object({
  photoDataUri: z.string().max(450000).regex(/^data:image\/(jpeg|png|webp);base64,/),
  crop: z.string().min(1).max(64), symptoms: z.string().max(2000), age: z.string().min(1).max(80),
  language: z.enum(['english', 'urdu']).default('english'),
});
const severityPrompt = ai.definePrompt({
  name: 'trackedPlantVisibleSeverity',
  input: { schema: inputSchema },
  output: { schema: z.object({
    severityScore: z.number().int().min(0).max(100).nullable(),
    explanation: z.string(),
  }) },
  prompt: `Assess the VISIBLE symptom severity of the plant in this photo for a plant health timeline.
Crop: {{{crop}}}. Reported age: {{{age}}}. Symptoms: {{{symptoms}}}.
Image: {{media url=photoDataUri}}
Return an AI-estimated integer severity index from 0 to 100: 0 means no visible symptoms; 1-33 mild/localised symptoms; 34-66 moderate symptoms; 67-100 extensive damage or severe visible decline. This is NOT diagnostic confidence, a validated disease measurement, or an estimate of the entire field. Base it only on visible damage and the supplied symptoms. Do not infer unseen plant parts, or force an improvement because this is a follow-up. Return null if the image is not a plant or the photo is inadequate to estimate severity. Explain the visible evidence in one short sentence in {{{language}}}.`,
});

export async function analyzeTrackedPlant(rawInput: z.input<typeof inputSchema>, idToken: string) {
  try { await verifyCropUser(idToken); }
  catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'Please sign in again.' }; }
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false as const, error: 'Please provide a valid plant photo, crop, age and symptoms.' };
  const input = parsed.data;
  const [diagnosis, severity] = await Promise.allSettled([
    diagnoseCrop({ ...input, symptoms: `Plant age: ${input.age}. ${input.symptoms}` }),
    severityPrompt(input),
  ]);
  if (diagnosis.status !== 'fulfilled') return { ok: false as const, error: 'Plant analysis is temporarily unavailable. Please retry.' };
  if (!diagnosis.value.ok) return diagnosis.value;
  const result = diagnosis.value.diagnosis;
  const isNotPlant = /not a crop|not a plant/i.test(result.disease);
  return {
    ok: true as const,
    analysis: {
      diagnosis: result,
      severityScore: isNotPlant ? null : severity.status === 'fulfilled' ? severity.value.output?.severityScore ?? null : null,
      severityExplanation: isNotPlant ? 'The image was not identified as a plant.' : severity.status === 'fulfilled' ? severity.value.output?.explanation || 'A severity estimate was unavailable for this image.' : 'The diagnosis is saved; the severity estimate was temporarily unavailable.',
    },
  };
}
