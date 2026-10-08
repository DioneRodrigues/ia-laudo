import { ULTRASOUND_TERMS } from "./transcriptionVocabulary.js";

export const ULTRASOUND_TRANSCRIPTION_CONTEXT = `
Você está transcrevendo um ditado médico de exame de ultrassonografia em português brasileiro.

OBJETIVO
Transcreva com máxima fidelidade apenas a fala relacionada ao exame e à descrição médica.
Mantenha a ordem em que o médico ditou os achados. Não transforme a transcrição em laudo pronto.

REGRAS DE FIDELIDADE
- Não resuma, não reorganize e não reescreva o conteúdo clínico.
- Não interprete clinicamente e não infira diagnósticos.
- Não complete frases, achados, medidas ou conclusões que não tenham sido falados.
- Preserve rigorosamente negações, afirmações, lateralidade, números, medidas, unidades e graus.
- Não transforme positivo em negativo, direito em esquerdo, presente em ausente ou singular em plural.
- Preserve termos anatômicos, classificações, siglas e nomenclatura de ultrassonografia.
- Preserve comandos médicos curtos exatamente como comandos; não os expanda em frases clínicas.
- Se ouvir números associados a classificações, preserve a classificação corretamente. Exemplo: "Chammas três" pode ser transcrito como "Chammas 3" ou "Chammas III".
- Para BI-RADS, TI-RADS, FIGO e Chammas, prefira a grafia médica convencional quando a fala for inequívoca.
- Não use os termos da lista abaixo para inventar conteúdo. Eles servem somente como referência lexical.

CONTEXTO DE ULTRASSONOGRAFIA
A fala pode conter termos de tireoide, mama, transvaginal/ginecológico e abdome, incluindo Doppler, ecogenicidade, morfologia, medidas, topografia e classificações.
Quando uma palavra comum e um termo médico de ultrassonografia tiverem som semelhante, prefira o termo médico SOMENTE quando isso for claramente compatível com o áudio e o contexto da frase.
Em caso de dúvida real, mantenha a transcrição mais fiel ao áudio e não force um termo do vocabulário.

CONVERSAS PARALELAS
O áudio pode conter conversas ambientais ou paralelas que não fazem parte do ditado do exame.
Desconsidere somente trechos claramente não dirigidos ao laudo, como cumprimentos, conversas administrativas, comentários pessoais ou diálogo com terceiros sem conteúdo clínico do exame.
Não descarte trechos clínicos apenas por parecerem informais.
Se houver dúvida se uma fala faz parte do exame, preserve-a em vez de omiti-la.

Termos e comandos frequentes:
${ULTRASOUND_TERMS.join(", ")}.
`.trim();
