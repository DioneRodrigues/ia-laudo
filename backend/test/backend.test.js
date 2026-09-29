import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';

function upload({ name = 'audio', type = 'audio/webm', data = Buffer.from('test-audio'), extra = '' } = {}) {
  return {
    method: 'POST', url: '/transcribe',
    headers: { 'content-type': 'multipart/form-data; boundary=eden-test', origin: 'https://pacs.evacenter.com' },
    payload: Buffer.concat([Buffer.from(`--eden-test\r\nContent-Disposition: form-data; name="${name}"; filename="../../unsafe.webm"\r\nContent-Type: ${type}\r\n\r\n`), data, Buffer.from(`\r\n${extra}--eden-test--\r\n`)]),
  };
}

test('contrato, CORS, limites e exclusão de temporários', async (t) => {
  const uploadsDir = await mkdtemp(join(tmpdir(), 'eden-test-'));
  let provider = async (path) => { assert.equal((await readFile(path)).toString(), 'test-audio'); return 'Texto de teste.'; };
  const app = await buildApp({ logger: false, uploadsDir, transcribeAudio: (...args) => provider(...args) });
  t.after(async () => { await app.close(); await rm(uploadsDir, { recursive: true, force: true }); });
  await t.test('sucesso e remoção antes da resposta', async () => {
    const response = await app.inject(upload());
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { success: true, text: 'Texto de teste.' });
    assert.equal(response.headers['access-control-allow-origin'], 'https://pacs.evacenter.com');
    assert.deepEqual(await readdir(uploadsDir), []);
  });
  await t.test('erro do provedor não vaza conteúdo e remove áudio', async () => {
    provider = async () => { throw new Error('segredo e conteúdo clínico'); };
    const response = await app.inject(upload());
    assert.equal(response.statusCode, 502);
    assert.equal(response.json().success, false);
    assert.ok(!response.body.includes('segredo'));
    assert.deepEqual(await readdir(uploadsDir), []);
  });
  await t.test('provedor sem texto', async () => {
    provider = async () => '';
    assert.equal((await app.inject(upload())).statusCode, 502);
    assert.deepEqual(await readdir(uploadsDir), []);
  });
  for (const [label, options, status] of [
    ['campo incorreto', { name: 'wrong' }, 400],
    ['arquivo vazio', { data: Buffer.alloc(0) }, 400],
    ['formato inválido', { type: 'text/plain' }, 415],
    ['limite de tamanho', { data: Buffer.alloc(20 * 1024 * 1024 + 1) }, 413],
    ['arquivo extra', { extra: '--eden-test\r\nContent-Disposition: form-data; name="audio"; filename="second.webm"\r\nContent-Type: audio/webm\r\n\r\nextra\r\n' }, 400],
  ]) await t.test(label, async () => {
    assert.equal((await app.inject(upload(options))).statusCode, status);
    assert.deepEqual(await readdir(uploadsDir), []);
  });
  await t.test('origem rejeitada antes de processar o áudio', async () => {
    const request = upload(); request.headers.origin = 'https://unknown.example';
    assert.equal((await app.inject(request)).statusCode, 403);
    assert.deepEqual(await readdir(uploadsDir), []);
  });
  await t.test('preflight restrito para rede privada', async () => {
    const response = await app.inject({ method: 'OPTIONS', url: '/transcribe', headers: {
      origin: 'https://pacs.evacenter.com', 'access-control-request-method': 'POST', 'access-control-request-private-network': 'true',
    } });
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers['access-control-allow-private-network'], 'true');
  });
  await t.test('JSON não substitui multipart', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/transcribe', payload: { audio: 'x' } })).statusCode, 415);
  });
});
