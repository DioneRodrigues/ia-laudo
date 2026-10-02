(() => {
  const EV = globalThis.EdenVoice;
  // Ícones vetoriais locais; os textos vindos do backend nunca entram em HTML.
  const paths = {
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    send: '<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    file: '<path d="M14 2H5v20h14V7l-5-5ZM14 2v6h5M8 12h8M8 16h6"/>',
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.mic}</svg>`;
  EV.createUI = (handlers) => {
    const root = document.createElement('section');
    root.id = 'eden-voice-transcriber-root';
    root.setAttribute('aria-label', 'Ditado médico da Clínica da Mama');
    root.innerHTML = `
      <button type="button" class="ev-reopen" hidden>${icon('mic')}<span>Abrir ditado da Mama</span></button>
      <div class="ev-panel">
        <header class="ev-header">
          <img class="ev-logo" alt="Clínica da Mama" width="112" height="62">
          <div class="ev-brand"><strong>Assistente de ditado</strong><span>Exclusivo Clínica da Mama</span></div>
          <button type="button" class="ev-close" aria-label="Fechar painel e acessar o editor Eden" title="Fechar e acessar o editor">${icon('close')}</button>
        </header>
        <div class="ev-body">
          <div class="ev-session">
            <div class="ev-state-icon">${icon('mic')}</div>
            <div class="ev-session-copy"><div class="ev-status-row"><span class="ev-record-dot" aria-hidden="true"></span><h2 class="ev-status" role="status" aria-live="polite"></h2></div><p class="ev-hint"></p></div>
            <output class="ev-timer" aria-label="Tempo de gravação">00:00</output>
          </div>
          <div class="ev-wave" aria-hidden="true">${Array.from({ length: 25 }, (_, i) => `<i style="--bar:${8 + ((i * 17) % 27)}px;--delay:${-(i % 7) * 0.13}s"></i>`).join('')}</div>
          <audio controls aria-label="Ouvir gravação" hidden></audio>
          <p class="ev-error" role="alert" hidden></p>
          <section class="ev-command-section" hidden aria-label="Comandos médicos expandidos">
            <div class="ev-command-heading">${icon('file')}<h3>Comandos médicos</h3><span class="ev-command-count"></span></div>
            <p class="ev-medical-commands" role="status"></p>
            <ul class="ev-command-list"></ul>
          </section>
          <p class="ev-no-commands" hidden>Nenhum comando médico identificado neste ditado.</p>
          <div class="ev-recovery" hidden><label>Transcrição para cópia manual<textarea readonly rows="4"></textarea></label></div>
        </div>
        <div class="ev-bottom"><div class="ev-actions"></div><p class="ev-replace-note">Ao transcrever, o novo ditado substitui o texto do campo Eden.</p></div>
        <footer class="ev-footer"><span class="ev-footer-dot" aria-hidden="true"></span>Ditado exclusivo pela extensão</footer>
      </div>`;
    const get = (selector) => root.querySelector(selector);
    const logoURL = globalThis.chrome?.runtime?.getURL?.('assets/clinicadamama-logo.png');
    if (logoURL) get('.ev-logo').src = logoURL;
    else get('.ev-logo').hidden = true;
    let editor, saved, closed = false, frame, reservedHeight = 380;
    const resize = new ResizeObserver(() => schedulePosition());
    const restore = () => {
      resize.disconnect();
      if (!editor || !saved) return;
      for (const [name, value, priority] of saved.styles) {
        if (value) editor.style.setProperty(name, value, priority);
        else editor.style.removeProperty(name);
      }
      if (saved.tabindex === null) editor.removeAttribute('tabindex');
      else editor.setAttribute('tabindex', saved.tabindex);
      editor.removeAttribute('data-eden-voice-covered');
      saved = null;
    };
    const cover = () => {
      if (!editor || closed || saved) return;
      saved = {
        styles: ['min-height'].map((name) => [name, editor.style.getPropertyValue(name), editor.style.getPropertyPriority(name)]),
        tabindex: editor.getAttribute('tabindex'),
      };
      // Reserva espaço sem inserir nós no documento controlado pelo ProseMirror.
      editor.style.setProperty('min-height', `${reservedHeight}px`);
      editor.setAttribute('tabindex', '-1');
      editor.setAttribute('data-eden-voice-covered', 'true');
      resize.observe(editor);
    };
    const position = () => {
      frame = null;
      if (!editor?.isConnected || !editor.getClientRects().length) { root.hidden = true; return; }
      const rect = editor.getBoundingClientRect();
      root.hidden = rect.width <= 0 || rect.bottom <= 0 || rect.top >= window.innerHeight;
      if (root.hidden) return;
      const left = Math.max(0, rect.left);
      const width = Math.max(0, Math.min(rect.right, window.innerWidth) - left);
      const top = closed ? Math.max(4, rect.top - 40) : Math.max(0, rect.top);
      const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - top);
      const values = { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: closed ? '36px' : `${height}px` };
      for (const [name, value] of Object.entries(values)) if (root.style[name] !== value) root.style[name] = value;
      root.classList.toggle('ev-narrow', width < 400);
    };
    function schedulePosition() {
      if (!frame) frame = requestAnimationFrame(position);
    }
    const setClosed = (value) => {
      closed = value;
      root.classList.toggle('ev-closed', closed);
      get('.ev-panel').hidden = closed;
      get('.ev-reopen').hidden = !closed;
      if (closed) { restore(); if (editor) resize.observe(editor); editor?.focus({ preventScroll: true }); }
      else { cover(); get('.ev-close').focus({ preventScroll: true }); }
      position();
    };
    get('.ev-close').onclick = () => { void handlers.close(); };
    get('.ev-reopen').onclick = () => setClosed(false);
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, true);
    document.body.append(root);
    console.info('[Eden Voice] Interface criada');
    return {
      root,
      attach(target) {
        if (!root.isConnected) document.body?.append(root);
        if (target !== editor) {
          restore(); editor = target;
          if (editor) { cover(); resize.observe(editor); }
        }
        cover();
        position();
      },
      close: () => setClosed(true),
      open: () => { if (closed) setClosed(false); },
      suspend() { restore(); root.hidden = true; },
      time(seconds) {
        const hours = Math.floor(seconds / 3600);
        get('.ev-timer').textContent = [...(hours ? [hours] : []), Math.floor(seconds / 60) % 60, seconds % 60]
          .map((n) => String(n).padStart(2, '0')).join(':');
      },
      render({ state, error = '', audioURL = '', text = '', medicalCommandCount = 0, medicalCommands = [] }) {
        // Dá espaço para ler a expansão sem ocultar as ações; listas longas ainda rolam.
        reservedHeight = medicalCommandCount > 0 || text ? 480 : 380;
        if (saved && editor.style.minHeight !== `${reservedHeight}px`) editor.style.minHeight = `${reservedHeight}px`;
        const titles = { idle: 'Pronto para gravar', requesting: 'Aguardando microfone…', recording: 'Gravando', stopping: 'Finalizando…', ready: 'Gravação concluída', transcribing: 'Transcrevendo… Aguarde', success: 'Texto inserido no Eden', recovery: 'Transcrição recebida', error: 'Não foi possível concluir', submitting: 'Texto inserido. Enviando ao Eden…', sent: 'Comando enviado ao Eden' };
        const hints = { idle: 'Inicie o ditado e fale no seu ritmo.', requesting: 'Autorize o microfone para começar.', recording: 'Sua voz está sendo gravada pela extensão.', stopping: 'Preparando seu áudio.', ready: 'Ouça o áudio ou transcreva para continuar.', transcribing: 'Convertendo o áudio e expandindo os comandos médicos.', success: 'O campo Eden recebeu o novo ditado.', submitting: 'Aguardando o Eden receber o ditado.', sent: 'Confira o relatório gerado pelo Eden.', recovery: 'Confira o editor. O texto está disponível para cópia.', error: 'Confira a mensagem abaixo antes de tentar novamente.' };
        root.dataset.state = state;
        get('.ev-status').textContent = titles[state];
        get('.ev-hint').textContent = hints[state];
        get('.ev-state-icon').innerHTML = icon(['success', 'sent'].includes(state) ? 'check' : 'mic');
        get('.ev-timer').hidden = !['idle', 'requesting', 'recording', 'stopping', 'ready'].includes(state);
        get('.ev-wave').hidden = state !== 'recording';
        get('.ev-command-section').hidden = medicalCommandCount === 0;
        get('.ev-command-count').textContent = String(medicalCommandCount);
        get('.ev-medical-commands').textContent = medicalCommandCount === 1 ? '1 comando médico aplicado' : `${medicalCommandCount} comandos médicos aplicados`;
        const list = get('.ev-command-list');
        list.replaceChildren();
        for (const command of medicalCommands) {
          const item = document.createElement('li');
          const title = document.createElement('strong'); title.textContent = command.label;
          const alias = document.createElement('span'); alias.className = 'ev-alias'; alias.textContent = `Reconhecido: “${command.alias}”`;
          const phrase = document.createElement('p'); phrase.textContent = command.replacement;
          item.append(title, alias, phrase); list.append(item);
        }
        get('.ev-no-commands').hidden = medicalCommandCount > 0 || !['success', 'sent'].includes(state);
        get('.ev-error').textContent = error; get('.ev-error').hidden = !error;
        const audio = get('audio'); audio.hidden = state !== 'ready';
        if (audio.getAttribute('src') !== (audioURL || null)) {
          audio.pause();
          if (audioURL) audio.src = audioURL; else audio.removeAttribute('src');
          audio.load();
        }
        get('.ev-recovery').hidden = !text;
        get('textarea').value = text;
        get('.ev-replace-note').hidden = !['idle', 'ready'].includes(state);
        const actions = get('.ev-actions'); actions.replaceChildren();
        const buttons = {
          idle: [['Iniciar gravação', 'start', 'mic']], recording: [['Finalizar', 'stop', 'stop']],
          ready: [['Transcrever', 'transcribe', 'send'], ['Descartar', 'reset', 'trash']],
          success: [['Novo ditado', 'reset', 'mic']], sent: [['Novo ditado', 'reset', 'mic']],
          recovery: [['Novo ditado', 'reset', 'mic']], error: [['Tentar novo ditado', 'reset', 'mic']],
        };
        for (const [index, [label, action, symbol]] of (buttons[state] || []).entries()) {
          const button = document.createElement('button');
          button.type = 'button'; button.className = index ? 'ev-secondary' : 'ev-primary';
          button.innerHTML = icon(symbol);
          const caption = document.createElement('span'); caption.textContent = label; button.append(caption);
          button.onclick = handlers[action]; actions.append(button);
        }
        get('.ev-bottom').hidden = !actions.childElementCount;
        schedulePosition();
      },
    };
  };
})();
