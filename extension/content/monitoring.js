(() => {
  const EV = globalThis.EdenVoice ||= {};
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };
  const value = (input) => input || "—";
  const duration = (seconds) => {
    const total = Math.max(0, Math.floor(seconds || 0));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  const section = (title, content) => {
    const wrapper = element("section", "ev-log-detail-section");
    wrapper.append(element("h4", "", title), content);
    return wrapper;
  };

  function appendHighlightedText(container, text, commands) {
    const source = String(text || "");
    let cursor = 0;
    const matches = [];
    for (const command of commands || []) {
      const detectedText = String(command?.detectedText || "");
      if (!detectedText) continue;
      const start = source.indexOf(detectedText, cursor);
      if (start < 0) continue;
      matches.push({ start, end: start + detectedText.length, command });
      cursor = start + detectedText.length;
    }
    matches.sort((a, b) => a.start - b.start);
    cursor = 0;
    for (const match of matches) {
      if (match.start < cursor) continue;
      container.append(document.createTextNode(source.slice(cursor, match.start)));
      const mark = element("mark", "eden-voice-command-highlight", source.slice(match.start, match.end));
      mark.title = String(match.command.label || "Comando médico");
      container.append(mark, element("span", "ev-command-label", ` → ${match.command.label || "Comando médico"}`));
      cursor = match.end;
    }
    container.append(document.createTextNode(source.slice(cursor)));
  }

  const players = new Map();
  const recordingViews = new WeakMap();
  const icons = {
    play: '<path d="m8 5 11 7-11 7Z"/>', pause: '<path d="M9 5v14M15 5v14"/>',
    retry: '<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  };
  function button(className, label, icon) {
    const node = element('button', `ev-recording-button ${className}`); node.type = 'button';
    setButton(node, label, icon); return node;
  }
  function setButton(node, label, icon) {
    // Only constant local SVG paths enter innerHTML; labels remain text nodes.
    node.replaceChildren();
    if (icons[icon]) {
      const glyph = element('span', 'ev-button-icon');
      glyph.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[icon]}</svg>`;
      node.append(glyph);
    }
    node.append(element('span', '', label));
  }
  function releasePlayers() {
    for (const player of [...players.values()]) player.dispose();
  }
  window.addEventListener('pagehide', releasePlayers);

  function createPlayer(id) {
    const listen = button('ev-recording-listen', 'Ouvir áudio', 'play');
    const panel = element('div', 'ev-audio-player'); panel.hidden = true;
    const heading = element('div', 'ev-audio-heading');
    const message = element('span', 'ev-audio-message'); message.setAttribute('role', 'status');
    const close = button('ev-audio-close', 'Fechar áudio');
    heading.append(message, close);
    const audio = element('audio'); audio.controls = true; audio.preload = 'auto';
    audio.setAttribute('aria-label', 'Reprodução da gravação salva');
    const securePlayer = element('iframe', 'ev-audio-extension-player');
    securePlayer.title = 'Player local protegido da extensão';
    securePlayer.allow = 'autoplay'; securePlayer.hidden = true;
    panel.append(heading, audio, securePlayer);
    let url, loading = false, generation = 0, timeout, mimeType = '', usingSecurePlayer = false, secureReady = false;
    const extensionOrigin = new URL(chrome.runtime.getURL('')).origin;
    const onSecurePlayerMessage = (event) => {
      if (!usingSecurePlayer || event.source !== securePlayer.contentWindow || event.origin !== extensionOrigin
        || event.data?.type !== 'eden-audio-player') return;
      if (event.data.state === 'ready') {
        secureReady = true; clearTimeout(timeout);
        message.textContent = 'Áudio carregado. Use o player abaixo para reproduzir.';
      } else if (event.data.state === 'playing') message.textContent = 'Reproduzindo áudio salvo';
      else if (event.data.state === 'paused') message.textContent = 'Áudio pausado';
      else if (event.data.state === 'ended') message.textContent = 'Reprodução concluída';
      else if (event.data.state === 'error') {
        clearTimeout(timeout);
        const description = String(event.data.message || 'Falha no reprodutor local.');
        console.warn(`[Eden Voice] Falha no player seguro: ${JSON.stringify({ message: description, mimeType })}`);
        message.textContent = `${description} O arquivo original continua salvo.`;
        panel.classList.add('ev-audio-error');
      }
    };
    window.addEventListener('message', onSecurePlayerMessage);
    function useSecurePlayer(reason) {
      if (usingSecurePlayer) return;
      usingSecurePlayer = true; secureReady = false;
      clearTimeout(timeout);
      audio.pause(); audio.removeAttribute('src'); audio.load(); audio.hidden = true;
      if (url) URL.revokeObjectURL(url); url = null;
      securePlayer.hidden = false; listen.hidden = true;
      panel.hidden = false; panel.classList.remove('ev-audio-error');
      message.textContent = `${reason} Abrindo o reprodutor local da extensão…`;
      securePlayer.src = chrome.runtime.getURL(`storage/player.html?id=${encodeURIComponent(id)}`);
      timeout = setTimeout(() => {
        if (!secureReady) {
          message.textContent = 'O player local não carregou. O áudio original continua salvo; atualize a página e tente novamente.';
          panel.classList.add('ev-audio-error'); listen.hidden = false;
          setButton(listen, 'Tentar abrir o player', 'retry');
        }
      }, 12000);
    }
    function dispose() {
      generation++; clearTimeout(timeout); loading = false;
      audio.pause(); audio.removeAttribute('src'); audio.load();
      if (url) URL.revokeObjectURL(url); url = null;
      securePlayer.removeAttribute('src'); securePlayer.hidden = true; audio.hidden = false;
      usingSecurePlayer = false; secureReady = false;
      panel.hidden = true; panel.classList.remove('ev-audio-error');
      listen.hidden = false; listen.disabled = false; listen.removeAttribute('aria-busy'); setButton(listen, 'Ouvir áudio', 'play');
      window.removeEventListener('message', onSecurePlayerMessage);
      players.delete(id);
    }
    function playbackError(text) {
      clearTimeout(timeout); generation++; loading = false;
      if (!usingSecurePlayer) { useSecurePlayer(text); return; }
      audio.pause(); audio.removeAttribute('src'); audio.load();
      if (url) URL.revokeObjectURL(url); url = null;
      message.textContent = text;
      panel.hidden = false; panel.classList.add('ev-audio-error');
      listen.disabled = false; listen.removeAttribute('aria-busy'); setButton(listen, 'Tentar ouvir novamente', 'retry');
    }
    const player = { dispose, listen, panel };
    close.onclick = dispose;
    audio.addEventListener('playing', () => {
      clearTimeout(timeout); message.textContent = 'Reproduzindo áudio salvo'; setButton(listen, 'Pausar áudio', 'pause');
      // Only one recording should be audible at a time.
      for (const [otherId, other] of players) if (otherId !== id) other.dispose();
    });
    audio.addEventListener('pause', () => { if (url) { message.textContent = 'Áudio pausado'; setButton(listen, 'Continuar áudio', 'play'); } });
    audio.addEventListener('ended', () => { message.textContent = 'Reprodução concluída'; setButton(listen, 'Ouvir novamente', 'play'); });
    audio.addEventListener('error', () => {
      if (!url) return;
      const code = audio.error?.code;
      const canPlay = audio.canPlayType(mimeType);
      console.warn(`[Eden Voice] Falha no player da página: ${JSON.stringify({ code, mediaError: audio.error?.message || '', mimeType, canPlay, networkState: audio.networkState, readyState: audio.readyState })}`);
      const message = code === 4
        ? 'O player da página não reconheceu o formato.'
        : code === 3
          ? 'O player da página não conseguiu decodificar o áudio.'
          : code === 2
            ? 'A política ou o carregamento da página bloqueou o áudio.'
            : 'O player da página não conseguiu reproduzir o áudio.';
      playbackError(message);
    });
    const armTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => playbackError('O áudio demorou para carregar. Tente ouvir novamente; o original continua salvo.'), 12000);
    };
    audio.addEventListener('waiting', () => { if (url) { message.textContent = 'Carregando áudio…'; armTimeout(); } });
    audio.addEventListener('canplay', () => { clearTimeout(timeout); if (url && audio.paused) message.textContent = 'Áudio pronto para ouvir'; });
    listen.onclick = async () => {
      if (loading) return;
      if (url && !audio.paused) { audio.pause(); return; }
      const operation = ++generation;
      if (!url) {
        loading = true; listen.disabled = true; listen.setAttribute('aria-busy', 'true');
        setButton(listen, 'Carregando áudio…'); panel.hidden = false; panel.classList.remove('ev-audio-error');
        message.textContent = 'Carregando áudio salvo…'; players.set(id, player); armTimeout();
        try {
          const saved = await EV.AudioStore.getRecording(id);
          if (operation !== generation) return;
          const blob = saved?.audio?.blob;
          if (!(blob instanceof Blob) || !blob.size) throw new Error('O arquivo de áudio não está disponível neste registro.');
          // Materialize IndexedDB-backed binary data before handing it to the media decoder.
          const buffer = await blob.arrayBuffer();
          if (operation !== generation || !panel.isConnected) return;
          mimeType = blob.type || saved.audio.mimeType || 'audio/webm';
          const playable = new Blob([buffer], { type: mimeType });
          url = URL.createObjectURL(playable);
          audio.src = url; audio.muted = false; audio.volume = 1; audio.load();
        } catch (error) {
          if (operation === generation) playbackError(error.message || 'Não foi possível abrir o áudio salvo.');
          return;
        } finally {
          if (operation === generation) { loading = false; listen.disabled = false; listen.removeAttribute('aria-busy'); }
        }
      }
      try { await audio.play(); }
      catch (error) {
        if (operation !== generation) return;
        if (error.name === 'NotAllowedError') {
          clearTimeout(timeout); message.textContent = 'Áudio pronto. Clique em reproduzir no player.'; setButton(listen, 'Reproduzir áudio', 'play');
        } else playbackError('O player da página recusou o formato ou a URL local.');
      }
    };
    return player;
  }

  function createRecordingView(id) {
    let row, handlers, acting = false;
    const card = element('section', 'ev-history-card ev-recording-card'); card.dataset.recordingId = id;
    const header = element('div', 'ev-recording-header');
    const date = element('time', 'ev-recording-date'); const badge = element('span', 'ev-recording-status');
    header.append(date, badge);
    const patient = element('h3', 'ev-recording-patient'); const exam = element('p', 'ev-recording-exam');
    const metadata = element('p', 'ev-recording-meta'); const note = element('p', 'ev-recording-note');
    const error = element('p', 'ev-log-error'); const warning = element('p', 'ev-exam-warning');
    const actionError = element('p', 'ev-log-error'); actionError.hidden = true; actionError.setAttribute('role', 'alert');
    const actions = element('div', 'ev-recording-actions');
    const player = createPlayer(id);
    const retry = button('ev-recording-retry', 'Reprocessar', 'retry');
    const remove = button('ev-recording-delete', 'Excluir', 'trash');
    remove.title = 'Excluir permanentemente esta gravação local';
    actions.append(player.listen, retry, remove);
    const details = element('details', 'ev-recording-details'); details.append(element('summary', '', 'Detalhes'));
    const original = element('p', 'ev-log-original-text'); const processed = element('p', 'ev-log-final-text');
    const filtered = element('div', 'ev-log-final-text'); const ignored = element('div', 'ev-log-original-text');
    const measurements = element('pre', 'ev-log-measurements');
    const filterMode = element('p', 'ev-clinical-filter-mode');
    details.append(filterMode, section('Transcrição original', original), section('Trechos considerados para o laudo', filtered), section('Trechos ignorados', ignored), section('Medidas', measurements), section('Texto processado', processed));
    card.append(header, patient, exam, metadata, note, error, warning, actions, actionError, player.panel, details);
    const busy = () => acting || EV.RecordingProcessor.processingIds.has(id) || ['uploading', 'processing', 'inserting'].includes(row.status);
    function update(next, callbacks) {
      row = next; handlers = callbacks;
      date.dateTime = row.createdAt; date.textContent = new Date(row.createdAt).toLocaleString('pt-BR');
      patient.textContent = value(row.patient?.name); exam.textContent = value(row.exam?.name);
      metadata.textContent = `${duration(row.audio?.durationSeconds)} de áudio · ${row.processing?.attemptCount || 0} ${(row.processing?.attemptCount || 0) === 1 ? 'tentativa' : 'tentativas'} · ${row.commands?.length || 0} ${(row.commands?.length || 0) === 1 ? 'comando' : 'comandos'}`;
      const isBusy = busy();
      badge.dataset.status = row.status === 'success' ? 'success' : isBusy ? 'processing' : row.status;
      badge.textContent = row.status === 'success' ? 'Processado' : isBusy ? 'Processando…' : row.status === 'failed' ? 'Falha no processamento' : 'Pendente';
      note.textContent = row.processing?.lastError?.code === 'TRANSCRIPTION_EMPTY' ? 'Nenhuma fala reconhecida. Ouça o áudio antes de tentar novamente.'
        : row.processing?.autoAttempts >= EV.AUDIO_RETENTION.MAX_AUTO_RETRIES ? 'Áudio preservado. Limite automático atingido; reprocese quando desejar.'
          : 'Áudio salvo neste dispositivo.';
      error.hidden = !row.processing?.lastError; error.textContent = row.processing?.lastError?.message || '';
      warning.hidden = !!row.exam?.contextId; warning.textContent = 'Contexto: Não identificado. Comandos específicos desabilitados.';
      retry.hidden = row.status === 'success'; retry.disabled = isBusy; remove.disabled = isBusy;
      retry.setAttribute('aria-busy', String(isBusy)); setButton(retry, isBusy ? 'Reprocessando…' : 'Reprocessar', 'retry');
      original.replaceChildren(); appendHighlightedText(original, row.transcription?.originalText, row.commands);
      processed.textContent = row.transcription?.processedText || '';
      const describeSegment = (s) => `${s.text} — ${s.reason || s.intent}${s.commandCandidates?.length ? '\n' + s.commandCandidates.map((c) => `Comando candidato: ${c.id} · Negado: ${c.negated ? 'sim' : 'não'} · Protegido: ${c.negated ? 'não' : 'sim'}`).join('\n') : ''}`;
      filterMode.textContent = row.clinicalFilter?.mode === 'ai' ? 'Filtro clínico: IA' : row.clinicalFilter?.mode === 'deterministic_fallback' ? 'Filtro clínico: fallback determinístico' : '';
      if (row.clinicalFilter?.fallbackReason) filterMode.textContent += ` · Motivo: ${row.clinicalFilter.fallbackReason} · Status: ${row.clinicalFilter.aiStatus?.status ?? row.clinicalFilter.aiStatus?.state ?? 'desconhecido'} · Detalhe: ${row.clinicalFilter.aiStatus?.reason || 'não informado'}`;
      filtered.replaceChildren(...(row.filterDetails?.segments || []).filter((s) => s.includeInReport).map((s) => element('p', '', describeSegment(s))));
      if (!row.filterDetails?.segments) filtered.textContent = row.transcription?.filteredText ?? 'Filtro ainda não aplicado';
      ignored.replaceChildren(...(row.filterDetails?.segments || []).filter((s) => !s.includeInReport).map((s) => element('p', '', describeSegment(s))));
      measurements.textContent = JSON.stringify(row.measurements || [], null, 2);
      if (row.insertion?.skipped) note.textContent = 'Nenhum trecho destinado ao laudo. Original preservado; nada inserido.';
    }
    async function run(action, deleting = false) {
      if (busy()) return;
      acting = true; actionError.hidden = true; update(row, handlers);
      if (deleting) setButton(remove, 'Excluindo…', 'trash');
      try { await action(id); }
      catch (failure) { actionError.textContent = failure.message; actionError.hidden = false; }
      finally { acting = false; setButton(remove, 'Excluir', 'trash'); update(row, handlers); }
    }
    retry.onclick = () => run(handlers.onRetry);
    remove.onclick = () => run(handlers.onDelete, true);
    return { card, update, dispose: player.dispose };
  }
  function renderRecordings(container, recordings, handlers) {
    let view = recordingViews.get(container);
    if (!view || !view.list.isConnected) {
      releasePlayers(); container.replaceChildren();
      const toolbar = element('div', 'ev-history-toolbar');
      const back = button('ev-history-back', '‹ Ditado'); back.onclick = () => view.handlers.onBack();
      const title = element('h2', '', 'Gravações locais'); const count = element('span', 'ev-history-count');
      toolbar.append(back, title, count);
      const list = element('div', 'ev-history-list');
      const empty = element('p', 'ev-history-empty', 'Nenhum áudio salvo localmente.');
      container.append(toolbar, empty, list);
      view = { list, count, empty, cards: new Map(), handlers }; recordingViews.set(container, view);
    }
    view.handlers = handlers; view.count.textContent = String(recordings.length); view.empty.hidden = !!recordings.length;
    const ids = new Set(recordings.map((row) => row.id));
    for (const [id, entry] of view.cards) if (!ids.has(id)) { entry.dispose(); entry.card.remove(); view.cards.delete(id); }
    for (const [index, row] of recordings.entries()) {
      let entry = view.cards.get(row.id);
      if (!entry) { entry = createRecordingView(row.id); view.cards.set(row.id, entry); view.list.insertBefore(entry.card, view.list.children[index] || null); }
      entry.update(row, handlers);
    }
    // Existing media elements stay connected: checkpoint refreshes must not reset playback.
  }
  EV.Monitoring = Object.freeze({
    appendHighlightedText, releasePlayers, renderRecordings,
    render(container, logs, selectedId, { onSelect, onClear, onBack }) {
      container.replaceChildren();
      const toolbar = element("div", "ev-history-toolbar");
      const back = element("button", "ev-history-back", "‹ Ditado");
      back.type = "button"; back.onclick = onBack;
      toolbar.append(back, element("h2", "", selectedId ? "Detalhes do ditado" : "Monitoramento"));
      if (!selectedId && logs.length) {
        const clear = element("button", "ev-history-clear", "Limpar histórico");
        clear.type = "button"; clear.onclick = onClear; toolbar.append(clear);
      }
      container.append(toolbar);
      if (selectedId) {
        const log = logs.find((item) => item.id === selectedId);
        if (!log) {
          container.append(element("p", "ev-history-empty", "Registro não encontrado."));
          return;
        }
        const details = element("div", "ev-history-details");
        const metadata = element("dl", "ev-log-metadata");
        const fields = [
          ["Paciente", log.patient?.name],
          ["Sexo/idade", [log.patient?.gender, log.patient?.age].filter(Boolean).join(", ") || log.patient?.patientInfoRaw],
          ["Exame", log.exam?.name],
          ["Contexto", log.exam?.contextLabel || "Não identificado"],
          ["Resolução", log.exam?.resolution === 'manual' ? 'Manual' : 'Automática'],
          ["Comandos", String(log.commands?.length || 0)], ["Data", log.date], ["Hora", log.time],
          ["Duração do áudio", duration(log.audio?.durationSeconds)],
          ["Tempo de transcrição", `${((log.transcription?.durationMs || 0) / 1000).toFixed(1)}s`],
          ["Status", log.status === "success" ? "Sucesso" : `Erro${log.error?.stage ? ` · ${log.error.stage}` : ""}`],
        ];
        for (const [term, text] of fields) {
          metadata.append(element("dt", "", term), element("dd", "", value(text)));
        }
        details.append(metadata);
        if (!log.exam?.contextId) details.append(element('p', 'ev-exam-warning', '⚠ Exame não identificado. Comandos médicos específicos desabilitados.'));
        const original = element("p", "ev-log-original-text");
        appendHighlightedText(original, log.transcription?.originalText, log.commands);
        details.append(section("Transcrição original", original));
        const commands = element("ol", "ev-log-commands");
        for (const command of log.commands || []) {
          const item = element("li", "");
          item.append(element("strong", "", command.label || command.id));
          item.append(element("p", "", `Detectado: “${command.detectedText || ""}”`));
          item.append(element("p", "", `Alias: “${command.alias || ""}”`));
          item.append(element("p", "ev-log-replacement", command.replacement || ""));
          commands.append(item);
        }
        if (!commands.childElementCount) commands.append(element("li", "", "Nenhum comando identificado."));
        details.append(section("Comandos identificados", commands));
        details.append(section("Texto final inserido no Eden", element("p", "ev-log-final-text", log.finalText || "")));
        if (log.error?.message) details.append(section("Erro", element("p", "ev-log-error", log.error.message)));
        container.append(details);
        return;
      }
      if (!logs.length) {
        container.append(element("p", "ev-history-empty", "As transcrições concluídas aparecerão aqui."));
        return;
      }
      const list = element("div", "ev-history-list");
      for (const log of logs) {
        const card = element("button", "ev-history-card");
        card.type = "button"; card.onclick = () => onSelect(log.id);
        card.append(element("strong", "", `${log.date || "—"} ${log.time || ""}`));
        card.append(element("span", "", value(log.patient?.name)));
        card.append(element("span", "", value(log.exam?.name)));
        card.append(element('span', log.exam?.contextId ? '' : 'ev-exam-warning', `Contexto: ${log.exam?.contextLabel || '⚠ Não identificado'} · Resolução: ${log.exam?.resolution === 'manual' ? 'Manual' : 'Automática'}`));
        const status = ({ recording: "Gravando", transcribing: "Transcrevendo", processing: "Processando", inserting: "Inserindo", success: "Sucesso", error: "Erro" })[log.status] || "Registro";
        card.append(element("small", "", `${duration(log.audio?.durationSeconds)} · ${log.commands?.length || 0} comandos · ${status}`));
        list.append(card);
      }
      container.append(list);
    },
  });
})();
