(() => {
  const EV = globalThis.EdenVoice;
  if (EV.initialized) return;
  EV.initialized = true;
  console.info('[Eden Voice] Extensão carregada');
  let ui, recorder, context, blob, audioURL, timer, controller, stopPauseWatch;
  let state = 'idle', error = '', text = '', epoch = 0;
  let medicalCommandCount = 0;
  let medicalCommands = [];
  let closeRequested = false;
  const draw = () => ui?.render({ state, error, audioURL, text, medicalCommandCount, medicalCommands });
  const fail = (message, next = 'error') => {
    error = message; state = next;
    console.error(`[Eden Voice] ERROR: ${message}`);
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
    releaseAudio(); context = null; text = ''; error = ''; state = 'idle';
    medicalCommandCount = 0;
    medicalCommands = [];
    ui?.time(0); draw();
  };
  const start = async () => {
    if (state !== 'idle') return;
    closeRequested = false;
    const operation = ++epoch;
    try {
      context = EV.captureContext();
      console.info('[Eden Voice] Editor TipTap encontrado');
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
            epoch++; releaseAudio(); fail(failure.message);
          }
        });
      recorder = new EV.AudioRecorder((failure) => {
        epoch++; releaseAudio(); fail(failure.message);
      });
      await recorder.start();
      if (operation !== epoch) return;
      if (!EV.contextIsCurrent(context)) throw new Error('A página mudou. Inicie um novo ditado.');
      state = 'recording'; draw();
      const started = performance.now();
      timer = setInterval(() => ui?.time(Math.floor((performance.now() - started) / 1000)), 250);
    } catch (failure) {
      if (operation !== epoch) return;
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
      blob = result; audioURL = URL.createObjectURL(blob); state = 'ready'; draw();
      if (autoTranscribe && !closeRequested) await transcribe();
    } catch (failure) { if (operation === epoch) { releaseAudio(); fail(failure.message); } }
  };
  const transcribe = async () => {
    if (state !== 'ready' || !blob) return;
    if (!EV.contextIsCurrent(context)) { invalidate(); return; }
    const operation = epoch;
    state = 'transcribing'; error = ''; draw();
    controller = new AbortController();
    const requestController = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; requestController.abort(); }, EV.CONFIG.REQUEST_TIMEOUT_MS);
    try {
      const extensions = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/wav': 'wav', 'audio/mpeg': 'mp3' };
      const extension = extensions[blob.type.split(';')[0]];
      if (!extension) throw new Error('Formato de gravação não suportado pelo backend. Use o Chrome atualizado.');
      const body = new FormData(); body.append('audio', blob, `laudo.${extension}`);
      console.info('[Eden Voice] Enviando para transcrição');
      const response = await fetch(`${EV.CONFIG.API_BASE_URL.replace(/\/$/, '')}/transcribe`, {
        method: 'POST', body, signal: requestController.signal, credentials: 'omit', redirect: 'error',
      });
      let data;
      try { data = await response.json(); }
      catch { throw new Error(`Resposta HTTP inválida do backend (${response.status}).`); }
      if (!response.ok || data?.success !== true) throw new Error(typeof data?.error === 'string' ? data.error : `Falha HTTP ${response.status} na transcrição.`);
      if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('Resposta do backend sem text válido.');
      if (operation !== epoch) return;
      console.info('[Eden Voice] Transcrição recebida');
      // O backend já retorna o texto final; não expandir comandos novamente.
      text = data.text;
      medicalCommandCount = Number.isSafeInteger(data.medicalCommandCount) && data.medicalCommandCount >= 0
        ? data.medicalCommandCount : 0;
      medicalCommands = Array.isArray(data.medicalCommands) ? data.medicalCommands.filter((command) => command
        && ['id', 'label', 'alias', 'replacement'].every((key) => typeof command[key] === 'string')) : [];
      releaseAudio();
      if (!EV.contextIsCurrent(context)) throw new Error('A página mudou durante a transcrição. Confira o exame e copie o texto manualmente.');
      await EV.insertTextIntoEden(text, context, () => operation === epoch);
      if (operation !== epoch) return;
      if (EV.CONFIG.AUTO_SUBMIT) {
        state = 'submitting'; draw();
        const button = await EV.waitForEdenSubmit(context, () => operation === epoch);
        if (operation !== epoch) return;
        // O clique pode limpar/desmontar o editor imediatamente no React.
        state = 'sent';
        EV.clickEdenSubmit(button, context);
        text = ''; draw();
        return;
      }
      text = ''; state = 'success'; draw();
    } catch (failure) {
      if (operation !== epoch) return;
      const message = timedOut ? 'Tempo limite de transcrição excedido. Tente novamente.'
        : failure instanceof TypeError ? 'Backend indisponível ou acesso bloqueado. Verifique o servidor, CORS e a permissão de rede local.' : failure.message;
      fail(message, text ? 'recovery' : blob ? 'ready' : 'error');
    } finally { clearTimeout(timeout); if (controller === requestController) controller = null; }
  };
  const invalidate = () => {
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
      ui = EV.createUI({ start, stop: () => stop(), transcribe, reset, close: closePanel }); draw();
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
  window.addEventListener('pagehide', () => { reset(); ui?.suspend(); observer.disconnect(); clearInterval(routeTimer); });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      routeTimer = setInterval(reconcile, 500);
      reconcile();
    }
  });
  reconcile();
})();
