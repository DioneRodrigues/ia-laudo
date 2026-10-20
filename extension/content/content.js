(() => {
  const EV = globalThis.EdenVoice;
  if (EV.initialized) return;
  EV.initialized = true;
  const logger = EV.Logger || { info: (...args) => console.info('[Eden Voice]', ...args), warn: (...args) => console.warn('[Eden Voice]', ...args), error: (...args) => console.error('[Eden Voice]', ...args), timestamp: () => new Date().toISOString(), formatDateTime: () => ({ date: '', time: '' }), text: () => {} };
  logger.info('Extensão carregada');
  let ui, recorder, context, blob, audioURL, timer, stopPauseWatch;
  let state = 'idle', error = '', text = '', epoch = 0;
  let medicalCommandCount = 0;
  let medicalCommands = [];
  let currentRecording = null;
  let closeRequested = false;
  const draw = () => ui?.render({ state, error, audioURL, text, medicalCommandCount, medicalCommands, exam: currentRecording?.exam });
  const safePatientContext = () => {
    try { return EV.getPatientContext?.() || { patientName: null, gender: null, age: null, examName: null, patientInfoRaw: null }; }
    catch (failure) { logger.warn('Falha ao capturar contexto do paciente', failure); return { patientName: null, gender: null, age: null, examName: null, patientInfoRaw: null }; }
  };
  const createRecording = () => {
    const startedAt = new Date();
    let contextSnapshot;
    try { contextSnapshot = EV.captureContext(); }
    catch (failure) { logger.warn('Não foi possível capturar o contexto do editor', failure); contextSnapshot = null; }
    const patient = safePatientContext();
    return {
      id: globalThis.crypto?.randomUUID?.() || `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: logger.timestamp(startedAt), ...logger.formatDateTime(startedAt),
      patient: { name: patient.patientName, gender: patient.gender, age: patient.age, patientInfoRaw: patient.patientInfoRaw },
      exam: { name: patient.examName }, audio: { durationSeconds: 0, sizeBytes: 0 },
      transcription: { durationMs: 0, originalText: '', startedAt: null, finishedAt: null },
      commands: [], finalText: '', status: 'recording', error: null,
      recordingStartedAt: startedAt.toISOString(), recordingFinishedAt: null, recordingStartedPerf: performance.now(),
      currentStage: 'microphone', recordingContext: patient, editorContext: contextSnapshot,
    };
  };
  const saveCurrentLog = (status, failure = null) => {
    if (!currentRecording || currentRecording.persisted) return;
    const log = { ...currentRecording, status, error: failure ? { stage: failure.stage, message: String(failure.message || failure) } : null };
    delete log.recordingStartedPerf; delete log.recordingContext; delete log.editorContext; delete log.currentStage;
    try {
      const saving = EV.LogStore?.saveLog(log);
      if (saving?.catch) saving.catch((storageError) => logger.warn(`Falha de monitoramento (storage): ${storageError.message}`));
      else if (!EV.LogStore) logger.warn('Falha de monitoramento (storage): armazenamento local indisponível');
    } catch (storageError) { logger.warn(`Falha de monitoramento (storage): ${storageError.message}`); }
    return log;
  };
  const recordFailure = (stage, failure) => {
    if (currentRecording) {
      if (!currentRecording.audio.recordingFinishedAt) {
        const now = new Date();
        currentRecording.recordingFinishedAt = now.toISOString();
        currentRecording.audio.recordingFinishedAt = now.toISOString();
        currentRecording.audio.durationSeconds = recorder?.durationSeconds() ?? currentRecording.audio.durationSeconds;
      }
      currentRecording.transcription.finishedAt ||= currentRecording.transcription.startedAt ? new Date().toISOString() : null;
      if (currentRecording.transcription.startedPerf) {
        currentRecording.transcription.durationMs = performance.now() - currentRecording.transcription.startedPerf;
        delete currentRecording.transcription.startedPerf;
      }
      saveCurrentLog('error', { stage, message: failure?.message || failure });
    }
  };
  const fail = (message, next = 'error') => {
    error = message; state = next;
    logger.error(message);
    draw();
  };
  const releaseAudio = () => {
    stopPauseWatch?.(); stopPauseWatch = null;
    clearInterval(timer);
    recorder?.dispose(); recorder = null; blob = null;
    if (audioURL) URL.revokeObjectURL(audioURL);
    audioURL = '';
  };
  const reset = () => {
    epoch++;
    releaseAudio(); context = null; currentRecording = null; text = ''; error = ''; state = 'idle';
    medicalCommandCount = 0;
    medicalCommands = [];
    ui?.time(0); draw();
  };
  const start = async () => {
    if (state !== 'idle' || EV.RecordingProcessor.processingIds.size) return;
    closeRequested = false;
    const operation = ++epoch;
    try {
      currentRecording = createRecording();
      context = EV.captureContext();
      currentRecording.editorContext = context;
      logger.info('Editor TipTap encontrado');
      state = 'requesting'; error = ''; draw();
      await EV.ensureEdenPaused(context, () => operation === epoch);
      if (operation !== epoch) return;
      stopPauseWatch = EV.watchEdenPaused(context,
        () => operation === epoch && ['requesting', 'recording', 'paused'].includes(state),
        async (failure) => {
          if (['recording', 'paused'].includes(state)) {
            // Finaliza e preserva o áudio já capturado para reprodução/transcrição.
            await stop();
            if (operation === epoch && state === 'ready') fail(failure.message, 'ready');
          } else {
            recordFailure('microphone', failure); epoch++; releaseAudio(); fail(failure.message);
          }
        });
      const recordingSnapshot = currentRecording;
      recorder = new EV.AudioRecorder((failure) => {
        recordFailure('recording', failure); epoch++; releaseAudio(); fail(failure.message);
      }, async (finalBlob, durationSeconds) => {
        recordingSnapshot.recordingFinishedAt = new Date().toISOString();
        recordingSnapshot.audio.durationSeconds = durationSeconds;
        if (currentRecording === recordingSnapshot) {
          blob = finalBlob;
        }
        try { await persistFinalAudio(recordingSnapshot, finalBlob); }
        finally {
          if (currentRecording === recordingSnapshot) {
            if (audioURL) URL.revokeObjectURL(audioURL);
            audioURL = URL.createObjectURL(finalBlob);
          }
        }
      });
      await recorder.start();
      if (operation !== epoch) return;
      if (!EV.contextIsCurrent(context)) throw new Error('A página mudou. Inicie um novo ditado.');
      state = 'recording'; draw();
      currentRecording.currentStage = 'recording';
      const startedAt = new Date();
      currentRecording.recordingStartedAt = startedAt.toISOString();
      currentRecording.recordingStartedPerf = performance.now();
      currentRecording.timestamp = logger.timestamp(startedAt);
      Object.assign(currentRecording, logger.formatDateTime(startedAt));
      saveCurrentLog('recording');
      logger.info('Gravação iniciada');
      timer = setInterval(() => ui?.time(Math.floor(recorder?.durationSeconds() || 0)), 250);
    } catch (failure) {
      if (operation !== epoch) return;
      recordFailure('microphone', failure);
      releaseAudio(); fail(failure.message);
    }
  };
  const togglePause = () => {
    if (!['recording', 'paused'].includes(state)) return;
    if (!EV.contextIsCurrent(context) || !EV.isSamePatientContext(currentRecording?.recordingContext, safePatientContext())) {
      invalidate(); return;
    }
    try {
      if (state === 'recording') { recorder.pause(); state = 'paused'; }
      else { recorder.resume(); state = 'recording'; }
      ui?.time(Math.floor(recorder.durationSeconds()));
      draw();
    } catch (failure) {
      recordFailure('recording', failure); epoch++; releaseAudio(); fail(failure.message);
    }
  };
  const persistFinalAudio = async (record = currentRecording, finalBlob = blob) => {
    if (!record || record.persisted) return;
    const now = new Date().toISOString();
    const row = {
      id: record.id, createdAt: record.recordingStartedAt, updatedAt: now,
      date: record.date, time: record.time, status: 'pending',
      patient: record.patient, exam: record.exam,
      audio: { blob: finalBlob, mimeType: finalBlob.type, sizeBytes: finalBlob.size, durationSeconds: record.audio.durationSeconds },
      recording: { startedAt: record.recordingStartedAt, finishedAt: record.recordingFinishedAt || now },
      processing: { retryCount: 0, attemptCount: 0, autoAttempts: 0, lastAttemptAt: null, lastError: null },
      transcription: { originalText: null, processedText: null, durationMs: null }, commands: [],
      insertion: { success: false, insertedAt: null, error: null },
    };
    await EV.AudioStore.saveRecording(row);
    record.persisted = true;
    logger.info(`Áudio salvo localmente. Recording ID: ${row.id}. Status: pending`);
    void refreshPending();
  };
  const stop = async (autoTranscribe = false) => {
    if (!['recording', 'paused'].includes(state)) return;
    stopPauseWatch?.(); stopPauseWatch = null;
    const operation = epoch;
    clearInterval(timer); state = 'stopping'; draw();
    try {
      const result = await recorder.stop();
      blob = result;
      if (!audioURL) audioURL = URL.createObjectURL(blob);
      if (currentRecording) {
        currentRecording.recordingFinishedAt = new Date().toISOString();
        currentRecording.audio.recordingFinishedAt = currentRecording.recordingFinishedAt;
        currentRecording.audio.durationSeconds = recorder?.durationSeconds() ?? currentRecording.audio.durationSeconds;
        currentRecording.audio.sizeBytes = blob.size;
      }
      await persistFinalAudio();
      if (operation !== epoch) return;
      state = 'ready';
      logger.info('Gravação finalizada');
      draw();
      if (autoTranscribe && !closeRequested) await transcribe();
    } catch (failure) { if (operation === epoch) { recordFailure('storage', failure); fail(currentRecording?.persisted ? `${failure.message} Áudio preservado localmente; consulte o histórico.` : `${failure.message} O áudio NÃO está protegido até a confirmação do salvamento. Mantenha esta página aberta e tente Transcrever novamente.`, blob ? 'ready' : 'error'); } }
  };
  const transcribe = async () => {
    if (state !== 'ready' || !currentRecording) return;
    const operation = epoch;
    state = 'transcribing'; error = ''; draw();
    try {
      if (!currentRecording.persisted) await persistFinalAudio();
      const automatic = !currentRecording.attempted; currentRecording.attempted = true;
      const row = await EV.RecordingProcessor.processRecording(currentRecording.id, {
        automatic,
        isActive: () => operation === epoch,
        onStage: (next) => { if (operation === epoch) { state = next; draw(); } },
      });
      if (operation !== epoch) return;
      if (!row) { fail('Gravação já está em processamento. Acompanhe no histórico.', 'ready'); return; }
      currentRecording.exam = row.exam;
      text = row.transcription?.processedText || '';
      medicalCommands = row.commands || []; medicalCommandCount = medicalCommands.length;
      if (row.status === 'success') {
        currentRecording.status = 'success'; releaseAudio(); text = '';
        state = row.insertion?.skipped ? 'filtered' : EV.CONFIG.AUTO_SUBMIT ? 'sent' : 'success'; draw();
      } else {
        fail(row.processing?.lastError?.message || 'Áudio salvo localmente. Aguardando conexão; consulte o histórico.', 'ready');
      }
    } catch (failure) { if (operation === epoch) fail(failure.message, 'ready'); }
  };
  const showHistory = async () => {
    ui?.showHistory();
    try {
      await EV.AudioStore.cleanupRecordings();
      const recordings = await EV.AudioStore.getRecentRecordings();
      const recordedIds = new Set(recordings.map((row) => row.id));
      const legacy = (await EV.LogStore.getLogs()).filter((row) => !recordedIds.has(row.id));
      EV.Monitoring.renderRecordings(ui.historyContent(), recordings, {
        onRetry: async (id) => { await EV.RecordingProcessor.processRecording(id); await showHistory(); },
        onDelete: async (id) => {
          if (!globalThis.confirm('Tem certeza que deseja excluir esta gravação local?')) return;
          if (!await EV.AudioStore.claim(id)) throw new Error('Gravação em processamento. Aguarde para excluir.');
          try { await EV.AudioStore.deleteRecording(id); } finally { await EV.AudioStore.release(id); }
          await showHistory(); await refreshPending();
        },
        onBack: () => { EV.Monitoring.releasePlayers(); ui?.hideHistory(); },
      });
      ui.historyContent().querySelector('.ev-legacy-history')?.remove();
      if (legacy.length) {
        const section = document.createElement('div'); section.className = 'ev-legacy-history'; ui.historyContent().append(section);
        let selectedId = null;
        const render = () => EV.Monitoring.render(section, legacy, selectedId, {
          onSelect: (id) => { selectedId = id; render(); }, onBack: () => { selectedId = null; render(); },
          onClear: async () => { if (globalThis.confirm('Apagar os logs antigos? Os áudios locais serão preservados.')) { await EV.LogStore.clearLogs(); legacy.splice(0); render(); } },
        }); render();
      }
    } catch (failure) { fail(`Falha ao abrir histórico: ${failure.message}`); }
  };
  const refreshPending = async () => {
    try {
      const rows = await EV.AudioStore.getRecentRecordings();
      ui?.pending(rows.filter((row) => row.status !== 'success').length);
    } catch (failure) { logger.warn(`Armazenamento de áudio indisponível: ${failure.message}`); }
  };
  const showMedicalCommands = async () => {
    ui?.showCommands();
    const target = ui?.commandsContent();
    if (!target || !EV.MedicalCommandCatalog) return;
    const render = (options) => EV.MedicalCommandCatalog.render(target, options);
    render({ loading: true });
    try {
      const response = await EV.ApiClient.request({ path: '/medical-commands', method: 'GET' });
      const data = response.data;
      if (!response.ok) throw new Error(response.error || `Não foi possível carregar as máscaras (HTTP ${response.status}).`);
      if (data?.success !== true || !Array.isArray(data.commands)) {
        throw new Error(typeof data?.error === 'string' ? data.error : `Não foi possível carregar as máscaras (HTTP ${response.status}).`);
      }
      const commands = data.commands.filter((command) => command
        && typeof command.id === 'string' && typeof command.label === 'string'
        && typeof command.category === 'string' && Array.isArray(command.aliases)
        && command.aliases.every((alias) => typeof alias === 'string')
        && typeof command.replacement === 'string');
      render({ commands, onRetry: showMedicalCommands });
    } catch (failure) {
      render({ error: failure instanceof TypeError
        ? 'Não foi possível acessar o catálogo. Verifique a conexão com o backend.'
        : failure.message, onRetry: showMedicalCommands });
    }
  };
  const invalidate = () => {
    const stage = currentRecording?.currentStage || 'recording';
    recordFailure(stage, new Error('A página ou o editor mudou durante a operação.'));
    epoch++; releaseAudio(); context = null;
    fail('A página ou o editor mudou. Confira o exame e inicie um novo ditado.', text ? 'recovery' : 'error');
  };
  const closePanel = async () => {
    closeRequested = true;
    if (['recording', 'paused'].includes(state)) await stop();
    else if (state === 'requesting') {
      reset();
    } else if (['transcribing', 'submitting'].includes(state)) {
      // Cancelar antes de liberar o editor impede sobrescrever uma edição manual posterior.
      const stage = currentRecording?.currentStage || 'transcription';
      recordFailure(stage, new Error('Operação cancelada ao fechar o painel.'));
      epoch++;
      state = text ? 'recovery' : blob ? 'ready' : 'idle';
      draw();
    }
    EV.Monitoring.releasePlayers(); ui?.close();
  };
  const reconcile = () => {
    if (context && !['stopping', 'idle', 'error', 'recovery', 'success', 'sent', 'filtered'].includes(state) && !EV.contextIsCurrent(context)) invalidate();
    let editor;
    try { editor = EV.findEdenEditor(); } catch { ui?.attach(null); return; }
    if (!ui) {
      if (!document.body || document.getElementById('eden-voice-transcriber-root')) return;
      ui = EV.createUI({ start, pause: togglePause, resume: togglePause, stop: () => stop(), transcribe, reset, close: closePanel, history: showHistory, commands: showMedicalCommands }); draw(); void refreshPending();
    }
    ui.attach(editor);
  };
  EV.bindEdenControls({
    busy: () => EV.RecordingProcessor.processingIds.size > 0 || ['requesting', 'recording', 'paused', 'stopping', 'transcribing', 'submitting'].includes(state),
    toggle: () => {
      ui?.open();
      if (['recording', 'paused'].includes(state)) { void stop(true); return; }
      if (state === 'ready') { void transcribe(); return; }
      if (['success', 'sent', 'filtered', 'error'].includes(state)) reset();
      if (state === 'idle') { reconcile(); void start(); }
    },
  });
  let scheduled = false;
  const observer = new MutationObserver((mutations) => {
    if (mutations.every((mutation) => ui?.root.contains(mutation.target))) return;
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => { scheduled = false; reconcile(); });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  // pushState não emite popstate; a sondagem cobre mudanças de URL sem mutação DOM.
  let routeTimer = setInterval(reconcile, 500);
  window.addEventListener('popstate', reconcile);
  window.addEventListener('hashchange', reconcile);
  window.addEventListener('pagehide', () => {
    if (currentRecording && !['success', 'error'].includes(currentRecording.status)) {
      const stage = currentRecording.currentStage || 'recording';
      recordFailure(stage, new Error('Página fechada durante a operação.'));
    }
    reset(); ui?.suspend(); observer.disconnect(); clearInterval(routeTimer);
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      routeTimer = setInterval(reconcile, 500);
      reconcile();
    }
  });
  let historyRefreshTimer;
  window.addEventListener('eden-recordings-changed', () => {
    void refreshPending();
    clearTimeout(historyRefreshTimer);
    if (ui?.isHistoryVisible()) historyRefreshTimer = setTimeout(() => { if (ui?.isHistoryVisible()) void showHistory(); }, 100);
  });
  void EV.RecordingProcessor.initialize().catch((failure) => logger.error(`Falha de recuperação local: ${failure.message}`));
  reconcile();
})();
