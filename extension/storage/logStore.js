(() => {
  const EV = globalThis.EdenVoice ||= {};
  const KEY = "edenVoiceTranscriptionLogs";
  let writes = Promise.resolve();
  const storage = () => globalThis.chrome?.storage?.local;
  const read = async () => {
    const area = storage();
    if (!area) return [];
    const result = await area.get(KEY);
    return Array.isArray(result?.[KEY]) ? result[KEY] : [];
  };
  const serialize = (action) => {
    const current = writes.then(action, action);
    writes = current.catch(() => {});
    return current;
  };
  EV.LogStore = Object.freeze({
    async saveLog(log) {
      return serialize(async () => {
        const area = storage();
        if (!area) throw new Error("chrome.storage.local indisponível");
        const logs = await read();
        const next = [log, ...logs.filter((item) => item?.id !== log.id)]
          .slice(0, EV.LOG_CONFIG?.MAX_LOG_ENTRIES || 100);
        await area.set({ [KEY]: next });
        return log;
      });
    },
    async getLogs() { await writes; return read(); },
    async getLogById(id) { return (await this.getLogs()).find((log) => log.id === id) || null; },
    async clearLogs() {
      return serialize(async () => {
        const area = storage();
        if (!area) throw new Error("chrome.storage.local indisponível");
        await area.set({ [KEY]: [] });
      });
    },
  });
})();
