'use server';

import { instantDiagnosisFromImageAndSymptoms, type InstantDiagnosisFromImageAndSymptomsInput } from '@/ai/flows/instant-diagnosis-from-image-and-symptoms';

// Next.js hides thrown server errors in production; return actionable, safe text.
export async function diagnoseCrop(input: InstantDiagnosisFromImageAndSymptomsInput) {
  try {
    return { ok: true as const, diagnosis: await instantDiagnosisFromImageAndSymptoms(input) };
  } catch (error) {
    const message = (error instanceof Error ? error.message : '').toLowerCase();
    let reason = 'Crop analysis is temporarily unavailable. Please try again.';
    if (message.startsWith('agrichat') || message.startsWith('crop diagnosis provider')) {
      // These are fixed, safe messages created by our adapter, not raw provider bodies.
      reason = error instanceof Error ? error.message : reason;
    } else if (/abort|timeout|timed.out|longer than expected/.test(message)) {
      reason = 'AI analysis is taking longer than expected. Your saved record is safe; please retry.';
    } else if (/api key|api_key|unauthenticated|permission.denied/.test(message)) {
      reason = 'AI diagnosis is not configured correctly. The site owner must update the Gemini API key in Vercel.';
    } else if (/429|quota|rate.limit/.test(message)) {
      reason = 'The AI service has reached its usage limit. Please try again later.';
    } else if (/schema|validation|parse|json|empty|no result/.test(message)) {
      reason = 'The AI service returned an incomplete report. Your saved photo is safe; please retry.';
    } else if (/503|502|500|unavailable|overloaded|fetch failed|econnreset/.test(message)) {
      reason = 'The AI service is temporarily busy. Your saved photo is safe; please retry shortly.';
    } else if (/not found|not supported/.test(message)) {
      reason = 'The configured AI model is unavailable. Please contact the site owner.';
    }
    return { ok: false as const, error: reason };
  }
}
