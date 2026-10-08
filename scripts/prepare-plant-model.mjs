import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const revision = '95110a1ffcc188d1b5a36524d52e303e40c2403d';
const checksum = 'c209f96f0a87a265b0ff6765c2e84d48038a7d8b8692d7629445b4513c344eb7';
const directory = path.join(process.cwd(), 'models/plant-disease');
const destination = path.join(directory, 'model.onnx');
const valid = bytes => bytes.length === 9227028 && createHash('sha256').update(bytes).digest('hex') === checksum;
let existing;
try { existing = await readFile(destination); } catch {}
if (!existing || !valid(existing)) {
  const response = await fetch(`https://huggingface.co/onnx-community/mobilenet_v2_1.0_224-plant-disease-identification-ONNX/resolve/${revision}/onnx/model.onnx`, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`Plant model download failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!valid(bytes)) throw new Error('Plant model integrity check failed');
  await mkdir(directory, { recursive: true });
  await writeFile(destination, bytes);
}
console.log('Verified MobileNetV2 plant model: 9.23 MB, CPU inference, 38 leaf classes.');
