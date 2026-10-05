(() => {
  const EV = globalThis.EdenVoice;
  if (EV.initialized) return;
  EV.initialized = true;
  const logger = EV.Logger || { info: (...args) => console.info('[Eden Voice]', ...args), warn: (...args) => console.warn('[Eden Voice]', ...args), error: (...args) => console.error('[Eden Voice]', ...args), timestamp: () => new Date().toISOString(), formatDateTime: () => ({ date: '', time: '' }), text: () => {} };
  logger.info('Extensão carregada');
  let ui, recorder, context, blob, audioURL, timer, controller, stopPauseWatch;
  let state = 'idle', error = '', text = '', epoch = 0;
  let medicalCommandCount = 0;
  let medicalCommands = [];
  let currentRecording = null;
  let remoteLogId = null, remoteCompletionToken = null;
  let closeRequested = false;
  const draw = () => ui?.render({ state, error, audioURL, text, medicalCommandCount, medicalCommands });
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
    logger.info(`Paciente: ${patient.patientName || 'não identificado'}`);
    logger.info(`Exame: ${patient.examName || 'não identificado'}`);
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
    if (!currentRecording) return;
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
        currentRecording.audio.durationSeconds = Math.max(0, (performance.now() - currentRecording.recordingStartedPerf) / 1000);
      }
      currentRecording.transcription.finishedAt ||= currentRecording.transcription.startedAt ? new Date().toISOString() : null;
      if (currentRecording.transcription.startedPerf) {
        currentRecording.transcription.durationMs = performance.now() - currentRecording.transcription.startedPerf;
        delete currentRecording.transcription.startedPerf;
      }
      saveCurrentLog('error', { stage, message: failure?.message || failure });
    }
  };
  const reportRemoteStatus = async (status, failure = null) => {
    if (!remoteLogId || !remoteCompletionToken) return;
    const logId = remoteLogId, completionToken = remoteCompletionToken;
    try {
      const response = await EV.ApiClient.request({ path: `/transcribe/${encodeURIComponent(logId)}/status`, method: 'POST',
        json: { status, completionToken, ...(failure ? { error: failure } : {}) } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (remoteLogId === logId) { remoteLogId = null; remoteCompletionToken = null; }
    } catch (storageFailure) {
      logger.warn(`Não foi possível atualizar o painel administrativo: ${storageFailure.message}`);
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
    epoch++; controller?.abort(); controller = null;
    releaseAudio(); context = null; currentRecording = null; remoteLogId = null; remoteCompletionToken = null; text = ''; error = ''; state = 'idle';
    medicalCommandCount = 0;
    medicalCommands = [];
    ui?.time(0); draw();
  };
  const start = async () => {
    if (state !== 'idle') return;
    closeRequested = false;
    const operation = ++epoch;
    try {
      remoteLogId = null; remoteCompletionToken = null;
      currentRecording = createRecording();
      context = EV.captureContext();
      currentRecording.editorContext = context;
      logger.info('Editor TipTap encontrado');
      state = 'requesting'; error = ''; draw();
      await EV.ensureEdenPaused(context, () => operation === epoch);
      if (operation !== epoch) return;
      stopPauseWatch = EV.watchEdenPaused(context,
        () => operation === epoch && ['requesting', 'recording'].includes(state),
        async (failure) => {
          if (state === 'recording') {
            // Finaliza e preserva o áudio já capturado para reprodução/transcrição.
            await stop();
            if (operation === epoch && state === 'ready') fail(failure.message, 'ready');
          } else {
            recordFailure('microphone', failure); epoch++; releaseAudio(); fail(failure.message);
          }
        });
      recorder = new EV.AudioRecorder((failure) => {
        recordFailure('recording', failure); epoch++; releaseAudio(); fail(failure.message);
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
      timer = setInterval(() => ui?.time(Math.floor((performance.now() - currentRecording.recordingStartedPerf) / 1000)), 250);
    } catch (failure) {
      if (operation !== epoch) return;
      recordFailure('microphone', failure);
      releaseAudio(); fail(failure.message);
    }
  };
  const stop = async (autoTranscribe = false) => {
    if (state !== 'recording') return;
    stopPauseWatch?.(); stopPauseWatch = null;
    const operation = epoch;
    clearInterval(timer); state = 'stopping'; draw();
    try {
      const result = await recorder.stop();
      if (operation !== epoch) return;
      blob = result; audioURL = URL.createObjectURL(blob); state = 'ready';
      if (currentRecording) {
        currentRecording.recordingFinishedAt = new Date().toISOString();
        currentRecording.audio.recordingFinishedAt = currentRecording.recordingFinishedAt;
        currentRecording.audio.durationSeconds = Math.max(0, (performance.now() - currentRecording.recordingStartedPerf) / 1000);
        currentRecording.audio.sizeBytes = blob.size;
      }
      logger.info('Gravação finalizada');
      draw();
      if (autoTranscribe && !closeRequested) await transcribe();
    } catch (failure) { if (operation === epoch) { recordFailure('recording', failure); releaseAudio(); fail(failure.message); } }
  };
  const transcribe = async () => {
    if (state !== 'ready' || !blob) return;
    if (!EV.contextIsCurrent(context)) { invalidate(); return; }
    const finalContext = safePatientContext();
    if (currentRecording && !EV.isSamePatientContext(currentRecording.recordingContext, finalContext)) {
      logger.warn('Contexto do paciente mudou durante a gravação; será usado o snapshot inicial');
    }
    const operation = epoch;
    state = 'transcribing'; error = ''; draw();
    let stage = 'transcription';
    if (currentRecording) {
      currentRecording.status = 'transcribing';
      currentRecording.currentStage = stage;
      currentRecording.transcription.startedAt = new Date().toISOString();
      currentRecording.transcription.startedPerf = performance.now();
      saveCurrentLog('transcribing');
    }
    controller = new AbortController();
    const requestController = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; requestController.abort(); }, EV.CONFIG.REQUEST_TIMEOUT_MS);
    try {
      const extensions = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/wav': 'wav', 'audio/mpeg': 'mp3' };
      const extension = extensions[blob.type.split(';')[0]];
      if (!extension) throw new Error('Formato de gravação não suportado pelo backend. Use o Chrome atualizado.');
      const fields = {
        patientContext: JSON.stringify(currentRecording?.recordingContext || {}),
        audioDurationSeconds: String(currentRecording?.audio.durationSeconds || 0),
        recordingStartedAt: currentRecording?.recordingStartedAt || '',
        recordingFinishedAt: currentRecording?.recordingFinishedAt || '',
      };
      logger.info('Enviando áudio para transcrição');
      const response = await EV.ApiClient.request({ path: '/transcribe', method: 'POST', audio: blob, fields }, { signal: requestController.signal });
      const data = response.data;
      if (!response.ok) throw new Error(response.error || `Falha HTTP ${response.status} na transcrição.`);
      if (data?.success !== true) throw new Error(typeof data?.error === 'string' ? data.error : `Falha HTTP ${response.status} na transcrição.`);
      if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('Resposta do backend sem text válido.');
      if (operation !== epoch) return;
      remoteLogId = typeof data.logId === 'string' ? data.logId : null;
      remoteCompletionToken = typeof data.completionToken === 'string' ? data.completionToken : null;
      if (remoteLogId) logger.info(`Registro de monitoramento criado: ${remoteLogId}`);
      else logger.warn('O backend respondeu sem ID de monitoramento; publique a versão mais recente do backend');
      stage = 'command-processing';
      if (currentRecording) currentRecording.currentStage = stage;
      logger.info('Transcrição concluída');
      if (currentRecording) { currentRecording.status = 'processing'; saveCurrentLog('processing'); }
      const originalText = typeof data.originalText === 'string' ? data.originalText : data.text;
      logger.text('Transcrição recebida', originalText);
      // O backend já retorna o texto final; não expandir comandos novamente.
      text = data.text;
      medicalCommandCount = Number.isSafeInteger(data.medicalCommandCount) && data.medicalCommandCount >= 0
        ? data.medicalCommandCount : 0;
      medicalCommands = Array.isArray(data.medicalCommands) ? data.medicalCommands.filter((command) => command
        && ['id', 'label', 'alias', 'detectedText', 'replacement'].every((key) => typeof command[key] === 'string')) : [];
      logger.info(`Comandos aplicados: ${medicalCommands.length}`);
      if (currentRecording) {
        currentRecording.transcription.originalText = originalText;
        currentRecording.transcription.finishedAt = new Date().toISOString();
        currentRecording.transcription.durationMs = currentRecording.transcription.startedPerf
          ? performance.now() - currentRecording.transcription.startedPerf : 0;
        delete currentRecording.transcription.startedPerf;
        currentRecording.commands = medicalCommands.map(({ id, label, alias, detectedText, replacement }) => ({ id, label, alias, detectedText, replacement }));
        currentRecording.finalText = data.text;
        currentRecording.status = 'inserting';
        saveCurrentLog('inserting');
      }
      releaseAudio();
      if (!EV.contextIsCurrent(context)) throw new Error('A página mudou durante a transcrição. Confira o exame e copie o texto manualmente.');
      stage = 'eden-editor';
      if (currentRecording) currentRecording.currentStage = stage;
      await EV.insertTextIntoEden(text, context, () => operation === epoch);
      if (operation !== epoch) return;
      if (EV.CONFIG.AUTO_SUBMIT) {
        state = 'submitting'; draw();
        const button = await EV.waitForEdenSubmit(context, () => operation === epoch);
        if (operation !== epoch) return;
        // O clique pode limpar/desmontar o editor imediatamente no React.
        state = 'sent';
        EV.clickEdenSubmit(button, context);
        logger.info('Texto inserido no Eden');
        saveCurrentLog('success');
        void reportRemoteStatus('success');
        text = ''; draw();
        return;
      }
      logger.info('Texto inserido no Eden');
      saveCurrentLog('success');
      void reportRemoteStatus('success');
      text = ''; state = 'success'; draw();
    } catch (failure) {
      if (operation !== epoch) return;
      recordFailure(stage, failure);
      const message = timedOut ? 'Tempo limite de transcrição excedido. Tente novamente.'
        : failure instanceof TypeError ? 'A extensão não conseguiu acessar o backend. Confirme o IP em API_BASE_URL, a permissão do host no manifest e o acesso à rede/VPN.'
          : failure.message;
      void reportRemoteStatus('error', { stage, message });
      fail(message, text ? 'recovery' : blob ? 'ready' : 'error');
    } finally { clearTimeout(timeout); if (controller === requestController) controller = null; }
  };
  const showHistory = async () => {
    ui?.showHistory();
    try {
      const logs = await EV.LogStore.getLogs();
      let selectedId = null;
      const renderHistory = () => EV.Monitoring.render(ui.historyContent(), logs, selectedId, {
        onSelect: (id) => { selectedId = id; renderHistory(); },
        onClear: async () => {
          if (!globalThis.confirm('Tem certeza que deseja apagar o histórico local do Eden Voice?')) return;
          try { await EV.LogStore.clearLogs(); logs.splice(0); selectedId = null; renderHistory(); }
          catch (failure) { logger.error(`Falha de monitoramento (storage): ${failure.message}`); }
        },
        onBack: () => { if (selectedId) { selectedId = null; renderHistory(); } else ui?.hideHistory(); },
      });
      renderHistory();
    } catch (failure) {
      logger.warn(`Falha de monitoramento (storage): ${failure.message}`);
      EV.Monitoring.render(ui.historyContent(), [], null, { onBack: () => ui?.hideHistory(), onClear() {}, onSelect() {} });
    }
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
    void reportRemoteStatus('error', { stage, message: 'A página ou o editor mudou durante a operação.' });
    epoch++; controller?.abort(); controller = null; releaseAudio(); context = null;
    fail('A página ou o editor mudou. Confira o exame e inicie um novo ditado.', text ? 'recovery' : 'error');
  };
  const closePanel = async () => {
    closeRequested = true;
    if (state === 'recording') await stop();
    else if (state === 'requesting') {
      reset();
    } else if (['transcribing', 'submitting'].includes(state)) {
      // Cancelar antes de liberar o editor impede sobrescrever uma edição manual posterior.
      const stage = currentRecording?.currentStage || 'transcription';
      recordFailure(stage, new Error('Operação cancelada ao fechar o painel.'));
      void reportRemoteStatus('error', { stage, message: 'Operação cancelada ao fechar o painel.' });
      epoch++; controller?.abort(); controller = null;
      state = text ? 'recovery' : blob ? 'ready' : 'idle';
      draw();
    }
    ui?.close();
  };
  const reconcile = () => {
    if (context && !['idle', 'error', 'recovery', 'success', 'sent'].includes(state) && !EV.contextIsCurrent(context)) invalidate();
    let editor;
    try { editor = EV.findEdenEditor(); } catch { ui?.attach(null); return; }
    if (!ui) {
      if (!document.body || document.getElementById('eden-voice-transcriber-root')) return;
      ui = EV.createUI({ start, stop: () => stop(), transcribe, reset, close: closePanel, history: showHistory, commands: showMedicalCommands }); draw();
    }
    ui.attach(editor);
  };
  EV.bindEdenControls({
    busy: () => ['requesting', 'recording', 'stopping', 'transcribing', 'submitting'].includes(state),
    toggle: () => {
      ui?.open();
      if (state === 'recording') { void stop(true); return; }
      if (state === 'ready') { void transcribe(); return; }
      if (['success', 'sent', 'error'].includes(state)) reset();
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
      void reportRemoteStatus('error', { stage, message: 'Página fechada durante a operação.' });
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
  reconcile();
})();
