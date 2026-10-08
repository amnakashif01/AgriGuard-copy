// Loaded only by the server-side diagnosis flow. No weights go to visitors' phones.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import labels from './plant-model-labels.json';
import { PLANT_MODEL_ID, PLANT_MODEL_REVISION, PLANT_MODEL_SHA256, plantModelSupportsCrop, type PlantModelAssessment } from '@/lib/plant-model';

let sessionPromise: Promise<ort.InferenceSession> | undefined;
function modelSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const bytes = await readFile(path.join(process.cwd(), 'models/plant-disease/model.onnx'));
      if (createHash('sha256').update(bytes).digest('hex') !== PLANT_MODEL_SHA256) throw new Error('Model checksum mismatch');
      return ort.InferenceSession.create(bytes, { executionProviders: ['cpu'], intraOpNumThreads: 1, interOpNumThreads: 1 });
    })().catch(error => { sessionPromise = undefined; throw error; });
  }
  return sessionPromise;
}

export async function classifyPlantImage(photoDataUri: string, crop?: string): Promise<PlantModelAssessment> {
  const start = performance.now();
  const base = { model: PLANT_MODEL_ID, revision: PLANT_MODEL_REVISION, runtime: 'ONNX Runtime CPU' } as const;
  if (!plantModelSupportsCrop(crop)) return {
    ...base, status: 'unsupported', predictions: [], elapsedMs: 0,
    note: 'This crop is outside the trained leaf classifier coverage. Gemini performs this report; no MobileNet prediction is claimed.',
  };
  try {
    if (photoDataUri.length > 5_500_000) throw new Error('Image too large');
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photoDataUri);
    if (!match) throw new Error('Invalid image');
    const source = Buffer.from(match[2], 'base64');
    const decoded = await sharp(source, { limitInputPixels: 16_000_000, failOn: 'error' })
      .rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = decoded.info;
    if (width < 32 || height < 32 || channels !== 3) throw new Error('Invalid image size');
    // Match the pinned processor: shortest edge 256, bilinear resize, center
    // crop 224, rescale 1/255, normalize mean=.5/std=.5, NCHW float32.
    const ratio = 256 / Math.min(width, height);
    const resizedWidth = Math.floor(width * ratio), resizedHeight = Math.floor(height * ratio);
    const pixels = await sharp(decoded.data, { raw: { width, height, channels: 3 } })
      .resize(resizedWidth, resizedHeight, { fit: 'fill', kernel: 'linear' })
      .extract({ left: Math.floor((resizedWidth - 224) / 2), top: Math.floor((resizedHeight - 224) / 2), width: 224, height: 224 })
      .raw().toBuffer();
    const tensor = new Float32Array(3 * 224 * 224);
    for (let i = 0; i < 224 * 224; i++) for (let c = 0; c < 3; c++) tensor[c * 224 * 224 + i] = pixels[i * 3 + c] / 127.5 - 1;
    const session = await modelSession();
    const result = await session.run({ pixel_values: new ort.Tensor('float32', tensor, [1, 3, 224, 224]) });
    const logits = Array.from(result.logits.data as Float32Array);
    if (logits.length !== 38 || logits.some(n => !Number.isFinite(n))) throw new Error('Invalid model output');
    const max = Math.max(...logits);
    const probabilities = logits.map(n => Math.exp(n - max));
    const sum = probabilities.reduce((a, b) => a + b, 0);
    const predictions = probabilities.map((n, i) => ({ label: labels[i], score: Math.round(n / sum * 10000) / 100 }))
      .sort((a, b) => b.score - a.score).slice(0, 3);
    return { ...base, status: 'predicted', predictions, elapsedMs: Math.round(performance.now() - start),
      note: 'Trained on 38 PlantVillage leaf classes. Model scores are not measured diagnostic accuracy. Gemini independently reviews applicability and prepares the report, severity estimate and image highlights.' };
  } catch {
    console.warn('Plant classifier unavailable; report uses Gemini and records the unavailable model status.');
    return { ...base, status: 'unavailable', predictions: [], elapsedMs: Math.round(performance.now() - start),
      note: 'The local leaf classifier could not process this image. This report uses Gemini; no MobileNet prediction is claimed.' };
  }
}
