import { detectMeasurementSegment } from './measurementDetector.js';
import { MEASUREMENT_RULES, normalizeClinical } from '../config/clinicalDictation.js';
import { splitDictation } from './clinicalText.js';
const words = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20 };
export function normalizeMeasurementNumbers(text) {
  return normalizeClinical(text).replace(new RegExp(`\\b(${Object.keys(words).join('|')})\\b`, 'g'), (w) => words[w])
    .replace(/(\d+)\s+virgula\s+(\d+)/g, '$1.$2').replace(/(\d),(\d)/g, '$1.$2');
}
const number = '\\d+(?:\\.\\d+)?';
const axis = '(longitudinal|antero[ -]?posterior|ap|transversal|transverso)';
const unit = '(mm|cm|milimetros?|centimetros?)';
const axisName = (s) => /^(ap|antero)/.test(s) ? 'anteroposterior' : /^trans/.test(s) ? 'transverse' : 'longitudinal';
export function parseMeasurements(text, context = {}, details = {}) {
  const measurements = [];
  const sentences = splitDictation(text);
  for (const [index, sentence] of sentences.entries()) {
    let s = normalizeMeasurementNumbers(sentence);
    if (!/\b(rim|coledoco)\b/.test(s) && /^\d/.test(s)) {
      const previous = normalizeClinical(sentences[index - 1] || '');
      if (/^(rim(?: direito| esquerdo)?|coledoco)[.:]?$/u.test(previous)) s += ` ${previous}`;
    }
    const organs = [...s.matchAll(/\b(rim(?: direito| esquerdo)?|coledoco)\b/g)].map((m) => m[0].replace(' ', '_'));
    const unique = [...new Set(organs)];
    const hint = detectMeasurementSegment(sentence, context);
    const structure = unique.length === 1 ? unique[0] : hint.structure;
    const rule = MEASUREMENT_RULES[structure?.replace(/_(direito|esquerdo)$/, '')];
    const units = [...s.matchAll(new RegExp(`\\b${unit}\\b`, 'g'))].map((m) => /^(mm|mili)/.test(m[1]) ? 'mm' : 'cm');
    const resolvedUnit = new Set(units).size === 1 ? units[0] : !units.length && rule?.exams.includes(context.examContext) ? rule.defaultUnit : null;
    const axesMatches = [...s.matchAll(new RegExp(`(${number})\\s*(?:${unit}\\s*)?${axis}\\b`, 'g'))];
    const triple = s.match(new RegExp(`(${number})\\s*(?:x|por|vezes)\\s*(${number})(?:\\s*(?:x|por|vezes)\\s*(${number}))?\\b`));
    let values, axes;
    if (axesMatches.length) {
      axes = Object.fromEntries(axesMatches.map((m) => [axisName(m[3]), Number(m[1])]));
      values = axesMatches.map((m) => Number(m[1]));
    } else if (triple) values = triple.slice(1).filter(Boolean).map(Number);
    if (hint.structure?.endsWith('_tireoide') && hint.containsMeasurement && hint.values.length >= 2) {
      values = hint.values; axes = undefined;
    }
    if (values) {
      const numericCount = [...s.matchAll(/\d+(?:\.\d+)?/g)].length;
      measurements.push({ structure, type: values.length === 3 ? 'dimensions3d' : 'dimensions2d', values, ...(axes ? { axes } : {}), unit: resolvedUnit, examResolution: hint.examResolution,
        ...(hint.suspiciousValue ? { suspiciousValue: true } : {}),
        ambiguous: /-\s*\d/.test(s) || !!rule?.competingTarget?.test(s) || unique.length > 1 || numericCount !== values.length || (axes && Object.keys(axes).length !== values.length) || new Set(units).size > 1, sourceText: sentence });
    } else {
      for (const m of s.matchAll(new RegExp(`(${number})\\s*${unit}\\b`, 'g'))) measurements.push({ structure, type: 'linear', value: Number(m[1]), unit: /^(mm|mili)/.test(m[2]) ? 'mm' : 'cm', sourceText: sentence });
    }
  }
  details.measurements = measurements;
  return measurements;
}
export const formatMeasurementNumber = (n) => n.toLocaleString('pt-BR', { useGrouping: false, minimumFractionDigits: 1, maximumFractionDigits: 3 });
export function renderMeasurements(text, measurements) {
  let output = text;
  for (const m of measurements) {
    if (m.ambiguous) continue;
    const rawNumber = `(?:\\d+(?:[.,]\\d+)?|zero|um|uma|dois|duas|três|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)`;
    const spoken = `${rawNumber}(?:\\s+v[íi]rgula\\s+${rawNumber})?`;
    let normalized = m.sourceText.replace(new RegExp(`\\b${spoken}\\s+(?:por|vezes|x)\\s+${spoken}(?:\\s+(?:por|vezes|x)\\s+${spoken})?`, 'gi'), (match) => normalizeMeasurementNumbers(match).replace(/\s+(por|vezes|x)\s+/g, ' x ').replace(/(\d)\.(\d)/g, '$1,$2'));
    normalized = normalized.replace(/(\d)\.(\d)/g, '$1,$2');
    if (m.volume === undefined) { output = output.replace(m.sourceText, normalized); continue; }
    // Preserve all clinical qualifiers; append deterministic dimensions and volume to their source segment.
    const label = m.structure.replaceAll('_', ' ');
    output = output.replace(m.sourceText, `${normalized} ${label}: ${m.values.map(formatMeasurementNumber).join(' x ')} ${m.unit}. Volume aproximado: ${formatMeasurementNumber(m.volume)} cm³.`);
  }
  return output;
}
