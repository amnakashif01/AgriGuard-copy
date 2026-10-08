import { z } from 'zod';
import { withAiDeadline } from '@/lib/ai-request';
import { requestZeroGpu } from './agrichat-zerogpu';

// Server-side only: imported by the diagnosis server action, never by browser code.
export const AgriChatFindingsSchema = z.object({
  crop: z.string().min(1).max(120),
  disease: z.string().min(1).max(200),
  confidence: z.number().min(0).max(100),
  severity: z.enum(['None', 'Low', 'Medium', 'High']),
  severityScore: z.number().int().min(0).max(100).nullable(),
  severityExplanation: z.string().min(1).max(2000),
  affectedParts: z.array(z.string().max(120)).max(20),
  description: z.string().min(1).max(6000),
  expertReviewRequired: z.boolean(),
}).strict();

export const AgriChatSourceSchema = z.object({
  provider: z.literal('agrichat'),
  model: z.literal('boudiafA/AgriChat'),
  revision: z.literal('e313815109845f699eb89ed51015375ccca2e9c2'),
  baseModel: z.literal('llava-hf/llava-onevision-qwen2-7b-ov-hf'),
  baseRevision: z.literal('0d50680527681998e456c7b78950205bedd8a068'),
  quantization: z.enum(['nf4', 'none']),
  confidenceType: z.literal('model-estimate'),
}).strict();

const ResponseSchema = z.object({
  diagnosis: AgriChatFindingsSchema,
  inference: AgriChatSourceSchema,
}).strict();

export function diagnosisProvider(): 'gemini' | 'agrichat' {
  const provider = process.env.CROP_DIAGNOSIS_PROVIDER || 'gemini';
  if (provider !== 'gemini' && provider !== 'agrichat') {
    throw new Error('Crop diagnosis provider is not configured correctly.');
  }
  return provider;
}

export async function requestAgriChat(input: {
  photoDataUri: string; symptoms: string; crop?: string; language?: string;
}) {
  const endpoint = process.env.AGRICHAT_ENDPOINT_URL;
  const key = process.env.AGRICHAT_API_KEY;
  if (!endpoint || !key || key.length < 32) throw new Error('AgriChat is not configured correctly.');
  let url: URL;
  try { url = new URL(endpoint); }
  catch { throw new Error('AgriChat endpoint is not configured correctly.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('AgriChat endpoint must be a private HTTPS API endpoint without URL credentials.');
  }
  const transport = process.env.AGRICHAT_TRANSPORT || 'http';
  if (!['http', 'zerogpu'].includes(transport)) throw new Error('AgriChat transport is not configured correctly.');
  const payload = { photoDataUri: input.photoDataUri, symptoms: input.symptoms,
    crop: input.crop || 'Unknown Crop', language: input.language || 'english' };
  return withAiDeadline(async signal => {
    if (transport === 'zerogpu') {
      const parsed = ResponseSchema.safeParse(await requestZeroGpu(url, key, payload, signal));
      if (!parsed.success) throw new Error('AgriChat returned an invalid result. Please retry.');
      return parsed.data;
    }
    const response = await fetch(url, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      // My Crops passes age alongside this input. Send only the service contract,
      // never record IDs, previous reports, user credentials, or arbitrary extras.
      body: JSON.stringify(payload),
    });
    // Never return provider error bodies (which can contain prompts or internal paths).
    if (response.status === 401 || response.status === 403) throw new Error('AgriChat authentication is not configured correctly.');
    if (response.status === 429 || response.status === 503) throw new Error('AgriChat is busy or warming up. Please retry shortly.');
    if (response.status === 504) throw new Error('AgriChat analysis timed out. Please retry with a clearer photo.');
    if (response.status === 422) throw new Error('AgriChat could not produce a reliable structured result. Please retry with a clearer photo.');
    if (!response.ok) throw new Error('AgriChat analysis is temporarily unavailable.');
    const parsed = ResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('AgriChat returned an invalid result. Please retry.');
    return parsed.data;
  }, transport === 'zerogpu' ? 45000 : 35000);
}
