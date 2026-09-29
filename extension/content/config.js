(() => {
  const CONFIG = Object.freeze({
    API_BASE_URL: 'http://localhost:3001',
    REQUEST_TIMEOUT_MS: 150000,
    MAX_AUDIO_BYTES: 20 * 1024 * 1024,
    AUTO_SUBMIT: true,
    DICTATION_BUTTON_SELECTOR: '[data-testid="toggle-eden-ai-dictation-button"]',
    SUBMIT_BUTTON_SELECTOR: '[data-testid="execute-eden-ai-command-button"]',
    EDEN_CONTROL_TIMEOUT_MS: 4000,
    // Preencha somente se o DOM real tiver mais de um editor visível.
    EDITOR_CONTAINER_SELECTOR: '',
    // Opcional: seletor de um elemento cujo texto identifica o exame atual.
    EXAM_CONTEXT_SELECTOR: '',
  });
  globalThis.EdenVoice ||= { CONFIG };
})();
