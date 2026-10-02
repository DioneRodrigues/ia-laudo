import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const formats = new Map([
  ['audio/webm', 'webm'], ['video/webm', 'webm'], ['audio/ogg', 'ogg'],
  ['audio/mp4', 'mp4'], ['audio/mpeg', 'mp3'], ['audio/wav', 'wav'], ['audio/x-wav', 'wav'],
]);
const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

export default async function transcribeRoutes(app, { uploadsDir, transcribeAudio, processMedicalCommands }) {
  app.post('/transcribe', async (request, reply) => {
    let directory, filePath, size = 0, text, failure;
    let medicalCommandCount = 0;
    const started = performance.now();
    const controller = new AbortController();
    const abort = () => { if (!reply.raw.writableEnded) controller.abort(); };
    request.raw.on('aborted', abort);
    reply.raw.on('close', abort);
    try {
      if (!request.isMultipart()) throw httpError(415, 'Envie multipart/form-data com o campo audio.');
      for await (const part of request.parts()) {
        if (part.type !== 'file' || part.fieldname !== 'audio' || filePath) {
          part.file?.resume();
          throw httpError(400, 'Envie somente um arquivo no campo audio.');
        }
        const extension = formats.get(part.mimetype.split(';')[0]);
        if (!extension) { part.file.resume(); throw httpError(415, 'Formato de áudio não suportado.'); }
        directory = await mkdtemp(join(uploadsDir, 'audio-'));
        filePath = join(directory, `audio.${extension}`);
        await pipeline(part.file, createWriteStream(filePath, { flags: 'wx', mode: 0o600 }), { signal: controller.signal });
        if (part.file.truncated) throw httpError(413, 'O áudio excedeu o limite de 20 MB.');
        size = (await stat(filePath)).size;
        if (!size) throw httpError(400, 'O arquivo de áudio está vazio.');
      }
      if (!filePath) throw httpError(400, 'Arquivo audio não encontrado.');
      text = await transcribeAudio(filePath, { signal: controller.signal });
      if (typeof text !== 'string' || !text.trim()) throw httpError(502, 'O serviço não retornou uma transcrição válida.');
      const originalText = text;
      try {
        const details = {};
        const processedText = processMedicalCommands(originalText, details, app.log);
        if (typeof processedText !== 'string' || !processedText.trim()) throw new Error('Resultado inválido');
        text = processedText;
        medicalCommandCount = details.count || 0;
      } catch {
        app.log.error('[Eden Voice] Erro ao processar comandos; mantendo transcrição original');
        text = originalText;
      }
    } catch (error) {
      if (error.code === 'FST_REQ_FILE_TOO_LARGE') failure = httpError(413, 'O áudio excedeu o limite de 20 MB.');
      else if (['FST_FILES_LIMIT', 'FST_FIELDS_LIMIT', 'FST_PARTS_LIMIT', 'FST_INVALID_MULTIPART_CONTENT_TYPE'].includes(error.code)) failure = httpError(400, 'Envie somente um arquivo no campo audio.');
      else if (error.name === 'APIConnectionTimeoutError' || error.name === 'AbortError') failure = httpError(504, 'Tempo limite excedido ou requisição cancelada.');
      else if (error.statusCode && error.statusCode < 600) failure = error;
      else failure = httpError(502, 'Não foi possível transcrever. Verifique a chave, o modelo e a disponibilidade do serviço no backend.');
    } finally {
      request.raw.off('aborted', abort);
      reply.raw.off('close', abort);
      if (directory) {
        try { await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
        catch {
          failure = httpError(500, 'Falha ao remover o áudio temporário. Verifique o diretório uploads no backend.');
          app.log.error({ event: 'audio_cleanup_failed' }, 'Falha na exclusão do áudio temporário');
        }
      }
    }
    const statusCode = failure?.statusCode || 200;
    app.log.info({ event: 'transcription', durationMs: Math.round(performance.now() - started), bytes: size, success: !failure, statusCode });
    return reply.code(statusCode).send(failure ? { success: false, error: failure.message } : { success: true, text, medicalCommandCount });
  });
}
