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
    const header = get('header');
    header.title = 'Arraste para mover o painel';
    let drag = null;
    let moved = false;
    const position = (x, y) => {
      const bounds = root.getBoundingClientRect();
      const left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
      const top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
      if (root.style.left !== left) root.style.left = left;
      if (root.style.top !== top) root.style.top = top;
      if (root.style.right !== 'auto') root.style.right = 'auto';
      if (root.style.bottom !== 'auto') root.style.bottom = 'auto';
    };
    const keepInViewport = () => {
      if (!moved || !root.isConnected) return;
      const bounds = root.getBoundingClientRect();
      position(bounds.left, bounds.top);
    };
    header.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary || event.target.closest('button')) return;
      const bounds = root.getBoundingClientRect();
      drag = { id: event.pointerId, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top };
      header.setPointerCapture(event.pointerId);
      root.classList.add('ev-dragging');
      event.preventDefault();
    });
    header.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      moved = true;
      position(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    });
    const endDrag = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      drag = null;
      root.classList.remove('ev-dragging');
      if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) header.addEventListener(type, endDrag);
    window.addEventListener('resize', keepInViewport);
    // Mudanças de estado e minimizar/expandir podem alterar o tamanho do painel.
    new ResizeObserver(keepInViewport).observe(root);
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
