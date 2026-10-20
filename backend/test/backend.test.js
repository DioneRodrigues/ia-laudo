import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp as realBuildApp } from '../src/app.js';
import { getTranscriptionFailureDiagnostics } from '../src/routes/transcribe.js';

test('diagnóstico seguro de falha da transcrição omite mensagem e conteúdo clínico', () => {
  const diagnostics = getTranscriptionFailureDiagnostics(Object.assign(new Error('texto clínico e chave secreta'), {
    code: 'ECONNRESET', status: 502, type: 'api_error', param: 'prompt', request_id: 'req_123',
    cause: { code: 'ENOTFOUND' },
  }));
  assert.deepEqual(diagnostics, {
    errorName: 'Error', errorCode: 'ECONNRESET', causeCode: 'ENOTFOUND', upstreamStatus: 502,
    upstreamType: 'api_error', upstreamParam: 'prompt', upstreamRequestId: 'req_123',
  });
  assert.ok(!JSON.stringify(diagnostics).includes('texto clínico'));
  assert.ok(!JSON.stringify(diagnostics).includes('chave secreta'));
});

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
      success: true, originalText: 'Texto de teste.', text: '', filteredText: '', measurementText: '', clinicalFilter: { mode: 'deterministic_fallback', fallbackReason: 'AI_CLASSIFIER_UNKNOWN_ERROR', aiStatus: { state: 'failed', called: true, code: 'AI_CLASSIFIER_UNKNOWN_ERROR', status: null, reason: 'unexpected_error', providerUrl: 'https://api.openai.com/v1/responses' }, examContext: { examName: '', examContextId: null, examResolution: 'unresolved' }, segments: [{ id: 0, include: false, reason: 'unknown' }] }, pipelineVersion: 5, measurements: [],
      filterDetails: { mode: 'deterministic_fallback', commandCandidates: [], measurementHints: [], filteredText: '', includedSegments: 0, ignoredSegments: 1, segments: [{ text: 'Texto de teste.', role: 'unknown', intent: 'unknown', includeInReport: false, confidence: 0 }] }, commandProcessing: { success: true }, medicalCommandCount: 0, medicalCommands: [],
      exam: { name: '', contextId: null, contextLabel: null, matchedAlias: null, resolution: 'unresolved' }, examResolution: { source: 'automatic' },
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
    const response = await app.inject(upload({ extra: '--eden-test\r\nContent-Disposition: form-data; name="patientContext"\r\n\r\n{"examName":"Tireoide"}\r\n' }));
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
  await t.test('requisição originada por extensão Chrome autorizada', async () => {
    const request = { method: 'GET', url: '/medical-commands', headers: { origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' } };
    assert.equal((await app.inject(request)).statusCode, 200);
  });
  await t.test('origem que imita extensão, mas tem ID inválido, é rejeitada', async () => {
    const request = { method: 'GET', url: '/medical-commands', headers: { origin: 'chrome-extension://not-a-valid-id' } };
    assert.equal((await app.inject(request)).statusCode, 403);
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

test('preserva status HTTP do SDK OpenAI em vez de mascarar erros como 502', async (t) => {
  const uploadsDir = await mkdtemp(join(tmpdir(), 'eden-provider-status-'));
  let upstreamError;
  const app = await buildApp({ logger: false, uploadsDir, transcribeAudio: async () => { throw upstreamError; } });
  t.after(async () => { await app.close(); await rm(uploadsDir, { recursive: true, force: true }); });
  for (const [status, expectedText] of [
    [400, 'rejeitou os parâmetros'],
    [401, 'OPENAI_API_KEY'],
    [403, 'não tem acesso ao modelo'],
    [404, 'não foi encontrado'],
    [429, 'quota e billing'],
    [502, 'erro temporário'],
  ]) {
    upstreamError = Object.assign(new Error('mensagem privada do provedor'), { status });
    const response = await app.inject(upload());
    assert.equal(response.statusCode, status);
    assert.match(response.json().error, new RegExp(expectedText, 'iu'));
    assert.ok(!response.body.includes('mensagem privada'));
    assert.deepEqual(await readdir(uploadsDir), []);
  }
});

test('TRANSCRIPTION_EMPTY mantém código público e mensagem sem dados clínicos', async (t) => {
  const uploadsDir = await mkdtemp(join(tmpdir(), 'eden-empty-'));
  const app = await buildApp({ logger: false, uploadsDir, transcribeAudio: async () => { throw Object.assign(new Error('privado'), { code: 'TRANSCRIPTION_EMPTY' }); } });
  t.after(async () => { await app.close(); await rm(uploadsDir, { recursive: true, force: true }); });
  const response = await app.inject(upload());
  assert.equal(response.statusCode, 502);
  assert.equal(response.json().code, 'TRANSCRIPTION_EMPTY');
  assert.equal(response.json().error, 'Nenhuma fala foi reconhecida.');
  assert.deepEqual(await readdir(uploadsDir), []);
});

test('falha nos comandos preserva transcrição e sinaliza checkpoint incompleto', async (t) => {
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
  assert.deepEqual(response.json().commandProcessing, { success: false, code: 'COMMAND_PROCESSING_FAILED' });
  assert.equal(response.json().originalText, original);
  assert.equal(response.json().text, original);
  assert.equal(response.json().medicalCommandCount, 0);
  assert.deepEqual(await readdir(uploadsDir), []);
});

test('catálogo de máscaras expõe aliases e replacements oficiais em modo somente leitura', async (t) => {
  const uploadsDir = await mkdtemp(join(tmpdir(), 'eden-mask-catalog-'));
  const app = await buildApp({ logger: false, uploadsDir });
  t.after(async () => { await app.close(); await rm(uploadsDir, { recursive: true, force: true }); });
  const response = await app.inject({ method: 'GET', url: '/medical-commands', headers: { origin: 'https://pacs.evacenter.com' } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  const { commands } = response.json();
  assert.ok(commands.length > 0);
  assert.ok(commands.some((command) => command.id === 'chammas-3'
    && command.category === 'Tireoide'
    && command.aliases.includes('chammas três')
    && command.replacement.includes('Tipo III de Chammas')));
  commands[0].aliases.push('alterado no cliente');
  const fresh = (await app.inject({ method: 'GET', url: '/medical-commands' })).json().commands;
  assert.ok(!fresh[0].aliases.includes('alterado no cliente'));
});

test('endpoint resolve o nome e mantém apenas comandos do exame, ignorando contextId informado', async (t) => {
  const uploadsDir = await mkdtemp(join(tmpdir(), 'eden-exam-flow-'));
  const app = await buildApp({ logger: false, uploadsDir, transcribeAudio: async () => 'Cisto simples. Hemangioma. Chammas 3.' });
  t.after(async () => { await app.close(); await rm(uploadsDir, { recursive: true, force: true }); });
  for (const [examName, expected] of [['Mama', ['mama-cisto-simples']], ['Transvaginal', []], ['Abdome Total', ['abdome-hemangioma']], ['Tireoide', ['chammas-3']], ['US XYZ 123', []]]) {
    const patient = JSON.stringify({ examName, contextId: 'mama' });
    const response = await app.inject(upload({ extra: `--eden-test\r\nContent-Disposition: form-data; name="patientContext"\r\n\r\n${patient}\r\n` }));
    assert.equal(response.statusCode, 200);
    const result = response.json();
    assert.deepEqual(result.medicalCommands.map(({ id }) => id), expected);
    assert.equal(result.exam.name, examName);
    assert.equal(result.examResolution.source, 'automatic');
    if (!expected.length) assert.equal(result.text, result.originalText);
  }
});

function buildApp(options = {}) { return realBuildApp({ classifyClinicalSegments: async () => { throw new Error('Offline test'); }, ...options }); }

test('endpoint IA preserva original, inclui negação sem expansão e persiste classificação', async (t) => {
  const uploadsDir = await mkdtemp(join(tmpdir(), 'eden-ai-'));
  const original = 'Não tem nódulo sólido. Siliconoma, ok.';
  let calls = 0, input, saved;
  const { createTranscriptionLogStore } = await import('../src/services/transcriptionLogStore.js');
  const base = createTranscriptionLogStore();
  const store = { ...base, addTranscript(id, data) { saved = data; return base.addTranscript(id, data); } };
  const app = await buildApp({ logger: false, uploadsDir, transcriptionLogStore: store,
    transcribeAudio: async () => original,
    classifyClinicalSegments: async (args) => { calls++; input = args; return { segments: args.segments.map(s => ({ id: s.id, include: s.id === 0, reason: s.id === 0 ? 'report' : 'unknown' })) }; },
  });
  t.after(async () => { await app.close(); await rm(uploadsDir, { recursive: true, force: true }); });
  const extra = '--eden-test\r\nContent-Disposition: form-data; name="patientContext"\r\n\r\n' + JSON.stringify({ examName: 'Mama', patientName: 'PRIVATE' }) + '\r\n';
  const response = await app.inject(upload({ extra }));
  assert.equal(response.statusCode, 200);
  const result = response.json();
  assert.equal(calls, 1); assert.equal(result.originalText, original); assert.equal(result.filteredText, original);
  assert.equal(result.clinicalFilter.mode, 'ai');
  assert.equal(result.medicalCommandCount, 1); assert.equal(result.medicalCommands[0].id, 'mama-siliconoma');
  assert.ok(result.text.startsWith('Não tem nódulo sólido.'));
  assert.equal(result.filterDetails.segments[0].commandCandidates[0].execute, false);
  assert.equal(result.filterDetails.segments[1].reason, 'medical_command');
  assert.deepEqual(saved.clinicalFilter, result.clinicalFilter);
  assert.ok(!JSON.stringify(input).includes('PRIVATE'));
});
