import { readFile } from 'node:fs/promises';
import { classifyPlantImage } from '../src/ai/plant-model-cpu';

// Usage: node --import tsx scripts/benchmark-plant-model.ts manifest.json
// Each item has path, expectedLabel, crop (optional), url, dataset (optional).
async function main() {
const cases = JSON.parse(await readFile(process.argv[2], 'utf8')) as Array<{path:string; expectedLabel:string; crop?:string; url:string; dataset?:string}>;
const results = [];
for (const item of cases) {
  const bytes = await readFile(item.path);
  const assessment = await classifyPlantImage(`data:image/jpeg;base64,${bytes.toString('base64')}`, item.crop);
  results.push({ source: item.url, dataset: item.dataset || 'unspecified', expected: item.expectedLabel,
    predicted: assessment.predictions[0]?.label ?? null, score: assessment.predictions[0]?.score ?? null,
    matched: assessment.predictions[0]?.label === item.expectedLabel, elapsedMs: assessment.elapsedMs,
    status: assessment.status });
}
console.log(JSON.stringify({
  model: 'MobileNetV2 PlantVillage ONNX', scope: 'Small integration sanity check, not a clinical/field accuracy estimate. PlantVillage samples may overlap training data.',
  tested: results.length, matched: results.filter(r => r.matched).length,
  meanMs: results.reduce((sum, r) => sum + r.elapsedMs, 0) / results.length, results,
}, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
