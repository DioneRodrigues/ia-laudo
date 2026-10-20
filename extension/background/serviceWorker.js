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

// One-use capability binds the private binary channel to the isolated content script.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!['eden-audio:issue', 'eden-audio:verify'].includes(message?.type) || sender.id !== chrome.runtime.id) return false;
  void (async () => {
    if (message.type === 'eden-audio:issue') {
      if (!sender.tab || new URL(sender.url).origin !== 'https://pacs.evacenter.com') return { error: 'Origem inválida' };
      const token = crypto.randomUUID();
      await chrome.storage.session.set({ [`audio-channel:${token}`]: { tabId: sender.tab.id, expires: Date.now() + 15000 } });
      return { token };
    }
    if (sender.url !== chrome.runtime.getURL('storage/broker.html')) return { error: 'Origem inválida' };
    const key = `audio-channel:${message.token}`;
    const entry = (await chrome.storage.session.get(key))[key];
    await chrome.storage.session.remove(key);
    return { valid: !!entry && entry.tabId === sender.tab?.id && entry.expires > Date.now() };
  })().then(sendResponse, () => sendResponse({ error: 'Canal local indisponível' }));
  return true;
});
