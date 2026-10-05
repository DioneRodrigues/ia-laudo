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
    const result = response.json();
    assert.deepEqual(Object.fromEntries(Object.entries(result).filter(([key]) => !['logId', 'completionToken'].includes(key))), {
      success: true, originalText: 'Texto de teste.', text: 'Texto de teste.', medicalCommandCount: 0, medicalCommands: [],
    });
    assert.match(result.logId, /^[0-9a-f-]{36}$/u);
    assert.equal(typeof result.completionToken, 'string');
    assert.equal(response.headers['access-control-allow-origin'], 'https://pacs.evacenter.com');
    assert.deepEqual(await readdir(uploadsDir), []);
    const incomplete = await app.inject({ method: 'GET', url: '/admin/api/logs' });
    assert.equal(incomplete.statusCode, 401);
  });
  await t.test('expande comandos no backend e retorna a contagem', async () => {
    provider = async () => 'Chammas 1. Chammas 5.';
    const response = await app.inject(upload());
    assert.equal(response.statusCode, 200);
    const result = response.json();
    assert.equal(result.originalText, 'Chammas 1. Chammas 5.');
    assert.equal(result.success, true);
    assert.equal(result.medicalCommandCount, 2);
    assert.deepEqual(result.medicalCommands, [
        { id: 'chammas-1', label: 'Tireoide - Chammas I', alias: 'chammas 1', detectedText: 'Chammas 1', replacement: ', avascularizada ao efeito Doppler (Tipo I de Chammas).' },
        { id: 'chammas-5', label: 'Tireoide - Chammas V', alias: 'chammas 5', detectedText: 'Chammas 5', replacement: 'nódulo apenas com vascularização central (Chammas V).' },
    ]);
    assert.equal(result.text, ', avascularizada ao efeito Doppler (Tipo I de Chammas). nódulo apenas com vascularização central (Chammas V).');
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

test('falha nos comandos preserva transcrição e resposta de sucesso', async (t) => {
  const uploadsDir = await mkdtemp(join(tmpdir(), 'eden-fallback-'));
  const original = 'Nódulo sólido. Chammas 3.';
  const app = await buildApp({ logger: false, uploadsDir,
    transcribeAudio: async () => original,
    processMedicalCommands: () => { throw new Error('conteúdo clínico privado'); },
  });
  t.after(async () => { await app.close(); await rm(uploadsDir, { recursive: true, force: true }); });
  const response = await app.inject(upload());
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().success, true);
  assert.equal(response.json().originalText, original);
  assert.equal(response.json().text, original);
  assert.equal(response.json().medicalCommandCount, 0);
  assert.deepEqual(await readdir(uploadsDir), []);
});
