importScripts(chrome.runtime.getURL('content/config.js'), chrome.runtime.getURL('background/apiBridge.js'));

const bridge = globalThis.EdenVoiceApiBridge.createHandler({
  apiBaseUrl: globalThis.EdenVoice.CONFIG.API_BASE_URL,
  extensionId: chrome.runtime.id,
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!['eden-voice:api-request', 'eden-voice:api-cancel'].includes(message?.type)) return false;
  void bridge.handle(message, sender).then(sendResponse, () => sendResponse({
    ok: false, status: 0, error: 'Falha de rede ao acessar o backend pela extensão.',
  }));
  return true;
});
