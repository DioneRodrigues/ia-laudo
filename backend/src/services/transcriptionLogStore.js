import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const MAX_LOG_ENTRIES = 100;

const safeString = (value, maximum = 120000) => typeof value === 'string' ? value.slice(0, maximum) : null;
const safeDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;

export function createTranscriptionLogStore({ maxEntries = MAX_LOG_ENTRIES } = {}) {
  const logs = [];
  const completionTokens = new Map();
  const trim = () => {
    while (logs.length > maxEntries) {
      const removed = logs.pop();
      completionTokens.delete(removed.id);
    }
  };
  const get = (id) => logs.find((entry) => entry.id === id);
  const tokenMatches = (expected, provided) => {
    if (typeof provided !== 'string' || !expected) return false;
    const a = Buffer.from(expected), b = Buffer.from(provided);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  return Object.freeze({
    begin({ patient, exam, audio, recordingStartedAt, recordingFinishedAt }) {
      const id = randomUUID();
      const token = randomBytes(32).toString('base64url');
      const now = new Date().toISOString();
      const log = {
        id,
        timestamp: safeDate(recordingStartedAt) || now,
        date: null,
        time: null,
        patient: {
          name: safeString(patient?.patientName, 500),
          gender: safeString(patient?.gender, 100),
          age: safeString(patient?.age, 100),
          patientInfoRaw: safeString(patient?.patientInfoRaw, 500),
        },
        exam: { name: safeString(exam?.name, 1000) },
        audio: {
          durationSeconds: Number.isFinite(audio?.durationSeconds) ? Math.max(0, Math.min(audio.durationSeconds, 36000)) : 0,
          sizeBytes: Number.isSafeInteger(audio?.sizeBytes) ? Math.max(0, audio.sizeBytes) : 0,
        },
        recordingStartedAt: safeDate(recordingStartedAt),
        recordingFinishedAt: safeDate(recordingFinishedAt),
        transcription: { durationMs: 0, originalText: '', startedAt: now, finishedAt: null },
        commands: [],
        finalText: '',
        status: 'transcribing',
        error: null,
      };
      logs.unshift(log);
      completionTokens.set(id, token);
      trim();
      return { id, token };
    },
    addTranscript(id, { originalText, finalText, commands, durationMs }) {
      const log = get(id);
      if (!log) return false;
      log.transcription.originalText = safeString(originalText) || '';
      log.transcription.finishedAt = new Date().toISOString();
      log.transcription.durationMs = Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0;
      log.commands = Array.isArray(commands) ? commands.slice(0, 1000).map((command) => ({
        id: safeString(command?.id, 200) || '',
        label: safeString(command?.label, 1000) || '',
        alias: safeString(command?.alias, 1000) || '',
        detectedText: safeString(command?.detectedText, 5000) || '',
        replacement: safeString(command?.replacement, 30000) || '',
      })) : [];
      log.finalText = safeString(finalText) || '';
      log.status = 'processing';
      return true;
    },
    finish(id, token, { status, error } = {}) {
      const log = get(id);
      const expected = completionTokens.get(id);
      if (!log || !tokenMatches(expected, token) || !['success', 'error'].includes(status)) return false;
      log.status = status;
      log.error = status === 'error' ? {
        stage: safeString(error?.stage, 100) || 'transcription',
        message: safeString(error?.message, 4000) || 'Falha na operação.',
      } : null;
      completionTokens.delete(id);
      return true;
    },
    fail(id, stage, message, durationMs) {
      const log = get(id);
      if (!log) return false;
      log.status = 'error';
      log.transcription.finishedAt = new Date().toISOString();
      if (Number.isFinite(durationMs)) log.transcription.durationMs = Math.max(0, Math.round(durationMs));
      log.error = { stage: safeString(stage, 100) || 'transcription', message: safeString(message, 4000) || 'Falha na operação.' };
      completionTokens.delete(id);
      return true;
    },
    list() { return structuredClone(logs); },
    clear() { logs.splice(0); completionTokens.clear(); },
  });
}
