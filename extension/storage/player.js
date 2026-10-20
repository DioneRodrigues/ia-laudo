(() => {
  const status = document.getElementById('player-status');
  const audio = document.getElementById('recording-audio');
  const PACS_ORIGIN = 'https://pacs.evacenter.com';
  const publish = (state, details = {}) => {
    if (window.parent !== window) window.parent.postMessage({ type: 'eden-audio-player', state, ...details }, PACS_ORIGIN);
  };
  let objectUrl;
  const reportError = (message) => { status.textContent = message; publish('error', { message }); };
  const rawId = new URLSearchParams(location.search).get('id') || '';
  if (!/^[0-9a-f-]{36}$/iu.test(rawId)) { reportError('Identificador de gravação inválido.'); return; }
  const request = indexedDB.open('eden-voice', 1);
  request.onerror = () => reportError('Não foi possível abrir o armazenamento local da extensão.');
  request.onupgradeneeded = () => {
    const store = request.result.createObjectStore('recordings', { keyPath: 'id' });
    for (const [name, path] of [['status', 'status'], ['createdAt', 'createdAt'], ['patientName', 'patient.name'], ['examName', 'exam.name']]) store.createIndex(name, path);
  };
  request.onsuccess = () => {
    const db = request.result;
    const transaction = db.transaction('recordings', 'readonly');
    const lookup = transaction.objectStore('recordings').get(rawId);
    lookup.onerror = () => reportError('Falha ao ler o áudio no armazenamento local.');
    lookup.onsuccess = () => {
      const blob = lookup.result?.audio?.blob;
      if (!(blob instanceof Blob) || !blob.size) { reportError('O áudio não foi encontrado no armazenamento local.'); return; }
      const type = blob.type || lookup.result.audio.mimeType || 'audio/webm';
      objectUrl = URL.createObjectURL(new Blob([blob], { type }));
      audio.src = objectUrl;
      audio.load();
    };
  };
  audio.addEventListener('loadedmetadata', () => { status.textContent = 'Áudio carregado. Use os controles para reproduzir.'; publish('ready'); });
  audio.addEventListener('playing', () => { status.textContent = 'Reproduzindo áudio salvo'; publish('playing'); });
  audio.addEventListener('pause', () => { if (!audio.ended) { status.textContent = 'Áudio pausado'; publish('paused'); } });
  audio.addEventListener('ended', () => { status.textContent = 'Reprodução concluída'; publish('ended'); });
  audio.addEventListener('error', () => {
    const code = audio.error?.code;
    reportError(code === 3 ? 'O Chrome não conseguiu decodificar este áudio.'
      : code === 4 ? 'O formato deste áudio não é suportado pelo player da extensão.'
        : 'Falha ao ler o áudio do armazenamento local.');
  });
  window.addEventListener('pagehide', () => {
    audio.pause(); audio.removeAttribute('src'); audio.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    try { request.result?.close(); } catch { /* A conexão pode ainda estar abrindo. */ }
  });
})();
