'use server';

import { instantDiagnosisFromImageAndSymptoms, type InstantDiagnosisFromImageAndSymptomsInput } from '@/ai/flows/instant-diagnosis-from-image-and-symptoms';

// Next.js hides thrown server errors in production; return actionable, safe text.
export async function diagnoseCrop(input: InstantDiagnosisFromImageAndSymptomsInput) {
  try {
    return { ok: true as const, diagnosis: await instantDiagnosisFromImageAndSymptoms(input) };
  } catch (error) {
    const message = (error instanceof Error ? error.message : '').toLowerCase();
    let reason = 'Crop analysis is temporarily unavailable. Please try again.';
    if (/abort|timeout|timed.out|longer than expected/.test(message)) {
      reason = 'AI analysis is taking longer than expected. Your saved record is safe; please retry.';
    } else if (/api key|api_key|unauthenticated|permission.denied/.test(message)) {
      reason = 'AI diagnosis is not configured correctly. The site owner must update the Gemini API key in Vercel.';
    } else if (/429|quota|rate.limit/.test(message)) {
      reason = 'The AI service has reached its usage limit. Please try again later.';
    } else if (/not found|not supported/.test(message)) {
      reason = 'The configured AI model is unavailable. Please contact the site owner.';
    }
    return { ok: false as const, error: reason };
  }
}
