import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const revision = '8dce599ce0122b304b1fff3cb0d58c90e1f44805';
const checksum = '17c9e8ef5151e4018a015a5c78e04cfae7288a3b097a9b26f5c0f77fac85c191';
const directory = path.join(process.cwd(), 'models/plant-disease');
const destination = path.join(directory, 'detector.onnx');
const valid = bytes => bytes.length === 80515434 && createHash('sha256').update(bytes).digest('hex') === checksum;
let existing;
try { existing = await readFile(destination); } catch {}
if (!existing || !valid(existing)) {
  const response = await fetch(`https://raw.githubusercontent.com/dovh25/plantdoc-live-demo/${revision}/training/plantdoc_yolo/weights/best.onnx`, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`Plant model download failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!valid(bytes)) throw new Error('Plant model integrity check failed');
  await mkdir(directory, { recursive: true });
  await writeFile(destination, bytes);
}
console.log('Verified YOLO11m PlantDoc detector: 80.52 MB, CPU inference, 29 leaf categories.');
