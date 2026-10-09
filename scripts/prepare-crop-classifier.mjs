import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const file = path.resolve('models/crop-disease/davit.onnx');
const expected = 'fa113cc195cc401789b06436212331b1910ead9edce991f241781a2f4c64c05b';
try {
  await stat(file);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  if (process.env.VERCEL === '1') {
    console.log('Building DaViT from the pinned public checkpoint for this deployment...');
    await import('./build-crop-classifier.mjs');
  }
}
try {
  if ((await stat(file)).size !== 350987018) throw new Error('Unexpected model size');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== expected) throw new Error('Model checksum mismatch');
  console.log('Verified DaViT-Base: 350.99 MB, local CPU model.');
} catch (cause) {
  throw new Error('DaViT weights are missing or invalid. Run scripts/export-crop-classifier.py before building; see docs/crop-model-integration.md. The build must not silently ship a missing model.', { cause });
}
