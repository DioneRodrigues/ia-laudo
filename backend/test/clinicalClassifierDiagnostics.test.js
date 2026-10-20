import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { prepareClinicalDictationWithAI } from '../src/services/aiClinicalPipeline.js';
import { classifierError } from '../src/services/clinicalClassifierDiagnostics.js';
import { segmentTranscription } from '../src/services/clinicalSegmenter.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const text = 'Teste, teste, som testando. Lobo direito 4.5 por 3.2 por 1.0.\nLobo esquerdo 1.0, 2.3, 4.5.\nIstmo 1.5 por 3.4 por 2.5.';
const expected = [[4.5, 3.2, 1], [1, 2.3, 4.5], [1.5, 3.4, 2.5]];
const silent = { info() {}, warn() {} };
for (const examName of ['', 'Tireoide']) test(`integração /transcribe → classificador 503 → fallback → parser, exame=${examName || 'null'}`, async t => {
  let called = 0, saved;
  const { createTranscriptionLogStore } = await import('../src/services/transcriptionLogStore.js');
  const base = createTranscriptionLogStore();
  const app = await buildApp({ logger: false, transcribeAudio: async () => text,
    classifyClinicalSegments: async () => { called++; throw Object.assign(new Error('DO_NOT_LOG'), { status: 503 }); },
    transcriptionLogStore: { ...base, addTranscript(id, data) { saved = data; return base.addTranscript(id, data); } },
  });
  t.after(() => app.close());
  const boundary = 'eden-diag';
  const response = await app.inject({ method: 'POST', url: '/transcribe', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: `--${boundary}\r\nContent-Disposition: form-data; name="patientContext"\r\n\r\n${JSON.stringify({ examName })}\r\n--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="test.webm"\r\nContent-Type: audio/webm\r\n\r\nsynthetic\r\n--${boundary}--\r\n` });
  assert.equal(response.statusCode, 200); const result = response.json();
  assert.equal(called, 1); assert.equal(result.clinicalFilter.fallbackReason, 'AI_CLASSIFIER_HTTP_ERROR');
  assert.equal(result.clinicalFilter.aiStatus.status, 503); assert.equal(result.clinicalFilter.examContext.examContextId, examName ? 'tireoide' : null);
  assert.equal(result.filterDetails.ignoredSegments, 1); assert.equal(result.filterDetails.includedSegments, 3);
  assert.equal(result.filteredText, segmentTranscription(text).slice(1).map(s => s.text).join(' '));
  assert.deepEqual(result.measurements.map(m => m.values), expected);
  assert.ok(result.measurements.every(m => m.volume === undefined));
  assert.deepEqual(saved.clinicalFilter, result.clinicalFilter);
});
test('endpoint de classificação registrado, schema válido e diagnósticos retornados', async t => {
  const app = await buildApp({ logger: false, classifyClinicalSegments: async ({ segments }) => ({ segments: segments.map(s => ({ id: s.id, include: s.id !== 0, reason: s.id ? 'report' : 'conversation' })) }) });
  t.after(() => app.close());
  assert.ok(app.hasRoute({ method: 'POST', url: '/classify-clinical-segments' }));
  const payload = { examContext: { name: '', id: null }, segments: segmentTranscription(text).map(({ id, text }) => ({ id, text })) };
  const response = await app.inject({ method: 'POST', url: '/classify-clinical-segments', payload });
  assert.equal(response.statusCode, 200); const result = response.json();
  assert.equal(result.clinicalFilter.mode, 'ai'); assert.equal(result.clinicalFilter.fallbackReason, null);
  assert.equal(result.clinicalFilter.aiStatus.status, 200); assert.deepEqual(result.measurements.map(m => m.values), expected);
  assert.deepEqual(result.segments.map(s => s.include), [false, true, true, true]);
  payload.segments[1].id = 99;
  assert.equal((await app.inject({ method: 'POST', url: '/classify-clinical-segments', payload })).statusCode, 400);
});
for (const [code, reason, status] of [
  ['AI_CLASSIFIER_NOT_CALLED', 'missing_api_key', null], ['AI_CLASSIFIER_NETWORK_ERROR', 'connection_failed', null],
  ['AI_CLASSIFIER_HTTP_ERROR', 'http_401', 401], ['AI_CLASSIFIER_INVALID_JSON', 'invalid_json', null],
  ['AI_CLASSIFIER_SCHEMA_ERROR', 'invalid_segment_decisions', null], ['AI_CLASSIFIER_EMPTY_RESPONSE', 'empty_or_refused_response', null],
  ['AI_CLASSIFIER_UNKNOWN_ERROR', 'unexpected_error', null],
]) test(`diagnóstico persistido: ${code}`, async () => {
  const logs = []; const logger = { info: (...s) => logs.push(s), warn: (...s) => logs.push(s) };
  const result = await prepareClinicalDictationWithAI(text, { examName: '' }, logger, { classifier: async () => { throw classifierError(code, reason, status); } });
  assert.equal(result.clinicalFilter.fallbackReason, code); assert.equal(result.clinicalFilter.aiStatus.status, status);
  assert.ok(JSON.stringify(logs).includes('Clinical classifier falhou')); assert.ok(!JSON.stringify(logs).includes('Teste, teste'));
});
test('timeout, disabled e classificador não configurado têm causas distintas', async () => {
  const config = { ENABLE_AI_FILTER: true, USE_DETERMINISTIC_FALLBACK: true, TIMEOUT_MS: 10 };
  const timed = await prepareClinicalDictationWithAI(text, {}, silent, { config, classifier: () => new Promise(() => {}) });
  assert.equal(timed.clinicalFilter.fallbackReason, 'AI_CLASSIFIER_TIMEOUT');
  const disabled = await prepareClinicalDictationWithAI(text, {}, silent, { config: { ...config, ENABLE_AI_FILTER: false } });
  assert.equal(disabled.clinicalFilter.fallbackReason, 'AI_CLASSIFIER_DISABLED');
  assert.equal(disabled.clinicalFilter.aiStatus.called, false);
  const missing = await prepareClinicalDictationWithAI(text, {}, silent, { config });
  assert.equal(missing.clinicalFilter.fallbackReason, 'AI_CLASSIFIER_NOT_CALLED');
});
test('bridge usa o mesmo API_BASE_URL para classificação e transcrição, nunca PACS', async () => {
  const context = vm.createContext({ URL, AbortController, Blob, FormData });
  vm.runInContext(await readFile(new URL('../../extension/content/config.js', import.meta.url), 'utf8'), context);
  vm.runInContext(await readFile(new URL('../../extension/background/apiBridge.js', import.meta.url), 'utf8'), context);
  const apiBaseUrl = context.EdenVoice.CONFIG.API_BASE_URL;
  let calledUrl;
  const handler = context.EdenVoiceApiBridge.createHandler({ apiBaseUrl, extensionId: 'test', fetchImpl: async url => {
    calledUrl = url; return { ok: true, status: 200, json: async () => ({ success: true }) };
  } });
  const response = await handler.handle({ type: 'eden-voice:api-request', requestId: 'test', method: 'POST', path: '/classify-clinical-segments', json: { examContext: {}, segments: [] } }, { id: 'test' });
  assert.equal(response.status, 200);
  assert.equal(calledUrl, new URL('/classify-clinical-segments', apiBaseUrl).href);
  assert.ok(!calledUrl.includes('pacs.evacenter.com'));
});
