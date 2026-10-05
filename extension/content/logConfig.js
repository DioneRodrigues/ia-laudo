(() => {
  globalThis.EdenVoice ||= {};
  globalThis.EdenVoice.LOG_CONFIG = Object.freeze({
    MAX_LOG_ENTRIES: 100,
    DEBUG_FULL_TEXT: false,
  });
})();
