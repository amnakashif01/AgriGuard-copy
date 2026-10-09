import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { classifyCropCondition } from '../src/ai/crop-classifier-cpu';
import { detectCropLeaves } from '../src/ai/crop-detector-cpu';
import { chooseClassifierEvidence, chooseDetectorEvidence } from '../src/lib/crop-detector';

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error('Supply local JPEG/PNG/WebP images to benchmark.');
  const results = [];
  for (const file of files) {
    const extension = path.extname(file).slice(1).toLowerCase();
    const mime = extension === 'jpg' ? 'jpeg' : extension;
    const image = `data:image/${mime};base64,${(await readFile(file)).toString('base64')}`;
    const detector = await detectCropLeaves(image);
    const classifier = await classifyCropCondition(image);
    const leaf = chooseDetectorEvidence(detector);
    const broader = chooseClassifierEvidence(leaf, classifier);
    results.push({ file: path.basename(file), detectorMs: detector.elapsedMs, leafCandidate: leaf.accepted ?? null,
      classifierMs: classifier.elapsedMs, classifierStatus: classifier.status,
      prediction: classifier.prediction, broaderCandidate: broader.accepted ?? null });
    if (classifier.status === 'unavailable') throw new Error(`Classifier did not run on ${path.basename(file)}`);
  }
  console.log(JSON.stringify({ scope: 'Actual CPU inference; candidates still require image review. This is not an accuracy study or full Gemini report test.', peakRssMiB: Math.round(process.resourceUsage().maxRSS / 1024), results }, null, 2));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
