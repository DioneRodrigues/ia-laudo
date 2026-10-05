import { createReadStream } from "node:fs";
import OpenAI from "openai";
import { ULTRASOUND_TRANSCRIPTION_CONTEXT } from "../config/transcriptionContext.js";
import { ULTRASOUND_TERMS } from "../config/transcriptionVocabulary.js";

export function createTranscriptionService({
  env = process.env,
  logger = console,
  createClient = (options) => new OpenAI(options),
} = {}) {
  return async function transcribeAudio(filePath, { signal } = {}) {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ausente");
    const flag = (env.TRANSCRIPTION_MEDICAL_CONTEXT_ENABLED ?? "true").trim().toLowerCase();
    if (flag !== "true" && flag !== "false") {
      throw new Error("TRANSCRIPTION_MEDICAL_CONTEXT_ENABLED deve ser true ou false");
    }
    const enabled = flag === "true";
    const model = env.OPENAI_TRANSCRIPTION_MODEL || "gpt-transcribe";
    const usesLanguages = model === "gpt-transcribe" || model.startsWith("gpt-transcribe-");
    const client = createClient({
      apiKey: env.OPENAI_API_KEY,
      timeout: Number(env.OPENAI_TIMEOUT_MS || 120000),
      maxRetries: 0,
    });
    const started = performance.now();
    logger.info("[Eden Voice API] Iniciando transcrição");
    logger.info(`[Eden Voice API] Modelo: ${model}`);
    logger.info("[Eden Voice API] Idioma: pt");
    logger.info(`[Eden Voice API] Contexto médico: ${enabled ? "habilitado" : "desabilitado"}`);
    if (enabled) logger.info(`[Eden Voice API] Vocabulário médico carregado: ${ULTRASOUND_TERMS.length} termos`);

    const file = createReadStream(filePath);
    try {
      const request = {
        file,
        model,
        ...(enabled ? { prompt: ULTRASOUND_TRANSCRIPTION_CONTEXT } : {}),
      };
      // O body explícito segue a documentação e permite os campos novos no SDK 6.49.
      const result = await client.audio.transcriptions.create(request, {
        signal,
        body: {
          ...request,
          ...(usesLanguages ? { languages: ["pt"] } : { language: "pt" }),
          ...(enabled && usesLanguages ? { keywords: [...ULTRASOUND_TERMS] } : {}),
        },
      });
      if (typeof result.text !== "string" || !result.text.trim()) {
        logger.warn("[Eden Voice API] O provedor retornou uma transcrição vazia");
        throw Object.assign(new Error("Transcrição vazia"), { code: "TRANSCRIPTION_EMPTY" });
      }
      logger.info(`[Eden Voice API] Transcrição concluída em ${((performance.now() - started) / 1000).toFixed(1)}s`);
      return result.text;
    } catch (error) {
      // Não registrar a mensagem do provedor: ela pode reproduzir o prompt ou áudio.
      if (error.status === 400 && ["prompt", "keywords", "keywords[]"].includes(error.param)) {
        logger.warn("[Eden Voice API] API rejeitou o contexto médico. Verifique a compatibilidade/limites do modelo ou desative TRANSCRIPTION_MEDICAL_CONTEXT_ENABLED.");
      }
      throw error;
    } finally {
      file.destroy();
    }
  };
}

export const transcribeAudio = createTranscriptionService();
