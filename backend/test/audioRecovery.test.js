import test from 'node:test';
import { createTestAudioBlob } from './fixtures/audio.js';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

test('Áudio persistente: IndexedDB nativo, checkpoints e recuperação', { timeout: 60000 }, async (t) => {
  const server = createServer((request, response) => {
    if (request.url.startsWith('/storage/player.html')) {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><body><p>Player de teste</p><script>parent.postMessage({type:"eden-audio-player",state:"error",message:"Formato inválido no player de teste."}, location.origin)</script></body>');
      return;
    }
    response.end('<!doctype html><body><div id="history"></div>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const script = (path) => page.addScriptTag({ path: fileURLToPath(new URL(`../../extension/${path}.js`, import.meta.url)) });
  async function prepare(clear = true) {
    await page.goto(origin);
    await page.evaluate(() => {
      window.chrome ||= {};
      chrome.runtime ||= {};
      chrome.runtime.getURL ||= (path = '') => `${location.origin}/${path}`;
    });
    await page.addScriptTag({ content: `window.createTestAudioBlob = ${createTestAudioBlob.toString()};` });
    await script('content/config'); await script('storage/audioStore'); await script('services/commandProcessor.generated'); await script('services/recordingProcessor'); await script('content/monitoring');
    await page.evaluate(async (clear) => {
      const EV = EdenVoice;
      if (clear) for (const row of await EV.AudioStore.getRecentRecordings()) await EV.AudioStore.deleteRecording(row.id);
      EV.CONFIG = { ...EV.CONFIG, AUTO_SUBMIT: false, REQUEST_TIMEOUT_MS: 40 };
      EV.captureContext = () => ({}); EV.contextIsCurrent = () => true;
      EV.getPatientContext = () => ({ patientName: ' João   Silva ', examName: 'Abdome' });
      window.calls = 0; window.insertions = 0; window.uploaded = [];
      EV.insertTextIntoEden = async () => { insertions++; };
      EV.ApiClient = { request: async ({ recordingId }) => {
        calls++;
        const row = await EV.AudioStore.getRecording(recordingId);
        if (!row?.audio?.blob) throw new Error('Fetch antes de persistir!');
        uploaded.push(await row.audio.blob.text());
        return { ok: true, status: 200, data: { success: true, originalText: 'original', text: 'processado', pipelineVersion: 5, medicalCommands: [] } };
      } };
      window.save = async (patch = {}) => {
        const now = new Date().toISOString();
        const row = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, status: 'pending', patient: { name: 'João Silva' }, exam: { name: 'Abdome' },
          audio: { blob: new Blob(['binary-audio'], { type: 'audio/webm' }), durationSeconds: 42 }, recording: { startedAt: now, finishedAt: now },
          processing: { retryCount: 0, attemptCount: 0, autoAttempts: 0 }, transcription: { originalText: null, processedText: null }, insertion: { success: false }, ...patch };
        await EV.AudioStore.saveRecording(row); return row.id;
      };
    }, clear);
  }
  await t.test('fallback v4 sem contexto é recalculado e expõe NOT_CALLED no histórico', async () => {
    await prepare();
    const result = await page.evaluate(async () => {
      const EV = EdenVoice;
      EV.getPatientContext = () => ({ patientName: 'João Silva', examName: 'Exame não reconhecido' });
      const originalText = 'Teste, teste, som testando. Lobo direito 4.5 por 3.2 por 1.0. Lobo esquerdo 1.0, 2.3, 4.5. Istmo 1.5 por 3.4 por 2.5.';
      const id = await save({ status: 'failed', exam: { name: 'Exame não reconhecido' }, pipelineVersion: 4,
        transcription: { originalText, processedText: '', filteredText: '', measurementText: '' },
        clinicalFilter: { mode: 'deterministic_fallback', segments: [0,1,2,3].map(id => ({ id, include: false, reason: 'unknown' })) } });
      const row = await EV.RecordingProcessor.processRecording(id);
      EV.Monitoring.renderRecordings(document.querySelector('#history'), [row], { onRetry() {}, onDelete() {}, onBack() {} });
      return { status: row.status, calls, insertions, reason: row.clinicalFilter.fallbackReason,
        values: row.measurements.map(m => m.values), history: document.querySelector('#history').textContent };
    });
    assert.equal(result.status, 'success'); assert.equal(result.calls, 0); assert.equal(result.insertions, 1);
    assert.equal(result.reason, 'AI_CLASSIFIER_NOT_CALLED'); assert.ok(result.history.includes(result.reason));
    assert.deepEqual(result.values, [[4.5, 3.2, 1], [1, 2.3, 4.5], [1.5, 3.4, 2.5]]);
  });
  await t.test('IA persistida: retry do editor e dos comandos não reclassifica nem reenvia áudio', async () => {
    await prepare();
    const result = await page.evaluate(async () => {
      const EV = EdenVoice;
      const originalText = 'Vamos lá. Transverso é 8.1, que eu já falei.';
      const filteredText = 'Transverso é 8.1, que eu já falei.';
      const clinicalFilter = { mode: 'ai', segments: [
        { id: 0, include: false, reason: 'conversation' }, { id: 1, include: true, reason: 'report' },
      ] };
      EV.ApiClient.request = async () => { calls++; return { ok: true, data: { success: true, originalText,
        text: originalText, filteredText, measurementText: filteredText, clinicalFilter, pipelineVersion: 5,
        filterDetails: { segments: [{ text: 'Vamos lá.', includeInReport: false, reason: 'conversation' }, { text: filteredText, includeInReport: true, reason: 'report' }] },
        measurements: [], commandProcessing: { success: false } } }; };
      EV.prepareClinicalDictation = () => { throw new Error('Classificação repetida!'); };
      let attempts = 0;
      EV.insertTextIntoEden = async (text) => { attempts++; if (attempts === 1) throw new Error('Editor temporariamente indisponível'); insertions++; window.insertedText = text; };
      const id = await save();
      const first = await EV.RecordingProcessor.processRecording(id);
      const second = await EV.RecordingProcessor.processRecording(id);
      const third = await EV.RecordingProcessor.processRecording(id);
      EV.Monitoring.renderRecordings(document.querySelector('#history'), [third], { onRetry() {}, onDelete() {}, onBack() {} });
      return { statuses: [first.status, second.status, third.status], calls, insertions, insertedText,
        mode: third.clinicalFilter.mode, filtered: third.transcription.filteredText,
        history: document.querySelector('#history').textContent };
    });
    assert.deepEqual(result.statuses, ['failed', 'failed', 'success']);
    assert.equal(result.calls, 1); assert.equal(result.insertions, 1); assert.equal(result.mode, 'ai');
    assert.equal(result.insertedText, 'Transverso é 8.1, que eu já falei.');
    assert.equal(result.filtered, result.insertedText); assert.ok(result.history.includes('Filtro clínico: IA'));
  });
  await t.test('medidas telegráficas de tireoide recuperadas do pipeline v2', async () => {
    await prepare();
    const result = await page.evaluate(async () => {
      EdenVoice.getPatientContext = () => ({ patientName: 'João Silva', examName: 'Tireoide' });
      const originalText = 'Lobo direito, 55,2 por 4,2 por 5,4, tá? Lobo esquerdo, 1,5 por 4,2 por 3,2. Istmo, 1,5 por 2,0 por 5,3.';
      const id = await save({ status: 'transcribed', exam: { name: 'Tireoide' }, pipelineVersion: 2,
        transcription: { originalText, processedText: '' } });
      const row = await EdenVoice.RecordingProcessor.processRecording(id);
      return { status: row.status, version: row.pipelineVersion, calls, insertions,
        original: row.transcription.originalText, filtered: row.transcription.filteredText,
        hints: row.filterDetails.measurementHints, measurements: row.measurements,
        reasons: row.filterDetails.segments.map(s => s.reason) };
    });
    assert.equal(result.status, 'success'); assert.equal(result.version, 5);
    assert.equal(result.calls, 0); assert.equal(result.insertions, 1); assert.equal(result.original, result.filtered);
    assert.equal(result.hints.length, 3); assert.equal(result.hints[0].suspiciousValue, true);
    assert.equal(result.measurements[0].values[0], 55.2);
    assert.deepEqual(result.reasons, ['clinical_measurement', 'clinical_measurement', 'clinical_measurement']);
    assert.ok(result.measurements.every(m => m.volume === undefined));
  });
  await t.test('comandos protegidos e negados: recuperação v1 e histórico', async () => {
    await prepare();
    const result = await page.evaluate(async () => {
      EdenVoice.getPatientContext = () => ({ patientName: 'João Silva', examName: 'Mama' });
      const id = await save({ status: 'transcribed', exam: { name: 'Mama' }, pipelineVersion: 1,
        transcription: { originalText: 'Siliconeoma, ok. Não tem nódulo sólido.', processedText: 'texto antigo' } });
      const row = await EdenVoice.RecordingProcessor.processRecording(id);
      EdenVoice.Monitoring.renderRecordings(document.querySelector('#history'), [row], { onRetry() {}, onDelete() {}, onBack() {} });
      return { status: row.status, commands: row.commands.map(c => c.id), calls, insertions, version: row.pipelineVersion,
        original: row.transcription.originalText, history: document.querySelector('#history').textContent };
    });
    assert.equal(result.status, 'success'); assert.equal(result.version, 5);
    assert.deepEqual(result.commands, ['mama-siliconoma']); assert.equal(result.calls, 0); assert.equal(result.insertions, 1);
    assert.equal(result.original, 'Siliconeoma, ok. Não tem nódulo sólido.');
    for (const text of ['medical_command', 'negated_medical_command', 'mama-siliconoma', 'mama-nodulo-solido', 'Negado: sim', 'Protegido: sim']) assert.ok(result.history.includes(text), text);
  });
  await t.test('conversa isolada preservada no histórico sem inserção', async () => {
    await prepare();
    assert.deepEqual(await page.evaluate(async () => {
      EdenVoice.ApiClient.request = async () => ({ ok: true, data: { success: true, originalText: 'Você já fez cirurgia? Sim, fiz ano passado.', text: 'Você já fez cirurgia? Sim, fiz ano passado.' } });
      const id = await save(); const row = await EdenVoice.RecordingProcessor.processRecording(id);
      return [row.status, row.insertion.skipped, insertions, row.transcription.filteredText, row.filterDetails.ignoredSegments];
    }), ['success', true, 0, '', 2]);
  });
  await t.test('backend antigo passa por filtro local antes da inserção', async () => {
    await prepare();
    assert.deepEqual(await page.evaluate(async () => {
      EdenVoice.ApiClient.request = async () => ({ ok: true, data: { success: true, originalText: 'Pode respirar. Rim direito 11 longitudinal, 4,3 AP, 4,8 transversal.', text: 'Pode respirar. Rim direito 11 longitudinal, 4,3 AP, 4,8 transversal.' } });
      const id = await save(); const row = await EdenVoice.RecordingProcessor.processRecording(id);
      return [row.status, insertions, row.transcription.processedText.includes('Pode respirar'), row.measurements[0].volume];
    }), ['success', 1, false, 118.7]);
  });
  await t.test('persiste antes do fetch; success somente após inserção', async () => {
    await prepare();
    assert.deepEqual(await page.evaluate(async () => {
      const id = await save(); const row = await EdenVoice.RecordingProcessor.processRecording(id);
      return [row.status, row.insertion.success, calls, insertions, uploaded];
    }), ['success', true, 1, 1, ['binary-audio']]);
  });
  for (const [label, response] of [
    ['network', null], ['502', { ok: false, status: 502, error: 'Bad gateway' }],
    ['TRANSCRIPTION_EMPTY', { ok: false, status: 502, data: { code: 'TRANSCRIPTION_EMPTY' } }],
    ['503', { ok: false, status: 503 }], ['504', { ok: false, status: 504 }],
  ]) await t.test(`${label}: failed e Blob preservado`, async () => {
    await prepare();
    const result = await page.evaluate(async (response) => {
      EdenVoice.ApiClient.request = async () => { if (!response) throw new TypeError('Failed to fetch'); return response; };
      const id = await save(); const row = await EdenVoice.RecordingProcessor.processRecording(id);
      return [row.status, await row.audio.blob.text(), row.processing.retryCount, row.processing.autoRetryable];
    }, response);
    assert.deepEqual(result, ['failed', 'binary-audio', 1, true]);
  });
  await t.test('retry usa o mesmo registro e mesmo áudio', async () => {
    await prepare();
    assert.deepEqual(await page.evaluate(async () => {
      const request = EdenVoice.ApiClient.request; const id = await save();
      EdenVoice.ApiClient.request = async (args) => { await request(args); throw new TypeError('network'); };
      await EdenVoice.RecordingProcessor.processRecording(id); EdenVoice.ApiClient.request = request;
      await EdenVoice.RecordingProcessor.processRecording(id);
      return [await EdenVoice.AudioStore.countRecordings(), calls, uploaded];
    }), [1, 2, ['binary-audio', 'binary-audio']]);
  });
  await t.test('falha Eden preserva texto; retry não chama API nem comandos novamente', async () => {
    await prepare();
    assert.deepEqual(await page.evaluate(async () => {
      const id = await save(); EdenVoice.insertTextIntoEden = async () => { throw new Error('Eden indisponível'); };
      const failed = await EdenVoice.RecordingProcessor.processRecording(id);
      EdenVoice.insertTextIntoEden = async () => { insertions++; };
      const recovered = await EdenVoice.RecordingProcessor.processRecording(id);
      return [failed.status, failed.transcription.originalText, failed.transcription.processedText, recovered.status, calls];
    }), ['failed', 'original', 'processado', 'success', 1]);
  });
  await t.test('falha nos comandos: checkpoint original e retry local sem API', async () => {
    await prepare();
    assert.deepEqual(await page.evaluate(async () => {
      EdenVoice.ApiClient.request = async () => { calls++; return { ok: true, status: 200, data: { success: true, text: 'Fala original.', originalText: 'Fala original.', commandProcessing: { success: false } } }; };
      const id = await save(); const first = await EdenVoice.RecordingProcessor.processRecording(id);
      const second = await EdenVoice.RecordingProcessor.processRecording(id);
      return [first.status, first.transcription.originalText, first.transcription.processedText, second.status, calls];
    }), ['failed', 'Fala original.', null, 'success', 1]);
  });
  await t.test('timeout e context invalidated preservam o áudio', async () => {
    await prepare();
    assert.deepEqual(await page.evaluate(async () => {
      EdenVoice.ApiClient.request = (_args, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError'))));
      const timeout = await EdenVoice.RecordingProcessor.processRecording(await save());
      EdenVoice.ApiClient.request = async () => { throw new Error('Extension context invalidated'); };
      const invalidated = await EdenVoice.RecordingProcessor.processRecording(await save());
      return [timeout.processing.lastError.code, timeout.audio.blob.size > 0, invalidated.processing.lastError.code, invalidated.audio.blob.size > 0, invalidated.processing.autoRetryable];
    }), ['TIMEOUT', true, 'CONTEXT_INVALIDATED', true, false]);
  });
  await t.test('backoff persiste 5s e 15s, sem estender o limite no reload', async () => {
    await prepare();
    const delays = await page.evaluate(async () => {
      EdenVoice.ApiClient.request = async () => ({ ok: false, status: 502 });
      const id = await save(); const first = await EdenVoice.RecordingProcessor.processRecording(id, { automatic: true });
      const a = Date.parse(first.processing.nextAttemptAt) - Date.now();
      const second = await EdenVoice.RecordingProcessor.processRecording(id, { automatic: true });
      return [a, Date.parse(second.processing.nextAttemptAt) - Date.now()];
    });
    assert.ok(delays[0] > 4500 && delays[0] <= 5000); assert.ok(delays[1] > 14500 && delays[1] <= 15000);
    await prepare(false);
    const attempts = await page.evaluate(async () => {
      EdenVoice.ApiClient.request = async () => { calls++; return { ok: false, status: 502 }; };
      const id = (await EdenVoice.AudioStore.getRecentRecordings())[0].id;
      await EdenVoice.RecordingProcessor.processRecording(id, { automatic: true });
      await EdenVoice.RecordingProcessor.processRecording(id, { automatic: true }); return calls;
    });
    assert.equal(attempts, 1);
  });
  await t.test('reload mantém pending/failed e recupera uploading sem assumir success', async () => {
    await prepare();
    await page.evaluate(async () => { await save(); await save({ status: 'failed' }); await save({ status: 'uploading' }); });
    await prepare(false);
    const rows = await page.evaluate(async () => { await EdenVoice.AudioStore.recoverInterruptedRecordings(); return (await EdenVoice.AudioStore.getRecentRecordings()).map((row) => ({ status: row.status, code: row.processing.lastError?.code, size: row.audio.blob.size })); });
    assert.equal(rows.filter((row) => row.status === 'pending').length, 1);
    assert.equal(rows.filter((row) => row.status === 'failed').length, 2);
    assert.equal(rows.filter((row) => row.code === 'PROCESS_INTERRUPTED').length, 1);
    assert.ok(rows.every((row) => row.size > 0));
  });
  await t.test('MAX_AUTO_RETRIES=3, validação permanente não repete', async () => {
    await prepare();
    assert.deepEqual(await page.evaluate(async () => {
      EdenVoice.ApiClient.request = async () => { calls++; return { ok: false, status: 502 }; };
      const id = await save();
      for (let i = 0; i < 5; i++) await EdenVoice.RecordingProcessor.processRecording(id, { automatic: true });
      const attempts = calls;
      EdenVoice.ApiClient.request = async () => { calls++; return { ok: false, status: 400 }; };
      const permanent = await save();
      for (let i = 0; i < 3; i++) await EdenVoice.RecordingProcessor.processRecording(permanent, { automatic: true });
      return [attempts, calls];
    }), [3, 4]);
  });
  await t.test('offline não envia; evento online processa pending', async () => {
    await prepare();
    await page.evaluate(async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.id = await save(); await EdenVoice.RecordingProcessor.processPendingRecordings();
    });
    assert.equal(await page.evaluate(() => calls), 0);
    await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); window.dispatchEvent(new Event('online')); });
    await page.waitForFunction(async () => (await EdenVoice.AudioStore.getRecording(id)).status === 'success');
    assert.equal(await page.evaluate(() => calls), 1);
  });
  await t.test('duplo clique e success não duplicam chamadas', async () => {
    await prepare();
    assert.equal(await page.evaluate(async () => {
      const id = await save(); await Promise.all([EdenVoice.RecordingProcessor.processRecording(id), EdenVoice.RecordingProcessor.processRecording(id)]);
      await EdenVoice.RecordingProcessor.processRecording(id); return calls;
    }), 1);
  });
  await t.test('paciente diferente ou contexto desconhecido bloqueia inserção', async () => {
    await prepare();
    assert.deepEqual(await page.evaluate(async () => {
      EdenVoice.getPatientContext = () => ({ patientName: 'Maria Souza', examName: 'Abdome' });
      const id = await save(); const row = await EdenVoice.RecordingProcessor.processRecording(id);
      return [insertions, row.status, row.processing.lastError.code, row.transcription.originalText, EdenVoice.isSameRecordingContext({}, {})];
    }), [0, 'failed', 'CONTEXT_MISMATCH', 'original', false]);
  });
  await t.test('player usa Blob, revoga URL ao fechar; delete remove Blob', async () => {
    await prepare();
    const result = await page.evaluate(async () => {
      const id = await save({ audio: { blob: createTestAudioBlob(), durationSeconds: 1 } }); const rows = await EdenVoice.AudioStore.getRecentRecordings();
      let revoked = 0; const revoke = URL.revokeObjectURL.bind(URL); URL.revokeObjectURL = (url) => { revoked++; revoke(url); };
      EdenVoice.Monitoring.renderRecordings(document.querySelector('#history'), rows, { onRetry() {}, onDelete() {}, onBack() {} });
      await [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Ouvir')).onclick();
      const url = document.querySelector('audio').src; const contents = (await (await fetch(url)).arrayBuffer()).byteLength;
      EdenVoice.Monitoring.releasePlayers(); await EdenVoice.AudioStore.deleteRecording(id);
      return [contents, revoked, await EdenVoice.AudioStore.countRecordings()];
    });
    assert.deepEqual(result, [32044, 1, 0]);
  });
  await t.test('player reproduz, pausa e sobrevive à atualização do histórico', async () => {
    await prepare();
    await page.evaluate(async () => {
      window.playbackRows = [await EdenVoice.AudioStore.getRecording(await save({ audio: { blob: createTestAudioBlob(), durationSeconds: 1 } }))];
      window.drawHistory = () => EdenVoice.Monitoring.renderRecordings(document.querySelector('#history'), playbackRows, { onRetry() {}, onDelete() {}, onBack() {} });
      drawHistory();
    });
    await page.getByRole('button', { name: 'Ouvir áudio', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('audio').currentTime > 0);
    assert.equal(await page.locator('audio').evaluate((audio) => audio.muted), false);
    await page.getByRole('button', { name: 'Pausar áudio', exact: true }).click();
    assert.equal(await page.locator('audio').evaluate((audio) => audio.paused), true);
    const unchanged = await page.evaluate(() => {
      const audio = document.querySelector('audio'); const src = audio.src; const time = audio.currentTime;
      playbackRows[0].status = 'success'; drawHistory();
      return audio === document.querySelector('audio') && audio.src === src && audio.currentTime === time;
    });
    assert.equal(unchanged, true);
    assert.equal(await page.getByRole('button', { name: 'Reprocessar', exact: true }).isVisible(), false);
    await page.getByRole('button', { name: 'Continuar áudio', exact: true }).click();
    await page.getByRole('button', { name: 'Fechar áudio', exact: true }).click();
    assert.equal(await page.locator('audio').getAttribute('src'), null);
    assert.equal(await page.getByRole('button', { name: 'Ouvir áudio', exact: true }).isEnabled(), true);
  });
  await t.test('áudio inválido abre player alternativo e preserva o Blob', async () => {
    await prepare();
    await page.evaluate(async () => {
      const id = await save(); EdenVoice.Monitoring.renderRecordings(document.querySelector('#history'), [await EdenVoice.AudioStore.getRecording(id)], { onRetry() {}, onDelete() {}, onBack() {} });
    });
    await page.getByRole('button', { name: 'Ouvir áudio', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('iframe.ev-audio-extension-player')?.src.includes('/storage/player.html'));
    assert.equal(await page.evaluate(() => EdenVoice.AudioStore.countRecordings()), 1);
  });
  await t.test('carregamento travado expira e libera o botão para nova tentativa', async () => {
    await prepare(); await page.clock.install();
    await page.evaluate(async () => {
      const id = await save({ audio: { blob: createTestAudioBlob() } });
      const row = await EdenVoice.AudioStore.getRecording(id);
      EdenVoice.AudioStore = { ...EdenVoice.AudioStore, getRecording: () => new Promise(() => {}) };
      EdenVoice.Monitoring.renderRecordings(document.querySelector('#history'), [row], { onRetry() {}, onDelete() {}, onBack() {} });
    });
    await page.getByRole('button', { name: 'Ouvir áudio', exact: true }).click();
    await page.clock.fastForward(13000);
    await page.waitForFunction(() => document.querySelector('iframe.ev-audio-extension-player')?.src.includes('/storage/player.html'));
    assert.equal(await page.evaluate(() => EdenVoice.AudioStore.countRecordings()), 1);
    await page.clock.resume();
  });
  await t.test('retenção remove success expirado e preserva failed recente acima do limite', async () => {
    await prepare();
    assert.deepEqual(await page.evaluate(async () => {
      const old = new Date(Date.now() - 3 * 3600000).toISOString();
      await save({ status: 'success', updatedAt: old, insertion: { success: true, insertedAt: old } });
      for (let i = 0; i < 31; i++) await save({ status: 'failed' });
      await EdenVoice.AudioStore.cleanupRecordings();
      const rows = await EdenVoice.AudioStore.getRecentRecordings(); return [rows.length, rows.every((row) => row.status === 'failed')];
    }), [31, true]);
  });
  await t.test('QuotaExceededError explícito, nenhum upload', async () => {
    await prepare();
    const result = await page.evaluate(async () => {
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function () { throw new DOMException('quota', 'QuotaExceededError'); };
      try { await save(); return 'unexpected'; } catch (error) { return [error.name, error.message, calls]; }
      finally { IDBObjectStore.prototype.add = add; }
    });
    assert.deepEqual(result, ['QuotaExceededError', 'Não foi possível salvar o áudio localmente por falta de espaço.', 0]);
  });
  await t.test('lock entre abas evita recuperação de operação ativa', async () => {
    await prepare();
    const id = await page.evaluate(async () => { const id = await save({ status: 'uploading' }); await EdenVoice.AudioStore.claim(id); return id; });
    const tab = await page.context().newPage();
    await tab.goto(origin);
    await tab.addScriptTag({ path: fileURLToPath(new URL('../../extension/content/config.js', import.meta.url)) });
    await tab.addScriptTag({ path: fileURLToPath(new URL('../../extension/storage/audioStore.js', import.meta.url)) });
    assert.equal(await tab.evaluate((id) => EdenVoice.AudioStore.claim(id), id), false);
    await tab.evaluate(() => EdenVoice.AudioStore.recoverInterruptedRecordings());
    assert.equal(await tab.evaluate(async (id) => (await EdenVoice.AudioStore.getRecording(id)).status, id), 'uploading');
    await page.reload();
    await tab.evaluate(() => EdenVoice.AudioStore.recoverInterruptedRecordings());
    assert.equal(await tab.evaluate(async (id) => (await EdenVoice.AudioStore.getRecording(id)).status, id), 'failed');
    await tab.close();
  });
});
