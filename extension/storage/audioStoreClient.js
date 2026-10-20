(() => {
  const EV = globalThis.EdenVoice;
  let connection;
  function connect() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.hidden = true; frame.setAttribute('aria-hidden', 'true');
      frame.src = chrome.runtime.getURL('storage/broker.html');
      const channel = new MessageChannel();
      const pending = new Map();
      let sequence = 0;
      const timer = setTimeout(() => { connection = null; frame.remove(); reject(new Error('Armazenamento local da extensão indisponível. Áudio ainda não protegido.')); }, 10000);
      channel.port1.onmessage = ({ data }) => {
        if (data.ready) {
          clearTimeout(timer);
          resolve((method, ...args) => new Promise((done, fail) => {
            const id = ++sequence;
            const timeout = setTimeout(() => { pending.delete(id); fail(new Error('Tempo limite de comunicação com o armazenamento local.')); }, EV.CONFIG.REQUEST_TIMEOUT_MS + 15000);
            pending.set(id, { done, fail, timeout }); channel.port1.postMessage({ id, method, args });
          })); return;
        }
        const task = pending.get(data.id); if (!task) return;
        pending.delete(data.id); clearTimeout(task.timeout);
        if (data.error) task.fail(Object.assign(new Error(data.error.message), { name: data.error.name })); else task.done(data.result);
      };
      frame.onload = async () => {
        try {
          const { token } = await chrome.runtime.sendMessage({ type: 'eden-audio:issue' });
          if (!token) throw new Error('Falha ao autenticar armazenamento da extensão.');
          frame.contentWindow.postMessage({ type: 'eden-audio-connect', token }, new URL(frame.src).origin, [channel.port2]);
        } catch (error) { clearTimeout(timer); connection = null; frame.remove(); reject(error); }
      };
      document.documentElement.append(frame);
    });
    return connection;
  }
  EV.AudioBroker = { call: async (method, ...args) => (await connect())(method, ...args) };
  EV.AudioStore = Object.fromEntries(['saveRecording', 'getRecording', 'updateRecording', 'deleteRecording', 'getRecentRecordings', 'cleanupRecordings', 'recoverInterruptedRecordings', 'claim', 'release'].map((method) => [method, (...args) => EV.AudioBroker.call(method, ...args)]));
})();
