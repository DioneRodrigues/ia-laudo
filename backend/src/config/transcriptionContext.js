import { ULTRASOUND_TERMS } from "./transcriptionVocabulary.js";

export const ULTRASOUND_TRANSCRIPTION_CONTEXT = `
Ditado médico de ultrassonografia em português brasileiro.
Transcreva fielmente apenas o que foi falado. Não resuma nem reorganize o laudo.
Não interprete clinicamente, não infira diagnósticos, não corrija achados,
não invente informações e não complete frases que não foram faladas.
Preserve negações, números, medidas, unidades, lateralidade e termos técnicos.
Não transforme positivo em negativo nem direita em esquerda.
Preserve comandos médicos curtos, sem expandir códigos ou comandos em frases clínicas.
Se ouvir "Chammas três", prefira "Chammas 3" ou "Chammas III".
Os termos abaixo são referências lexicais, não conteúdo a acrescentar.
Em caso de incerteza, priorize a fidelidade ao áudio, sem forçar um termo da lista.

Termos e comandos frequentes:
${ULTRASOUND_TERMS.join(", ")}.
`.trim();
