import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = '.next/server/app';
const expected = new Set([
  '(app)/dashboard/page.js.nft.json',
  '(app)/report/new/page.js.nft.json', '(app)/report/[id]/page.js.nft.json',
  '(app)/my-crops/[cropId]/new/page.js.nft.json',
  '(app)/my-crops/[cropId]/[plantId]/page.js.nft.json',
  '(app)/my-crops/[cropId]/[plantId]/new/page.js.nft.json',
  'api/coordinator/tasks/route.js.nft.json',
  'api/coordinator/process/pending/route.js.nft.json',
]);
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await inspect(file); continue; }
    if (!entry.name.endsWith('.nft.json')) continue;
    const route = path.relative(root, file);
    const { files } = JSON.parse(await readFile(file, 'utf8'));
    const models = files.filter(item => item.endsWith('.onnx')).map(item => path.basename(item)).sort();
    if (expected.has(route)) {
      if (models.join(',') !== 'davit.onnx,detector.onnx') throw new Error(`Diagnosis models missing from ${route}`);
      expected.delete(route);
    } else if (models.length) {
      throw new Error(`Unexpected model bundle in ${route}; review the Hobby function count before deploying.`);
    }
  }
}
await inspect(root);
if (expected.size) throw new Error(`Missing diagnosis route traces: ${[...expected].join(', ')}`);
console.log('Verified model packaging: both models in all 8 diagnosis routes; unrelated routes stay lightweight.');
