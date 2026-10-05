(() => {
  const EV = globalThis.EdenVoice;
  const allowedClicks = new WeakSet();
  const pendingPauses = new WeakMap();
  const visible = (element) => element.isConnected && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== 'hidden';
  const find = (selector) => {
    const scope = EV.CONFIG.EDITOR_CONTAINER_SELECTOR
      ? document.querySelector(EV.CONFIG.EDITOR_CONTAINER_SELECTOR) : document;
    const matches = [...(scope?.querySelectorAll(selector) || [])].filter(visible);
    if (matches.length > 1) throw new Error('Mais de um controle Eden encontrado. Ajuste EDITOR_CONTAINER_SELECTOR.');
    return matches[0];
  };
  // Quando disponível, o estado explícito prevalece sobre rótulos em transição.
  const paused = (button) => button.getAttribute('aria-pressed') === 'false'
    || (button.getAttribute('aria-pressed') !== 'true' && /escuta em pausa/i.test(button.textContent));
  const active = (button) => button.getAttribute('aria-pressed') === 'true'
    || /escutando|ouvindo|escuta ativa|pausar (?:a )?escuta/i.test(button.textContent);
  const enabled = (button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true'
    && button.getAttribute('aria-busy') !== 'true' && getComputedStyle(button).pointerEvents !== 'none';
  const clickNative = (button) => {
    allowedClicks.add(button);
    try { button.click(); } finally { allowedClicks.delete(button); }
  };
  const delay = () => new Promise((resolve) => setTimeout(resolve, 50));
  const assertCurrent = (context, isCurrent) => {
    if (!isCurrent() || !EV.contextIsCurrent(context)) throw new Error('A página ou o editor mudou. Operação cancelada.');
  };
  EV.ensureEdenPaused = async (context, isCurrent) => {
    assertCurrent(context, isCurrent);
    const button = find(EV.CONFIG.DICTATION_BUTTON_SELECTOR);
    if (!button) return; // Mantém o painel utilizável quando o controle nativo não existe.
    if (paused(button)) return;
    if (!active(button) || !enabled(button)) {
      throw new Error('Não foi possível confirmar a pausa do Eden. O estado do controle nativo precisa ser validado antes de gravar.');
    }
    await pauseNative(button);
    assertCurrent(context, isCurrent);
    if (find(EV.CONFIG.DICTATION_BUTTON_SELECTOR) !== button) {
      await EV.ensureEdenPaused(context, isCurrent);
    }
  };
  // Compartilha a tentativa entre a proteção permanente e o início do ditado.
  const pauseNative = (button) => {
    if (pendingPauses.has(button)) return pendingPauses.get(button);
    const attempt = (async () => {
      clickNative(button);
      const deadline = performance.now() + EV.CONFIG.EDEN_CONTROL_TIMEOUT_MS;
      while (performance.now() < deadline) {
        if (!button.isConnected) return; // A vigilância examina o novo controle.
        if (paused(button)) {
          EV.Logger?.info('Escuta nativa do Eden pausada');
          return;
        }
        await delay();
      }
      throw new Error('O Eden não confirmou a pausa da escuta nativa.');
    })();
    pendingPauses.set(button, attempt);
    return attempt.finally(() => pendingPauses.delete(button));
  };
  const protectNativeCapture = () => {
    const attempted = new WeakSet();
    let suspended = false;
    const check = () => {
      if (suspended) return;
      let button;
      try { button = find(EV.CONFIG.DICTATION_BUTTON_SELECTOR); } catch { return; }
      if (!button) return;
      if (paused(button)) { attempted.delete(button); return; }
      if (!active(button) || !enabled(button) || attempted.has(button)) return;
      attempted.add(button);
      void pauseNative(button).then(() => attempted.delete(button)).catch(() => {
        EV.Logger?.error('Não foi possível pausar a escuta nativa do Eden');
      });
    };
    const observer = new MutationObserver(check);
    let timer;
    const resume = () => {
      suspended = false;
      observer.observe(document.documentElement, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['aria-pressed', 'aria-disabled', 'aria-busy', 'disabled'],
      });
      clearInterval(timer);
      timer = setInterval(check, 250);
      check();
    };
    window.addEventListener('pagehide', () => {
      suspended = true; observer.disconnect(); clearInterval(timer);
    });
    window.addEventListener('pageshow', (event) => { if (event.persisted) resume(); });
    resume();
  };
  EV.watchEdenPaused = (context, isCurrent, onFailure) => {
    let stopped = false, checking = false;
    const current = () => !stopped && isCurrent();
    const dispose = () => {
      stopped = true;
      observer.disconnect();
      clearInterval(timer);
    };
    const check = async () => {
      if (!current()) { dispose(); return; }
      if (checking) return;
      checking = true;
      try {
        await EV.ensureEdenPaused(context, current);
      } catch (failure) {
        if (current()) {
          dispose();
          await onFailure(failure);
        }
      } finally { checking = false; }
    };
    // Observa também remontagens do controle pelo React; não depende do SVG Lottie.
    const observer = new MutationObserver(() => { void check(); });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['aria-pressed', 'aria-disabled', 'aria-busy', 'disabled'],
    });
    const timer = setInterval(() => { void check(); }, 250);
    void check();
    return dispose;
  };
  EV.waitForEdenSubmit = async (context, isCurrent) => {
    const deadline = performance.now() + EV.CONFIG.EDEN_CONTROL_TIMEOUT_MS;
    while (performance.now() < deadline) {
      assertCurrent(context, isCurrent);
      const button = find(EV.CONFIG.SUBMIT_BUTTON_SELECTOR);
      if (button && enabled(button)) return button;
      await delay();
    }
    throw new Error('Texto inserido, mas o botão Criar relatório não ficou disponível. Envie pelo Eden manualmente; não é necessário transcrever novamente.');
  };
  EV.clickEdenSubmit = (button, context) => {
    if (!EV.contextIsCurrent(context) || find(EV.CONFIG.SUBMIT_BUTTON_SELECTOR) !== button || !enabled(button)) {
      throw new Error('O botão ou o exame mudou antes do envio. Confira o texto no Eden.');
    }
    clickNative(button);
    EV.Logger?.info('Comando Criar relatório enviado ao Eden');
  };
  EV.bindEdenControls = ({ toggle, busy }) => {
    // Captura no window antes da delegação de eventos do React. SVGs internos
    // são reconhecidos pelo caminho do evento, sem depender das classes Lottie.
    const intercept = (event) => {
      const button = event.composedPath().find((node) => node instanceof Element
        && node.matches(`${EV.CONFIG.DICTATION_BUTTON_SELECTOR},${EV.CONFIG.SUBMIT_BUTTON_SELECTOR}`));
      if (!button || allowedClicks.has(button)) return;
      const dictation = button.matches(EV.CONFIG.DICTATION_BUTTON_SELECTOR);
      if (!dictation && !busy()) return;
      if (event.type.startsWith('key') && !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (dictation && (event.type === 'click' || event.type === 'touchend' || (event.type === 'keydown' && !event.repeat))) toggle();
    };
    for (const type of ['click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'keydown', 'keyup']) {
      window.addEventListener(type, intercept, { capture: true, passive: false });
    }
    // Ativa já no carregamento: independe do painel, editor ou de Novo ditado.
    protectNativeCapture();
  };
})();
