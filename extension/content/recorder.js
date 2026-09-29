(() => {
  const EV = globalThis.EdenVoice;
  const log = (message) => console.info(`[Eden Voice] ${message}`);
  const microphoneError = (error) => new Error({
    NotAllowedError: 'Acesso ao microfone recusado. Libere o microfone nas permissões deste site.',
    NotFoundError: 'Nenhuma entrada de áudio encontrada. Conecte um microfone.',
    NotReadableError: 'Não foi possível abrir o microfone. Verifique se outro aplicativo está usando o dispositivo.',
    SecurityError: 'O navegador bloqueou o microfone nesta página.',
  }[error.name] || 'Não foi possível iniciar a gravação. Verifique o microfone.');

  EV.AudioRecorder = class {
    constructor(onUnexpectedStop) {
      this.onUnexpectedStop = onUnexpectedStop;
      this.generation = 0;
    }
    closeTracks() {
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
        log('Microfone encerrado');
      }
    }
    async start() {
      if (!globalThis.MediaRecorder) throw new Error('Este navegador não oferece MediaRecorder. Use o Chrome atualizado.');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microfone indisponível. Abra o PACS em HTTPS.');
      const generation = ++this.generation;
      log('Solicitando acesso ao microfone');
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (error) { throw microphoneError(error); }
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        log('Microfone encerrado');
        throw new Error('A página mudou durante a solicitação do microfone.');
      }
      this.stream = stream;
      try {
        const preferred = 'audio/webm;codecs=opus';
        this.recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported(preferred) ? { mimeType: preferred } : {});
        const chunks = [];
        let bytes = 0;
        let failure;
        this.finished = new Promise((resolve, reject) => {
          this.recorder.ondataavailable = ({ data }) => {
            if (data.size) { chunks.push(data); bytes += data.size; }
            if (bytes > EV.CONFIG.MAX_AUDIO_BYTES && this.recorder.state !== 'inactive') {
              failure = new Error('Gravação excedeu 20 MB. Faça um ditado menor.');
              this.stop();
              this.onUnexpectedStop(failure);
            }
          };
          this.recorder.onerror = () => {
            failure = new Error('O navegador interrompeu a gravação. Grave novamente.');
            this.closeTracks();
            this.onUnexpectedStop(failure);
          };
          this.recorder.onstop = () => {
            this.closeTracks();
            if (failure) return reject(failure);
            const blob = new Blob(chunks, { type: this.recorder.mimeType || chunks[0]?.type || 'audio/webm' });
            if (!blob.size) return reject(new Error('A gravação ficou vazia. Grave novamente.'));
            if (blob.size > EV.CONFIG.MAX_AUDIO_BYTES) return reject(new Error('Gravação excedeu 20 MB. Faça um ditado menor.'));
            log('Gravação finalizada');
            log(`Blob criado: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
            resolve(blob);
          };
        });
        // Pode haver cancelamento antes de o controlador aguardar stop().
        this.finished.catch(() => {});
        stream.getAudioTracks().forEach((track) => track.addEventListener('ended', () => {
          if (this.recorder.state === 'recording') {
            failure = new Error('O microfone foi desconectado. Grave novamente.');
            this.stop();
            this.onUnexpectedStop(failure);
          }
        }));
        this.recorder.start(1000);
        log('Gravação iniciada');
      } catch (error) { this.closeTracks(); throw microphoneError(error); }
    }
    stop() {
      if (this.recorder?.state !== 'inactive' && this.recorder) this.recorder.stop();
      this.closeTracks();
      return this.finished;
    }
    dispose() {
      this.generation++;
      this.stop();
    }
  };
})();
