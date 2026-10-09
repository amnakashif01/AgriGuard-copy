import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Exercise the browser SDK used by the app. The old Node gRPC listener test
// repeatedly hit Firebase emulator issue #8654 (corrupt RESOURCE_EXHAUSTED
// lengths), before any application notification assertion could run.
test('browser notifications, deletion and responsive report controls', { skip: !process.env.FIRESTORE_EMULATOR_HOST, timeout: 60000 }, async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['tests/run-browser.mjs'], { timeout: 55000 });
  assert.match(stdout, /PASS browser notifications/);
  assert.match(stdout, /PASS delete confirmation/);
  console.log(stdout);
});
