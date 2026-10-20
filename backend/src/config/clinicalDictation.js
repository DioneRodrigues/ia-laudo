export const normalizeClinical = (text) => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const DICTATION_PATTERNS = {
  instruction: /\b(respira|respire|prenda a respiracao|ench[ae](?: bem)? o peito|pode respirar|deite|vire|levante|(?:va|ir) ao banheiro|esvazie a bexiga|coloque (?:o pe|o calcanhar|um calcanhar)|pode se vestir)\b/,
  question: /^(voce|a senhora|o senhor|ja fez|teve|tem|alguma cirurgia|algum cancer|algum nodulo|sente dor|esta sentindo|usa medicamento)\b/,
  patient: /^(sim|nao[, ]|eu|ja fiz|fiz|tive|tenho|sinto|uso|minha|meu)\b/,
  conversation: /\b(senhora|senhor|voce|ta legal|tudo bem|obrigad[oa]|consulta|convenio|pagamento|recepcao|ano passado|eu|minha|meu|tenho|tive|fiz)\b/,
  report: /^(observa-se|presenca d[eo]|ausencia d[aeo]|paciente refere|sem vascularizacao|textura|ecogenicidade|contornos|limites|bi[ -]?rads|ti[ -]?rads|chammas|hemangioma|nodulo|cisto|miometrio|endometrio|ovario|utero|rim|figado|vesicula|coledoco|pancreas|baco|aorta|medindo|mede)\b/,
  axes: /\b(longitudinal|antero[ -]?posterior|ap|transversal|transverso)\b/,
};
export const EXAM_REPORT_TERMS = {
  abdome: /^(rim|figado|vesicula|coledoco|pancreas|baco|aorta)\b/,
  mama: /^(mamilo|retroareolar|mama|bi[ -]?rads)\b/,
  transvaginal: /^(endometrio|miometrio|ovario|utero|diu)\b/,
};
export const MEASUREMENT_RULES = {
  rim: { exams: ['abdome'], defaultUnit: 'cm', axes: ['longitudinal', 'anteroposterior', 'transverse'], calculateVolume: true, formula: 'ellipsoid', factor: 0.523, outputDecimals: 1, competingTarget: /\b(cisto|nodulo|lesao|massa|calculo)\b/ },
  coledoco: { exams: ['abdome'], defaultUnit: 'mm', calculateVolume: false },
};
