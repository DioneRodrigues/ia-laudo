(() => {
  const EV = globalThis.EdenVoice;
  const processingIds = new Set();
  let timer;
  const normalize = (value) => String(value || '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR');
  EV.isSameRecordingContext = (saved, current) => {
    const patient = normalize(saved?.patient?.name ?? saved?.patientName);
    const exam = normalize(saved?.exam?.name ?? saved?.examName);
    // Unknown identity is never sufficient authorization to insert clinical text.
    return !!patient && !!exam && patient === normalize(current?.patientName) && exam === normalize(current?.examName);
  };
  const emit = () => window.dispatchEvent(new Event('eden-recordings-changed'));
  const structuredError = (stage, error) => ({ stage, code: error.code || (error.name === 'AbortError' ? 'TIMEOUT' : 'PROCESS_FAILED'), message: error.message || String(error), timestamp: new Date().toISOString() });
  const failure = (message, code, retryable = false) => Object.assign(new Error(message), { code, retryable });
  async function saveLog(row) {
    const { blob, ...audio } = row.audio;
    const log = { ...row, timestamp: row.createdAt, audio, status: row.status === 'failed' ? 'error' : row.status,
      finalText: row.transcription?.processedText || '', error: row.processing?.lastError || null };
    delete log.remoteCompletionToken;
    try { await EV.LogStore?.saveLog(log); } catch { console.warn('[Eden Voice] Falha de observabilidade; gravação preservada'); }
  }
  async function report(row, status, error) {
    if (!row.remoteLogId || !row.remoteCompletionToken) return;
    try { await EV.ApiClient.request({ path: `/transcribe/${encodeURIComponent(row.remoteLogId)}/status`, method: 'POST', json: { status, completionToken: row.remoteCompletionToken, ...(error ? { error } : {}) } }); }
    catch { console.warn('[Eden Voice] Falha ao atualizar monitoramento remoto'); }
  }
  async function processRecording(id, { automatic = false, isActive = () => true, onStage = () => {} } = {}) {
    if (processingIds.has(id)) return;
    processingIds.add(id);
    let locked = false, editorLocked = false, row, stage = 'storage', attempted = false;
    try {
      locked = await EV.AudioStore.claim(id);
      if (!locked) return;
      row = await EV.AudioStore.getRecording(id);
      if (!row || row.status === 'success') return row;
      if (automatic && (navigator.onLine === false || !['pending', 'failed'].includes(row.status)
        || (row.processing?.autoAttempts || 0) >= EV.AUDIO_RETENTION.MAX_AUTO_RETRIES
        || (row.status === 'failed' && !row.processing?.autoRetryable))) return row;
      if (!(row.audio?.blob instanceof Blob) || !row.audio.blob.size) throw failure('Áudio local inválido.', 'INVALID_BLOB');
      if (navigator.onLine === false && !row.transcription?.originalText) return row;
      // Capture route/editor before asynchronous work as well as comparing patient/exam before insertion.
      let editorContext;
      try { editorContext = EV.captureContext(); } catch { /* Transcription can still be saved without an editor. */ }
      const valid = () => isActive() && !!editorContext && EV.contextIsCurrent(editorContext)
        && EV.isSameRecordingContext(row, EV.getPatientContext());
      const checkpoint = async (patch) => {
        let saved;
        try { saved = await EV.AudioStore.updateRecording(id, patch); }
        catch (error) { stage = 'storage'; throw error; }
        if (!saved) throw failure('Gravação local não encontrada.', 'RECORDING_MISSING');
        row = saved; emit(); return row;
      };
      attempted = true;
      await checkpoint({ processing: { attemptCount: (row.processing?.attemptCount || 0) + 1,
        autoAttempts: (row.processing?.autoAttempts || 0) + (automatic ? 1 : 0), lastAttemptAt: new Date().toISOString(), lastError: null, nextAttemptAt: null } });
      if (!row.transcription?.originalText) {
        stage = 'upload'; await checkpoint({ status: 'uploading' }); onStage('transcribing');
        console.info('[Eden Voice] Enviando gravação pendente', id, 'Tentativa:', row.processing.attemptCount);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), EV.CONFIG.REQUEST_TIMEOUT_MS);
        let response;
        try {
          response = await EV.ApiClient.request({ path: '/transcribe', method: 'POST', recordingId: id,
            fields: { patientContext: JSON.stringify({ patientName: row.patient.name, gender: row.patient.gender, age: row.patient.age, examName: row.exam.name }),
              audioDurationSeconds: String(row.audio.durationSeconds || 0), recordingStartedAt: row.recording.startedAt, recordingFinishedAt: row.recording.finishedAt } }, { signal: controller.signal });
        } catch (error) {
          if (error.name === 'AbortError') throw failure('Tempo limite de transcrição excedido.', 'TIMEOUT', true);
          if (/context invalidated/i.test(error.message)) { stage = 'context'; throw failure('Extension context invalidated. Recarregue a página; áudio preservado.', 'CONTEXT_INVALIDATED'); }
          throw failure(error.message, 'NETWORK_ERROR', true);
        } finally { clearTimeout(timeout); }
        stage = 'transcription';
        const data = response.data;
        if (!response.ok || data?.success !== true) {
          const code = data?.code || data?.error?.code || `HTTP_${response.status}`;
          throw failure(response.error || data?.error?.message || (typeof data?.error === 'string' ? data.error : 'Falha na transcrição.'), code,
            ['TRANSCRIPTION_EMPTY', 'HTTP_502', 'HTTP_503', 'HTTP_504', 'HTTP_0'].includes(code));
        }
        if (typeof data.text !== 'string' || (!data.text.trim() && !data.originalText?.trim())) throw failure('Nenhuma fala foi reconhecida. Resposta do backend sem text válido.', 'TRANSCRIPTION_EMPTY', true);
        // commandProcessor already runs in POST /transcribe. Persist its complete result with the raw text.
        await checkpoint({ status: 'transcribed', transcription: { originalText: data.originalText || data.text, processedText: data.commandProcessing?.success === false ? null : data.text,
          filteredText: data.filteredText, measurementText: data.measurementText, durationMs: Date.now() - Date.parse(row.processing.lastAttemptAt) },
          filterDetails: data.filterDetails, clinicalFilter: data.clinicalFilter, measurements: data.measurements, pipelineVersion: data.pipelineVersion,
          commands: Array.isArray(data.medicalCommands) ? data.medicalCommands : [],
          exam: { ...data.exam, name: row.exam.name }, remoteLogId: data.logId || null, remoteCompletionToken: data.completionToken || null });
        console.info('[Eden Voice] Checkpoint salvo: transcribed', id);
        if (data.commandProcessing?.success === false) { stage = 'command-processing'; throw failure('Falha ao processar comandos. Transcrição original preservada; reprocessar retoma os comandos localmente.', 'COMMAND_PROCESSING_FAILED'); }
      }
      stage = 'command-processing';
      if (row.pipelineVersion !== 5 || typeof row.transcription.processedText !== 'string') {
        await checkpoint({ status: 'processing' });
        const details = {};
        const clinical = row.pipelineVersion === 5 && row.clinicalFilter && typeof row.transcription.measurementText === 'string'
          ? { text: row.transcription.measurementText, filteredText: row.transcription.filteredText, clinicalFilter: row.clinicalFilter,
              filterDetails: row.filterDetails, measurements: row.measurements, pipelineVersion: row.pipelineVersion }
          : EV.prepareClinicalDictation(row.transcription.originalText, { examName: row.exam.name }, console,
              row.clinicalFilter && (row.pipelineVersion === 5 || row.clinicalFilter.mode === 'ai') ? { classification: { segments: row.clinicalFilter.segments }, mode: row.clinicalFilter.mode } : {});
        const processedText = EV.processMedicalCommands(clinical.text, details, { info() {}, warn() {} }, { examName: row.exam.name });
        if (typeof processedText !== 'string' || (clinical.text.trim() && !processedText.trim())) throw failure('Resultado dos comandos inválido; transcrição preservada.', 'COMMAND_PROCESSING_FAILED');
        await checkpoint({ pipelineVersion: clinical.pipelineVersion, filterDetails: clinical.filterDetails, clinicalFilter: clinical.clinicalFilter, measurements: clinical.measurements, transcription: { processedText, filteredText: clinical.filteredText, measurementText: clinical.text }, commands: details.commands || [], exam: { ...details.exam, name: row.exam.name } });
      }
      if (row.filterDetails?.failed) throw failure('Filtro indisponível. Transcrição preservada para revisão; inserção automática bloqueada.', 'FILTER_FAILED');
      if (!row.transcription.processedText.trim()) {
        await checkpoint({ status: 'success', processing: { lastError: null, autoRetryable: false }, insertion: { skipped: true, reason: 'NO_REPORT_SEGMENTS' } });
        await saveLog(row); void report(row, 'success'); return row;
      }
      await checkpoint({ status: 'processing' });
      stage = 'context';
      if (!valid()) throw failure('O paciente/exame atualmente aberto é diferente da gravação original ou não pôde ser identificado. Transcrição pronta, aguardando contexto correto.', 'CONTEXT_MISMATCH');
      stage = 'eden-editor';
      editorLocked = await EV.AudioStore.claim('__eden_editor__');
      if (!editorLocked) throw failure('Outro ditado está sendo inserido. Aguarde e reprocesse esta gravação.', 'EDITOR_BUSY');
      if (!row.insertion?.success) {
        await checkpoint({ status: 'inserting' });
        if (!valid()) throw failure('O paciente ou exame mudou antes da inserção.', 'CONTEXT_MISMATCH');
        await EV.insertTextIntoEden(row.transcription.processedText, editorContext, valid);
        await checkpoint({ insertion: { success: true, insertedAt: new Date().toISOString(), error: null } });
      }
      if (EV.CONFIG.AUTO_SUBMIT && !row.insertion?.submittedAt) {
        if (normalize(editorContext.editor?.innerText) !== normalize(row.transcription.processedText)) throw failure('O conteúdo do editor mudou após a inserção. Confira e envie pelo Eden manualmente.', 'INSERTION_UNCONFIRMED');
        // Never automatically repeat a click whose result could have been lost during reload.
        if (row.insertion?.submitStartedAt) throw failure('Envio anterior ao Eden não confirmado. Confira o relatório no Eden manualmente.', 'SUBMIT_UNCONFIRMED');
        onStage('submitting');
        const button = await EV.waitForEdenSubmit(editorContext, valid);
        await checkpoint({ insertion: { submitStartedAt: new Date().toISOString() } });
        if (!valid()) throw failure('O paciente ou exame mudou antes do envio.', 'CONTEXT_MISMATCH');
        EV.clickEdenSubmit(button, editorContext);
        await checkpoint({ insertion: { submittedAt: new Date().toISOString() } });
      }
      await checkpoint({ status: 'success', processing: { lastError: null, autoRetryable: false } });
      console.info('[Eden Voice] Inserção concluída; gravação marcada como success', id);
      await saveLog(row);
      void report(row, 'success');
      await EV.AudioStore.cleanupRecordings().catch(() => console.warn('[Eden Voice] Limpeza adiada'));
      return row;
    } catch (error) {
      if (!row) throw error;
      const detail = structuredError(stage, error);
      const autoAttempts = row.processing?.autoAttempts || 0;
      const nextAttemptAt = error.retryable && autoAttempts < EV.AUDIO_RETENTION.MAX_AUTO_RETRIES
        ? new Date(Date.now() + (autoAttempts < 2 ? 5000 : 15000)).toISOString() : null;
      try {
        row = await EV.AudioStore.updateRecording(id, { status: 'failed', processing: { retryCount: (row.processing?.retryCount || 0) + (attempted ? 1 : 0), lastError: detail, autoRetryable: !!error.retryable, nextAttemptAt },
          ...(stage === 'eden-editor' ? { insertion: { error: detail } } : {}) });
      } catch (storageError) { console.error('[Eden Voice] Falha ao salvar checkpoint; Blob original permanece no armazenamento', id); throw storageError; }
      console.warn('[Eden Voice] Falha no processamento; áudio preservado localmente', id, stage, detail.code);
      await saveLog(row);
      emit(); void report(row, 'error', detail);
      return row;
    } finally {
      if (editorLocked) await EV.AudioStore.release('__eden_editor__').catch(() => {});
      if (locked) await EV.AudioStore.release(id).catch(() => {});
      processingIds.delete(id);
      void schedule().catch(() => {});
    }
  }
  async function schedule() {
    clearTimeout(timer);
    if (navigator.onLine === false) return;
    const rows = await EV.AudioStore.getRecentRecordings();
    const next = rows.filter((row) => !processingIds.has(row.id) && ['pending', 'failed'].includes(row.status)
      && (row.status === 'pending' || row.processing?.autoRetryable)
      && (row.processing?.autoAttempts || 0) < EV.AUDIO_RETENTION.MAX_AUTO_RETRIES);
    if (!next.length) return;
    const when = Math.min(...next.map((row) => row.processing?.nextAttemptAt ? Date.parse(row.processing.nextAttemptAt) : Date.now()));
    timer = setTimeout(() => { void processPendingRecordings().catch(() => {}); }, Math.max(100, when - Date.now()));
  }
  async function processPendingRecordings() {
    if (navigator.onLine === false) return;
    for (const row of await EV.AudioStore.getRecentRecordings()) {
      if (row.processing?.nextAttemptAt && Date.parse(row.processing.nextAttemptAt) > Date.now()) continue;
      if (['pending', 'failed'].includes(row.status)) await processRecording(row.id, { automatic: true });
    }
    await schedule();
  }
  async function initialize() {
    await EV.AudioStore.recoverInterruptedRecordings(); await EV.AudioStore.cleanupRecordings(); emit(); await schedule();
  }
  window.addEventListener('online', () => { void processPendingRecordings().catch(() => {}); });
  window.addEventListener('pagehide', () => clearTimeout(timer));
  EV.RecordingProcessor = { processRecording, processPendingRecordings, initialize, processingIds };
})();
