import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { createTranscriptionLogStore } from '../src/services/transcriptionLogStore.js';

function transcriptionRequest() {
  const boundary = 'eden-admin-test';
  const fields = [
    ['patientContext', JSON.stringify({ patientName: 'Paciente Teste', gender: 'Feminino', age: '42 anos', examName: 'Ultrassonografia' })],
    ['audioDurationSeconds', '47'], ['recordingStartedAt', '2026-10-05T09:00:00-03:00'],
    ['recordingFinishedAt', '2026-10-05T09:00:47-03:00'],
  ].map(([name, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`).join('');
  const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\nfake-audio\r\n`;
  return { method: 'POST', url: '/transcribe', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: `${prefix}${fields}--${boundary}--\r\n` };
}

test('log store limita registros e requer token one-time para finalizar status', () => {
  const store = createTranscriptionLogStore({ maxEntries: 2 });
  const first = store.begin({ patient: { patientName: 'Paciente A' } });
  store.addTranscript(first.id, { originalText: 'Chammas três', finalText: 'Chammas III expandido', commands: [{ id: 'x', label: 'X', alias: 'Chammas três', detectedText: 'Chammas três', replacement: 'Chammas III expandido' }], durationMs: 3210 });
  assert.equal(store.finish(first.id, 'token-incorreto', { status: 'success' }), false);
  assert.equal(store.finish(first.id, first.token, { status: 'success' }), true);
  assert.equal(store.finish(first.id, first.token, { status: 'error' }), false);
  store.begin({ patient: { patientName: 'Paciente B' } });
  store.begin({ patient: { patientName: 'Paciente C' } });
  const logs = store.list();
  assert.equal(logs.length, 2);
  assert.equal(logs[0].patient.name, 'Paciente C');
  assert.equal(logs[1].patient.name, 'Paciente B');
  assert.equal(logs.some((log) => log.id === first.id), false);
});

test('transcrição e callback de inserção alimentam o painel administrativo', async (t) => {
  const uploadsDir = await mkdtemp(join(tmpdir(), 'eden-admin-flow-'));
  const app = await buildApp({
    logger: false, uploadsDir,
    adminPassword: 'senha-administrativa-bem-forte',
    adminSessionSecret: 'segredo-de-sessao-com-mais-de-32-bytes',
    adminCookieSecure: false,
    transcribeAudio: async () => 'Chammas três.',
  });
  t.after(async () => { await app.close(); await rm(uploadsDir, { recursive: true, force: true }); });
  const result = await app.inject(transcriptionRequest());
  assert.equal(result.statusCode, 200);
  const { logId, completionToken } = result.json();
  const login = await app.inject({ method: 'POST', url: '/admin/api/login', payload: { password: 'senha-administrativa-bem-forte' } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const pending = (await app.inject({ method: 'GET', url: '/admin/api/logs', headers: { cookie } })).json().logs[0];
  assert.equal(pending.status, 'processing');
  assert.equal(pending.patient.name, 'Paciente Teste');
  assert.equal(pending.exam.name, 'Ultrassonografia');
  assert.equal(pending.audio.durationSeconds, 47);
  assert.equal(pending.transcription.originalText, 'Chammas três.');
  assert.equal(pending.commands.length, 1);
  const update = await app.inject({ method: 'POST', url: `/transcribe/${logId}/status`, payload: { status: 'success', completionToken } });
  assert.equal(update.statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/admin/api/logs', headers: { cookie } })).json().logs[0].status, 'success');
  assert.equal((await app.inject({ method: 'POST', url: `/transcribe/${logId}/status`, payload: { status: 'error', completionToken } })).statusCode, 404);
});

test('painel admin exige autenticação, autentica cookie seguro e serve logs privados', async (t) => {
  const uploadsDir = await mkdtemp(join(tmpdir(), 'eden-admin-'));
  const app = await buildApp({
    logger: false, uploadsDir,
    adminPassword: 'senha-administrativa-bem-forte',
    adminSessionSecret: 'segredo-de-sessao-com-mais-de-32-bytes',
    adminCookieSecure: false,
    transcribeAudio: async () => 'Chammas três.',
  });
  t.after(async () => { await app.close(); await rm(uploadsDir, { recursive: true, force: true }); });
  const html = await app.inject({ method: 'GET', url: '/admin' });
  assert.equal(html.statusCode, 200);
  assert.match(html.body, /Monitoramento/);
  assert.match(html.headers['content-security-policy'], /default-src 'self'/);
  assert.equal((await app.inject({ method: 'GET', url: '/admin/styles.css' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/admin/app.js' })).statusCode, 200);
  const logo = await app.inject({ method: 'GET', url: '/admin/clinic-logo.png' });
  assert.equal(logo.statusCode, 200);
  assert.equal(logo.headers['content-type'], 'image/png');
  assert.ok(logo.rawPayload.length > 0);
  assert.equal((await app.inject({ method: 'GET', url: '/admin/api/logs' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/admin/api/login', payload: { password: 'incorreta' } })).statusCode, 401);
  const login = await app.inject({ method: 'POST', url: '/admin/api/login', payload: { password: 'senha-administrativa-bem-forte' } });
  assert.equal(login.statusCode, 200);
  const cookie = login.headers['set-cookie'].split(';')[0];
  assert.match(login.headers['set-cookie'], /HttpOnly/u);
  assert.match(login.headers['set-cookie'], /SameSite=Strict/u);
  const session = await app.inject({ method: 'GET', url: '/admin/api/session', headers: { cookie } });
  assert.equal(session.json().authenticated, true);
  assert.equal(session.json().secureCookie, false);
  const list = await app.inject({ method: 'GET', url: '/admin/api/logs', headers: { cookie } });
  assert.deepEqual(list.json(), { success: true, logs: [] });
  assert.equal((await app.inject({ method: 'POST', url: '/admin/api/logout', headers: { cookie } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/admin/api/logs', headers: { cookie } })).statusCode, 401);
});

test('painel indica configuração ausente sem derrubar a API de transcrição', async (t) => {
  const uploadsDir = await mkdtemp(join(tmpdir(), 'eden-admin-config-'));
  const app = await buildApp({ logger: false, uploadsDir, adminPassword: '', adminSessionSecret: '' });
  t.after(async () => { await app.close(); await rm(uploadsDir, { recursive: true, force: true }); });
  assert.equal((await app.inject({ method: 'GET', url: '/admin/api/session' })).json().configured, false);
  const login = await app.inject({ method: 'POST', url: '/admin/api/login', payload: { password: 'anything' } });
  assert.equal(login.statusCode, 503);
  assert.equal((await app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
});
