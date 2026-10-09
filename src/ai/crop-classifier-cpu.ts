import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import labels from '../../models/crop-disease/labels.json';
import { CLASSIFIER_MODEL, CLASSIFIER_REVISION, type ClassifierResult } from '@/lib/crop-classifier';
import { classifierBicubicResize } from './classifier-resize';

let sessionPromise: Promise<ort.InferenceSession> | undefined;
function getSession() {
  return sessionPromise ||= (async () => {
    const file = path.join(process.cwd(), 'models/crop-disease/davit.onnx');
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(file)) digest.update(chunk);
    if (digest.digest('hex') !== 'fa113cc195cc401789b06436212331b1910ead9edce991f241781a2f4c64c05b') throw new Error('Invalid classifier weights');
    return ort.InferenceSession.create(file, { executionProviders: ['cpu'], intraOpNumThreads: 1, interOpNumThreads: 1 });
  })().catch(error => { sessionPromise = undefined; throw error; });
}
// Python round() uses ties-to-even, including the publisher's centre crop offsets.
const roundEven = (value: number) => value % 1 === 0.5 ? 2 * Math.round(value / 2) : Math.round(value);
export async function preprocessClassifierImage(photoDataUri: string): Promise<Float32Array> {
  if (photoDataUri.length > 5_500_000) throw new Error('Image too large');
  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photoDataUri);
  if (!match) throw new Error('Invalid image');
  const decoded = await sharp(Buffer.from(match[1], 'base64'), { limitInputPixels: 16_000_000, failOn: 'error' })
    .rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  if (width < 32 || height < 32 || channels !== 3 || Math.max(width, height) / Math.min(width, height) > 8) throw new Error('Invalid image dimensions');
  const w = width <= height ? 235 : Math.floor(235 * width / height);
  const h = height <= width ? 235 : Math.floor(235 * height / width);
  const pixels = classifierBicubicResize(decoded.data, width, height, w, h);
  const left = roundEven((w - 224) / 2), top = roundEven((h - 224) / 2);
  const tensor = new Float32Array(3 * 224 * 224), mean = [.485, .456, .406], std = [.229, .224, .225];
  for (let y = 0; y < 224; y++) for (let x = 0; x < 224; x++) for (let c = 0; c < 3; c++) {
    tensor[c * 224 * 224 + y * 224 + x] = Math.fround(Math.fround(pixels[((y + top) * w + x + left) * 3 + c] / 255) - Math.fround(mean[c])) / Math.fround(std[c]);
  }
  return tensor;
}

function top(logits: Float32Array, vocabulary: string[], permitted?: number[]) {
  if (logits.length !== vocabulary.length || !logits.every(Number.isFinite)) throw new Error('Invalid classifier output');
  const indexes = permitted || vocabulary.map((_, index) => index);
  if (!indexes.length) throw new Error('Unsupported crop/disease mapping');
  let index = indexes[0];
  for (const i of indexes) if (logits[i] > logits[index]) index = i;
  const sum = indexes.reduce((total, i) => total + Math.exp(logits[i] - logits[index]), 0);
  return { index, label: vocabulary[index], score: Math.round(10000 / sum) / 100 };
}

export async function classifyCropCondition(photoDataUri: string): Promise<ClassifierResult> {
  const start = performance.now(), base = { model: CLASSIFIER_MODEL, revision: CLASSIFIER_REVISION } as const;
  let input: ort.Tensor | undefined, output: ort.InferenceSession.ReturnType | undefined;
  try {
    input = new ort.Tensor('float32', await preprocessClassifierImage(photoDataUri), [1, 3, 224, 224]);
    output = await (await getSession()).run({ image: input });
    for (const name of ['crop', 'category', 'disease', 'pest'] as const) {
      if (output[name]?.dims.join(',') !== `1,${labels[name].length}`) throw new Error('Unexpected classifier shape');
    }
    const crop = top(output.crop.data as Float32Array, labels.crop);
    const category = top(output.category.data as Float32Array, labels.category);
    const condition = category.label === 'healthy' ? { label: 'healthy', score: category.score }
      : category.label === 'pest/weed' ? top(output.pest.data as Float32Array, labels.pest)
      : top(output.disease.data as Float32Array, labels.disease, labels.diseaseByCrop[crop.index]);
    return { ...base, status: 'classified', elapsedMs: Math.round(performance.now() - start), prediction: {
      crop: { label: crop.label, score: crop.score },
      category: { label: category.label as 'healthy' | 'disease' | 'pest/weed', score: category.score },
      condition: { label: condition.label, score: condition.score }, cropMasked: category.label === 'disease',
    } };
  } catch {
    console.warn('Broader crop classifier unavailable; retaining explicit fallback attribution.');
    return { ...base, status: 'unavailable', elapsedMs: Math.round(performance.now() - start) };
  } finally {
    input?.dispose();
    if (output) for (const tensor of Object.values(output)) tensor.dispose();
  }
}
