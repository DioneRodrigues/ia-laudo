(() => {
  const EV = globalThis.EdenVoice;
  const REQUEST_TYPE = 'eden-voice:api-request';
  const CANCEL_TYPE = 'eden-voice:api-cancel';

  const request = async ({ path, method = 'GET', audio, fields, json }, { signal } = {}) => {
    if (signal?.aborted) throw new DOMException('Requisição cancelada.', 'AbortError');
    const requestId = globalThis.crypto?.randomUUID?.() || `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let abortListener, sent = false;
    const aborted = signal && new Promise((_, reject) => {
      abortListener = () => {
        if (sent) void chrome.runtime.sendMessage({ type: CANCEL_TYPE, requestId }).catch(() => {});
        reject(new DOMException('Requisição cancelada.', 'AbortError'));
      };
      signal.addEventListener('abort', abortListener, { once: true });
    });
    aborted?.catch(() => {});
    try {
      const payload = { type: REQUEST_TYPE, requestId, path, method, ...(fields ? { fields } : {}), ...(json !== undefined ? { json } : {}) };
      if (audio) {
        const buffer = await audio.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
        }
        payload.audioBase64 = btoa(binary);
        payload.audioType = audio.type.split(';')[0].toLowerCase();
      }
      if (signal?.aborted) throw new DOMException('Requisição cancelada.', 'AbortError');
      sent = true;
      const responsePromise = chrome.runtime.sendMessage(payload);
      const response = await (aborted ? Promise.race([responsePromise, aborted]) : responsePromise);
      if (!response || typeof response.ok !== 'boolean') throw new TypeError('Resposta inválida do service worker da extensão.');
      if (response.status === 0) throw new TypeError(response.error || 'Falha de rede ao acessar o backend pela extensão.');
      return response;
    } finally {
      if (abortListener) signal.removeEventListener('abort', abortListener);
    }
  };

  EV.ApiClient = Object.freeze({ request });
})();
