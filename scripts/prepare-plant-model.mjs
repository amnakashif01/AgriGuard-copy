import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const manifest = JSON.parse(await readFile('models/plant-disease/manifest.json', 'utf8'));
const destination = path.resolve('models/plant-disease/detector.onnx');
const cache = path.resolve('.next/cache/agriguard-models', `${manifest.onnxSha256}.onnx`);
async function valid(file) {
  try {
    if ((await stat(file)).size !== manifest.onnxBytes) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex') === manifest.onnxSha256;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
await mkdir(path.dirname(destination), {recursive:true});
if (!await valid(destination)) {
  if (await valid(cache)) {
    await copyFile(cache, destination);
  } else {
    console.log('Building verified YOLO11x from the pinned public crop checkpoint...');
    await import('./build-yolo11-model.mjs');
  }
}
if (!await valid(destination)) throw new Error('YOLO11 weights are missing or invalid. Refusing to deploy without the detector.');
await mkdir(path.dirname(cache), {recursive:true});
if (!await valid(cache)) await copyFile(destination, cache);
console.log(`Verified ${manifest.model}: ${manifest.onnxBytes} bytes, ${manifest.classes} categories, CPU inference.`);
