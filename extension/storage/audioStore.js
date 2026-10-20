(() => {
  const EV = globalThis.EdenVoice ||= {};
  const AUDIO_RETENTION = EV.AUDIO_RETENTION;
  let database;
  function openDatabase() {
    if (database) return database;
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open('eden-voice', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('recordings', { keyPath: 'id' });
        for (const [name, path] of [['status', 'status'], ['createdAt', 'createdAt'], ['patientName', 'patient.name'], ['examName', 'exam.name']]) store.createIndex(name, path);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = null; };
        resolve(db);
      };
      request.onerror = () => { database = null; reject(request.error); };
      request.onblocked = () => { database = null; reject(new Error('Feche outras abas para atualizar o armazenamento de áudio.')); };
    });
    return database;
  }
  async function transaction(mode, action) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('recordings', mode, mode === 'readwrite' ? { durability: 'strict' } : {});
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Falha na transação de áudio.'));
      action(tx.objectStore('recordings'), (value) => { result = value; });
    });
  }
  const getRecording = (id) => transaction('readonly', (store, done) => { store.get(id).onsuccess = (event) => done(event.target.result); });
  const getRecentRecordings = () => transaction('readonly', (store, done) => { store.getAll().onsuccess = (event) => done(event.target.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))); });
  const updateRecording = (id, patch) => transaction('readwrite', (store, done) => {
    store.get(id).onsuccess = ({ target }) => {
      if (!target.result) { done(null); return; }
      const row = { ...target.result, ...patch, id, updatedAt: new Date().toISOString() };
      for (const key of ['audio', 'processing', 'transcription', 'insertion', 'exam']) if (patch[key]) row[key] = { ...target.result[key], ...patch[key] };
      store.put(row); done(row);
    };
  });
  const deleteRecording = (id) => transaction('readwrite', (store) => { store.delete(id); });
  // Cross-tab locking: the extension frame owns these locks; destroying it on reload releases them.
  const releases = new Map();
  async function claim(id) {
    if (releases.has(id)) return false;
    return new Promise((resolve, reject) => {
      navigator.locks.request(`eden-recording:${id}`, { ifAvailable: true }, async (lock) => {
        if (!lock) { resolve(false); return; }
        await new Promise((release) => { releases.set(id, release); resolve(true); });
      }).catch(reject);
    });
  }
  async function release(id) { releases.get(id)?.(); releases.delete(id); }
  async function recoverInterruptedRecordings() {
    for (const row of await getRecentRecordings()) {
      if (!['uploading', 'transcribing', 'transcribed', 'processing', 'inserting'].includes(row.status) || !await claim(row.id)) continue;
      try {
        const current = await getRecording(row.id);
        if (!current || !['uploading', 'transcribing', 'transcribed', 'processing', 'inserting'].includes(current.status)) continue;
        await updateRecording(row.id, { status: 'failed', processing: { autoRetryable: false, lastError: {
          stage: 'recovery', code: 'PROCESS_INTERRUPTED', message: 'Processamento interrompido antes da conclusão. Confira o editor antes de reprocessar.', timestamp: new Date().toISOString(),
        } } });
      } finally { release(row.id); }
    }
  }
  async function cleanupRecordings(now = Date.now()) {
    const rows = await getRecentRecordings();
    let remaining = rows.length;
    for (const row of rows.reverse()) {
      const age = now - Date.parse(row.status === 'success' ? row.insertion?.insertedAt || row.updatedAt : row.updatedAt);
      const expired = (row.status === 'success' && age >= AUDIO_RETENTION.SUCCESS_HOURS * 3600000)
        || (row.status === 'failed' && age >= AUDIO_RETENTION.FAILED_HOURS * 3600000);
      if (!(expired || (remaining > AUDIO_RETENTION.MAX_ENTRIES && row.status === 'success')) || !await claim(row.id)) continue;
      try {
        const current = await getRecording(row.id);
        if (!current || current.updatedAt !== row.updatedAt || current.status !== row.status) continue;
        await deleteRecording(row.id); remaining--; console.info('[Eden Voice] Retenção: gravação removida', row.id, row.status); }
      finally { release(row.id); }
    }
    if (remaining > AUDIO_RETENTION.MAX_ENTRIES) console.warn('[Eden Voice] Limite de entradas excedido; áudios pendentes/recentes preservados.');
  }
  async function saveRecording(row) {
    if (!(row.audio?.blob instanceof Blob) || !row.audio.blob.size) throw new Error('Blob de áudio inválido.');
    const estimate = await navigator.storage?.estimate?.().catch(() => null);
    if (estimate) console.info('[Eden Voice] Storage', { usage: estimate.usage, quota: estimate.quota });
    await cleanupRecordings().catch(() => console.warn('[Eden Voice] Limpeza adiada antes do salvamento'));
    const write = () => transaction('readwrite', (store, done) => { store.add(row); done(row); });
    try { return await write(); }
    catch (error) {
      if (error.name === 'ConstraintError') return getRecording(row.id); // Retry after a lost commit acknowledgement.
      if (error.name !== 'QuotaExceededError') throw error;
      // Under quota pressure, only completed recordings may be sacrificed.
      for (const old of (await getRecentRecordings()).reverse()) {
        if (old.status !== 'success' || !await claim(old.id)) continue;
        try { await deleteRecording(old.id); console.warn('[Eden Voice] Quota: success removido', old.id); }
        finally { release(old.id); }
        try { return await write(); } catch (retryError) { if (retryError.name !== 'QuotaExceededError') throw retryError; }
      }
      throw new DOMException('Não foi possível salvar o áudio localmente por falta de espaço.', 'QuotaExceededError');
    }
  }
  EV.AudioStore = Object.freeze({ openDatabase, saveRecording, getRecording, updateRecording, deleteRecording,
    getRecentRecordings, cleanupRecordings, clearExpiredRecordings: cleanupRecordings, recoverInterruptedRecordings, claim, release,
    getPendingRecordings: async () => (await getRecentRecordings()).filter((row) => row.status === 'pending'),
    getFailedRecordings: async () => (await getRecentRecordings()).filter((row) => row.status === 'failed'),
    countRecordings: async () => (await getRecentRecordings()).length,
  });
})();
