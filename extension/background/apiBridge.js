(() => {
  const REQUEST_TYPE = 'eden-voice:api-request';
  const CANCEL_TYPE = 'eden-voice:api-cancel';
  const AUDIO_LIMIT = 20 * 1024 * 1024;
  const audioFormats = new Map([
    ['audio/webm', 'webm'], ['audio/ogg', 'ogg'], ['audio/mp4', 'mp4'],
    ['audio/wav', 'wav'], ['audio/x-wav', 'wav'], ['audio/mpeg', 'mp3'],
  ]);

  function createHandler({ apiBaseUrl, fetchImpl = fetch, extensionId }) {
    const activeRequests = new Map();
    const base = new URL(apiBaseUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
      throw new Error('API_BASE_URL precisa ser uma URL HTTP(S) válida.');
    }

    const isAllowedRoute = (method, path) => (method === 'GET' && path === '/medical-commands')
      || (method === 'POST' && path === '/transcribe')
      || (method === 'POST' && /^\/transcribe\/[0-9a-f-]{36}\/status$/u.test(path));

    async function handle(message, sender) {
      if (sender?.id !== extensionId) return { ok: false, status: 403, error: 'Origem da extensão não autorizada.' };
      if (message?.type === CANCEL_TYPE) {
        activeRequests.get(message.requestId)?.abort();
        return { ok: true, status: 200 };
      }
      if (message?.type !== REQUEST_TYPE || typeof message.requestId !== 'string'
        || typeof message.path !== 'string' || typeof message.method !== 'string') {
        return { ok: false, status: 400, error: 'Solicitação inválida.' };
      }

      const method = message.method.toUpperCase();
      const path = message.path.split('?')[0];
      if (!isAllowedRoute(method, path)) return { ok: false, status: 403, error: 'Rota da API não autorizada.' };
      const target = new URL(path, base.origin);
      if (target.origin !== base.origin) return { ok: false, status: 403, error: 'Host da API não autorizado.' };

      const controller = new AbortController();
      activeRequests.set(message.requestId, controller);
      try {
        const options = { method, signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' };
        if (path === '/transcribe') {
          const { audioBase64, audioType, fields } = message;
          const extension = audioFormats.get(audioType);
          if (!extension || typeof audioBase64 !== 'string' || audioBase64.length > Math.ceil(AUDIO_LIMIT * 4 / 3) + 8) {
            return { ok: false, status: 400, error: 'Áudio ou formato inválido.' };
          }
          if (!fields || typeof fields !== 'object'
            || !['patientContext', 'audioDurationSeconds', 'recordingStartedAt', 'recordingFinishedAt'].every((key) => typeof fields[key] === 'string')) {
            return { ok: false, status: 400, error: 'Metadados do ditado inválidos.' };
          }
          const binary = atob(audioBase64);
          if (binary.length > AUDIO_LIMIT) return { ok: false, status: 413, error: 'O áudio excedeu o limite de 20 MB.' };
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
          const form = new FormData();
          form.append('audio', new Blob([bytes], { type: audioType }), `laudo.${extension}`);
          for (const key of ['patientContext', 'audioDurationSeconds', 'recordingStartedAt', 'recordingFinishedAt']) form.append(key, fields[key]);
          options.body = form;
        } else if (message.json !== undefined) {
          options.headers = { 'Content-Type': 'application/json' };
          options.body = JSON.stringify(message.json);
        }

        const response = await fetchImpl(target.href, options);
        let data;
        try { data = await response.json(); }
        catch {
          const error = response.status === 502
            ? 'O proxy respondeu HTTP 502 (Bad Gateway) sem JSON. Verifique se o backend está ativo e se o proxy aponta para a porta 3001.'
            : `Resposta HTTP inválida do backend (${response.status}).`;
          return { ok: false, status: response.status, error };
        }
        return { ok: response.ok, status: response.status, data,
          ...(!response.ok ? { error: typeof data?.error === 'string' ? data.error : `Falha HTTP ${response.status}.` } : {}) };
      } catch (error) {
        return { ok: false, status: 0, error: error.name === 'AbortError' ? 'Requisição cancelada.' : 'Falha de rede ao acessar o backend pela extensão.' };
      } finally {
        if (activeRequests.get(message.requestId) === controller) activeRequests.delete(message.requestId);
      }
    }

    return Object.freeze({ handle });
  }

  globalThis.EdenVoiceApiBridge = Object.freeze({ REQUEST_TYPE, CANCEL_TYPE, createHandler });
})();
