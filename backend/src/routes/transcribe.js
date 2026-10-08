import { resolveExamMetadata } from '../config/examCatalog.js';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const formats = new Map([
  ['audio/webm', 'webm'], ['video/webm', 'webm'], ['audio/ogg', 'ogg'],
  ['audio/mp4', 'mp4'], ['audio/mpeg', 'mp3'], ['audio/wav', 'wav'], ['audio/x-wav', 'wav'],
]);
const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const safeDiagnostic = (value) => typeof value === 'string' && /^[\w.-]{1,100}$/u.test(value) ? value : undefined;

function getSafeProviderMessage(status) {
  if (status === 400) return 'A API de transcrição rejeitou os parâmetros enviados. Verifique o modelo e o contexto médico.';
  if (status === 401) return 'A autenticação da API de transcrição falhou. Verifique OPENAI_API_KEY no backend.';
  if (status === 403) return 'A conta da API não tem acesso ao modelo de transcrição configurado.';
  if (status === 404) return 'O modelo de transcrição configurado não foi encontrado ou não está disponível para a conta.';
  if (status === 429) return 'A API de transcrição atingiu o limite de uso ou de requisições. Verifique quota e billing.';
  if (status >= 500) return `A API de transcrição retornou erro temporário (HTTP ${status}). Tente novamente.`;
  return `A API de transcrição recusou a solicitação (HTTP ${status}).`;
}

export function getTranscriptionFailureDiagnostics(error) {
  const headers = error?.headers;
  let requestId;
  try { requestId = headers?.get?.('x-request-id') || error?._request_id || error?.request_id; } catch { /* sem diagnóstico de headers */ }
  return Object.fromEntries(Object.entries({
    errorName: safeDiagnostic(error?.name),
    errorCode: safeDiagnostic(error?.code),
    causeCode: safeDiagnostic(error?.cause?.code),
    upstreamStatus: Number.isInteger(error?.status) ? error.status : undefined,
    upstreamType: safeDiagnostic(error?.type),
    upstreamParam: safeDiagnostic(error?.param),
    upstreamRequestId: safeDiagnostic(requestId),
  }).filter(([, value]) => value !== undefined));
}

export default async function transcribeRoutes(app, { uploadsDir, transcribeAudio, processMedicalCommands, logStore }) {
  app.post('/transcribe/:logId/status', async (request, reply) => {
    const { status, completionToken, error } = request.body || {};
    const updated = logStore.finish(request.params.logId, completionToken, { status, error });
    if (!updated) return reply.code(404).send({ success: false, error: 'Registro não encontrado ou token de conclusão inválido.' });
    return { success: true };
  });

  app.post('/transcribe', async (request, reply) => {
    let directory, filePath, size = 0, text, originalText, failure;
    let patientContext = null, audioDurationSeconds = 0, recordingStartedAt = null, recordingFinishedAt = null;
    let logId = null, completionToken = null;
    let transcriptionStartedAt = null, transcriptionDurationMs = 0;
    let medicalCommandCount = 0;
    let medicalCommands = [];
    let exam = resolveExamMetadata(null);
    const started = performance.now();
    const controller = new AbortController();
    const abort = () => { if (!reply.raw.writableEnded) controller.abort(); };
    request.raw.on('aborted', abort);
    reply.raw.on('close', abort);
    try {
      if (!request.isMultipart()) throw httpError(415, 'Envie multipart/form-data com o campo audio.');
      for await (const part of request.parts()) {
        if (part.type === 'field') {
          if (part.fieldname === 'patientContext') {
            try { patientContext = JSON.parse(part.value); } catch { patientContext = null; }
          } else if (part.fieldname === 'audioDurationSeconds') {
            const parsed = Number(part.value);
            if (Number.isFinite(parsed)) audioDurationSeconds = Math.max(0, Math.min(parsed, 36000));
          } else if (part.fieldname === 'recordingStartedAt') recordingStartedAt = part.value;
          else if (part.fieldname === 'recordingFinishedAt') recordingFinishedAt = part.value;
          else throw httpError(400, 'Campo de formulário não suportado.');
          continue;
        }
        if (part.type !== 'file' || part.fieldname !== 'audio' || filePath) { part.file?.resume(); throw httpError(400, 'Envie somente um arquivo no campo audio.'); }
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
      exam = resolveExamMetadata(patientContext?.examName);
      transcriptionStartedAt = performance.now();
      ({ id: logId, token: completionToken } = logStore.begin({
        patient: patientContext,
        exam,
        audio: { durationSeconds: audioDurationSeconds, sizeBytes: size },
        recordingStartedAt, recordingFinishedAt,
      }));
      text = await transcribeAudio(filePath, { signal: controller.signal });
      transcriptionDurationMs = performance.now() - transcriptionStartedAt;
      if (typeof text !== 'string' || !text.trim()) throw httpError(502, 'O serviço não retornou uma transcrição válida.');
      originalText = text;
      try {
        const details = {};
        const processedText = processMedicalCommands(originalText, details, app.log, { examName: patientContext?.examName });
        if (typeof processedText !== 'string' || !processedText.trim()) throw new Error('Resultado inválido');
        text = processedText;
        medicalCommandCount = details.count || 0;
        medicalCommands = details.commands || [];
      } catch {
        app.log.error('[Eden Voice] Erro ao processar comandos; mantendo transcrição original');
        text = originalText;
      }
      logStore.addTranscript(logId, {
        originalText, finalText: text, commands: medicalCommands,
        durationMs: transcriptionDurationMs,
      });
    } catch (error) {
      if (transcriptionStartedAt !== null) transcriptionDurationMs = performance.now() - transcriptionStartedAt;
      app.log.error({ event: 'transcription_upstream_failed', ...getTranscriptionFailureDiagnostics(error) },
        'Falha na transcrição (detalhes sensíveis omitidos)');
      if (error.code === 'FST_REQ_FILE_TOO_LARGE') failure = httpError(413, 'O áudio excedeu o limite de 20 MB.');
      else if (['FST_FILES_LIMIT', 'FST_FIELDS_LIMIT', 'FST_PARTS_LIMIT', 'FST_INVALID_MULTIPART_CONTENT_TYPE'].includes(error.code)) failure = httpError(400, 'Envie somente um arquivo no campo audio.');
      else if (error.name === 'APIConnectionTimeoutError' || error.name === 'AbortError') failure = httpError(504, 'Tempo limite excedido ou requisição cancelada.');
      else if (error.statusCode && error.statusCode < 600) failure = error;
      else if (Number.isInteger(error.status) && error.status >= 400 && error.status < 600) {
        failure = httpError(error.status, getSafeProviderMessage(error.status));
      }
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
    if (failure && logId) logStore.fail(logId, 'transcription', failure.message, transcriptionDurationMs);
    const statusCode = failure?.statusCode || 200;
    app.log.info({ event: 'transcription', logId, durationMs: Math.round(performance.now() - started), bytes: size, success: !failure, statusCode });
    return reply.code(statusCode).send(failure ? { success: false, error: failure.message, logId } : {
      success: true, originalText, text, medicalCommandCount, medicalCommands, exam, examResolution: { source: 'automatic' }, logId, completionToken,
    });
  });
}
