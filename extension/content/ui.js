(() => {
  globalThis.EdenVoice.createUI = (handlers) => {
    const root = document.createElement('section');
    root.id = 'eden-voice-transcriber-root';
    root.setAttribute('aria-label', 'Transcrição por voz');
    // Template estático; nenhum conteúdo clínico é interpolado em HTML.
    root.innerHTML = `<header><strong>🎙 Transcrição</strong><button type="button" class="ev-minimize" aria-label="Minimizar painel" aria-expanded="true">−</button></header>
      <div class="ev-body"><p class="ev-status" role="status" aria-live="polite"></p>
      <output class="ev-timer">00:00</output><audio controls aria-label="Ouvir gravação" hidden></audio>
      <p class="ev-error" role="alert" hidden></p>
      <div class="ev-recovery" hidden><label>Transcrição para cópia manual<textarea readonly rows="5"></textarea></label></div>
      <div class="ev-actions"></div></div>`;
    const get = (selector) => root.querySelector(selector);
    get('.ev-minimize').onclick = () => {
      const minimized = root.classList.toggle('ev-minimized');
      get('.ev-minimize').textContent = minimized ? '+' : '−';
      get('.ev-minimize').setAttribute('aria-expanded', String(!minimized));
      get('.ev-minimize').setAttribute('aria-label', minimized ? 'Expandir painel' : 'Minimizar painel');
    };
    document.body.append(root);
    console.info('[Eden Voice] Interface criada');
    return {
      root,
      time(seconds) {
        const hours = Math.floor(seconds / 3600);
        get('.ev-timer').textContent = [ ...(hours ? [hours] : []), Math.floor(seconds / 60) % 60, seconds % 60 ]
          .map((n) => String(n).padStart(2, '0')).join(':');
      },
      render({ state, error = '', audioURL = '', text = '' }) {
        const titles = { idle: 'Pronto para gravar', requesting: 'Aguardando microfone…', recording: '🔴 Gravando', stopping: 'Finalizando…', ready: 'Gravação concluída', transcribing: '⏳ Transcrevendo… Aguarde', success: '✅ Texto inserido no Eden', recovery: 'Transcrição recebida', error: 'Não foi possível concluir' };
        titles.submitting = 'Texto inserido. Enviando ao Eden…';
        titles.sent = '✅ Comando enviado ao Eden';
        get('.ev-status').textContent = titles[state];
        get('strong').textContent = state === 'recording' ? '🔴 Gravando' : '🎙 Transcrição';
        get('.ev-error').textContent = error;
        get('.ev-error').hidden = !error;
        const audio = get('audio');
        audio.hidden = state !== 'ready';
        if (audio.getAttribute('src') !== (audioURL || null)) {
          audio.pause();
          if (audioURL) audio.src = audioURL;
          else audio.removeAttribute('src');
          audio.load();
        }
        get('.ev-recovery').hidden = !text;
        get('textarea').value = text;
        get('.ev-timer').hidden = ['transcribing', 'submitting', 'sent', 'success', 'recovery'].includes(state);
        const actions = get('.ev-actions');
        actions.replaceChildren();
        const buttons = { idle: [['🎙 Iniciar gravação', 'start']], recording: [['⏹ Finalizar', 'stop']], ready: [['Transcrever', 'transcribe'], ['Descartar', 'reset']], success: [['🎙 Novo ditado', 'reset']], recovery: [['🎙 Novo ditado', 'reset']], error: [['Tentar novo ditado', 'reset']] };
        buttons.sent = [['🎙 Novo ditado', 'reset']];
        for (const [label, action] of buttons[state] || []) {
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = label;
          button.onclick = handlers[action]; actions.append(button);
        }
      },
    };
  };
})();
