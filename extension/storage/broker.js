(() => {
  const EV = globalThis.EdenVoice;
  const bridge = EdenVoiceApiBridge.createHandler({ apiBaseUrl: EV.CONFIG.API_BASE_URL, extensionId: chrome.runtime.id, getRecording: EV.AudioStore.getRecording });
  const allowed = new Set(['saveRecording', 'getRecording', 'updateRecording', 'deleteRecording', 'getRecentRecordings', 'cleanupRecordings', 'recoverInterruptedRecordings', 'claim', 'release']);
  let connected = false;
  window.addEventListener('message', async (event) => {
    if (event.source !== parent || event.origin !== 'https://pacs.evacenter.com' || event.data?.type !== 'eden-audio-connect' || !event.ports[0]) return;
    if (connected) return;
    const authorization = await chrome.runtime.sendMessage({ type: 'eden-audio:verify', token: event.data.token });
    if (!authorization?.valid || connected) return;
    connected = true;
    const port = event.ports[0];
    port.onmessage = async ({ data: { id, method, args } }) => {
      try {
        let result;
        if (method === 'api') result = await bridge.handle(args[0], { id: chrome.runtime.id });
        else if (allowed.has(method)) result = await EV.AudioStore[method](...args);
        else throw new Error('Operação não autorizada.');
        // Lists/checkpoint acknowledgements carry metadata only; playback loads a single Blob on demand.
        const metadata = (row) => { if (!row?.audio) return row; const { blob, ...audio } = row.audio; return { ...row, audio }; };
        if (method === 'getRecentRecordings') result = result.map(metadata);
        if (['saveRecording', 'updateRecording'].includes(method)) result = metadata(result);
        port.postMessage({ id, result });
      } catch (error) { port.postMessage({ id, error: { name: error.name, message: error.message } }); }
    };
    port.start(); port.postMessage({ ready: true });
  });
})();
