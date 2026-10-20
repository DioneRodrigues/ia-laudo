import test from 'node:test';
import { createTestAudioBlob } from './fixtures/audio.js';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

test('Extensão instalada: canal binário autenticado e IndexedDB na origem da extensão', { timeout: 30000 }, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'eden-extension-test-'));
  const extension = fileURLToPath(new URL('../../extension', import.meta.url));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  t.after(async () => { await context.close(); await rm(profile, { recursive: true, force: true }); });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
  const extensionOrigin = worker.url().split('/').slice(0, 3).join('/');
  await context.route(/^https?:/, (route) => route.abort());
  await context.route('https://pacs.evacenter.com/**', (route) => route.fulfill({ contentType: 'text/html',
    headers: { 'content-security-policy': "default-src 'self'; media-src 'none'; frame-src 'self' chrome-extension:" },
    body: '<!doctype html><body><div class="tiptap ProseMirror" contenteditable="true"></div></body>' }));
  const page = await context.newPage(); await page.goto('https://pacs.evacenter.com/test');
  await page.waitForFunction(() => !!document.querySelector('iframe'));
  const frame = page.frames().find((frame) => frame.url().endsWith('/storage/broker.html')) || await page.waitForEvent('framenavigated', { predicate: (frame) => frame.url().endsWith('/storage/broker.html') });
  await frame.waitForFunction(() => !!globalThis.EdenVoice?.AudioStore);
  assert.ok(frame.url().startsWith(`${extensionOrigin}/`));
  // Exercise the real isolated-world client through Chrome DevTools, not page-world injection.
  const session = await context.newCDPSession(page);
  const worlds = []; session.on('Runtime.executionContextCreated', ({ context }) => worlds.push(context));
  await session.send('Runtime.enable');
  const world = worlds.find((world) => world.origin === extensionOrigin && world.auxData?.type === 'isolated');
  assert.ok(world, 'content script execution context');
  const execute = async (expression) => {
    const result = await session.send('Runtime.evaluate', { expression, contextId: world.id, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
  const id = await execute(`(async () => {
    const now = new Date().toISOString(); const id = crypto.randomUUID();
    await EdenVoice.AudioStore.saveRecording({ id, createdAt: now, updatedAt: now, status: 'failed', patient: { name: 'Teste' }, exam: { name: 'Abdome' }, audio: { blob: new Blob(['binary-clinical-test'], { type: 'audio/webm' }) }, processing: {}, transcription: {}, insertion: {} }); return id;
  })()`);
  assert.equal(await execute(`EdenVoice.AudioStore.getRecording(${JSON.stringify(id)}).then(row => row.audio.blob.text())`), 'binary-clinical-test');
  // A real PCM tone verifies media decoding, not just Blob bytes/fetch.
  await execute(`(async () => {
    const createTestAudioBlob = ${createTestAudioBlob.toString()};
    const row = await EdenVoice.AudioStore.getRecording(${JSON.stringify(id)});
    row.id = crypto.randomUUID(); row.audio = { blob: createTestAudioBlob(), durationSeconds: 1 };
    await EdenVoice.AudioStore.saveRecording(row);
    const target = document.createElement('div'); target.id = 'playback-fixture'; document.body.append(target);
    EdenVoice.Monitoring.renderRecordings(target, [row], { onRetry() {}, onDelete() {}, onBack() {} });
  })()`);
  await page.locator('#playback-fixture').getByRole('button', { name: /Ouvir áudio/ }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some((frame) => frame.src.includes('/storage/player.html')), null, { timeout: 8000 });
  const safeAudio = page.frameLocator('#playback-fixture iframe.ev-audio-extension-player').locator('#recording-audio');
  await safeAudio.waitFor();
  await safeAudio.evaluate(async (audio) => {
    await audio.play();
    if (audio.currentTime > 0) return;
    await new Promise((resolve, reject) => {
      audio.addEventListener('timeupdate', () => audio.currentTime > 0 && resolve(), { once: true });
      setTimeout(() => reject(new Error('O áudio da extensão não iniciou.')), 4000);
    });
  });
  assert.ok(await safeAudio.evaluate((audio) => audio.currentTime > 0), 'O player da extensão reproduz com media-src none no PACS.');
  let uploads = 0;
  await context.route('**/transcribe', async (route) => {
    uploads++;
    assert.match(route.request().headers()['content-type'], /multipart\/form-data/);
    assert.ok(route.request().postDataBuffer().includes(Buffer.from('binary-clinical-test')));
    await route.fulfill({ json: { success: true, text: 'Teste', originalText: 'Teste' } });
  });
  const uploadResponse = await execute(`EdenVoice.ApiClient.request({ path: '/transcribe', method: 'POST', recordingId: ${JSON.stringify(id)}, fields: { patientContext: '{}', audioDurationSeconds: '1', recordingStartedAt: '', recordingFinishedAt: '' } })`);
  assert.equal(uploadResponse.ok, true, JSON.stringify(uploadResponse));
  assert.equal(uploads, 1);
  assert.deepEqual(await page.evaluate(() => indexedDB.databases()), [], 'PACS origin never owns the audio database');
  await page.reload();
  const recovered = page.frames().find((frame) => frame.url().endsWith('/storage/broker.html')) || await page.waitForEvent('framenavigated', { predicate: (frame) => frame.url().endsWith('/storage/broker.html') });
  await recovered.waitForFunction(() => !!globalThis.EdenVoice?.AudioStore);
  assert.equal(await recovered.evaluate(async (id) => (await EdenVoice.AudioStore.getRecording(id)).audio.blob.text(), id), 'binary-clinical-test');
});
