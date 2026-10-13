import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

const work = await mkdtemp(path.join(os.tmpdir(), 'agriguard-yolo-build-'));
try {
  let python;
  for (const candidate of ['python3.12', 'python3']) {
    try {
      await run(candidate, ['-c', 'import sys; assert sys.version_info[:2] == (3, 12), "Python 3.12 is required"']);
      python = candidate;
      break;
    } catch {}
  }
  if (!python) throw new Error('Python 3.12 is required to export the verified YOLO11 model.');
  await run(python, ['-m', 'venv', path.join(work, 'venv')]);
  const executable = path.join(work, 'venv/bin/python');
  await run(executable, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-cache-dir', 'torch==2.8.0', 'torchvision==0.23.0', '--index-url', 'https://download.pytorch.org/whl/cpu']);
  await run(executable, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-cache-dir', 'ultralytics==8.4.45', 'onnx==1.19.1', 'onnxconverter-common==1.16.0']);
  await run(executable, ['scripts/export-yolo11-model.py'], { env: {...process.env, AGRIGUARD_YOLO_WORK:work} });
} finally {
  await rm(work, { recursive: true, force: true });
}
