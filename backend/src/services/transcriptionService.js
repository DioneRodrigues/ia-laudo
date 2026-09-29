import { createReadStream } from 'node:fs';
import OpenAI from 'openai';

export async function transcribeAudio(filePath, { signal } = {}) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY ausente');
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: Number(process.env.OPENAI_TIMEOUT_MS || 120000),
    maxRetries: 0,
  });
  const file = createReadStream(filePath);
  try {
    const result = await client.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-transcribe',
    }, { signal });
    if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('Transcrição vazia');
    return result.text;
  } finally {
    file.destroy();
  }
}
