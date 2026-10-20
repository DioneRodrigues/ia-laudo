import { resolveExamContext } from '../config/examCatalog.js';
import { normalizeClinical, DICTATION_PATTERNS as P } from '../config/clinicalDictation.js';
import { MEASUREMENT_STRUCTURES, MEASUREMENT_SIGNALS as S } from '../config/measurementDetection.js';
import { splitDictation, stripTrailingFillers } from './clinicalText.js';
const number = '\\d+(?:[.,]\\d+)?';
const sequence = new RegExp(`(?<![\\d.,])${number}(?:\\s*(?:por|x|vezes)\\s*${number}){1,2}(?!\\d|[.,]\\d)`, 'u');
export function detectMeasurementSegment(text, context = {}) {
  const exam = context.examName != null ? resolveExamContext(context.examName).id
    : resolveExamContext(typeof context.examContext === 'string' ? context.examContext : context.examContext?.id).id;
  const value = normalizeClinical(stripTrailingFillers(text));
  const structures = (MEASUREMENT_STRUCTURES[exam || 'tireoide'] || []).filter((s) => s.pattern.test(value));
  const structure = structures.length === 1 ? structures[0].structure : null;
  const clinical = S.clinical.test(value);
  const structureMatch = structures.length === 1 ? value.match(structures[0].pattern) : null;
  const following = structureMatch ? value.slice(structureMatch.index + structureMatch[0].length).replace(/^[\s,:]+/u, '') : '';
  const list = structureMatch ? following.match(new RegExp(`^(${number})\\s*,\\s+(${number})\\s*,\\s+(${number})(?!\\d|[.,]\\d)`, 'u')) : null;
  const chain = value.match(sequence);
  const associatedTriple = structureMatch && (list || following.match(new RegExp(`^${number}(?:\\s*(?:por|x|vezes)\\s*${number}){2}(?!\\d|[.,]\\d)`, 'u')));
  const axisCount = [...value.matchAll(S.axes)].length;
  const numbers = [...value.matchAll(new RegExp(number, 'gu'))].map((m) => Number(m[0].replace(',', '.')));
  // Axis labels can precede or follow the value. This is evidence, not an axis assignment.
  const axisPattern = axisCount >= 2 && numbers.length >= 2 && numbers.length <= 3;
  const linearPattern = new RegExp(`${number}\\s*(?:cm|mm|centimetros?|milimetros?)\\b`, 'u').test(value);
  const containsMeasurement = !!chain || !!list || axisPattern || linearPattern;
  const values = list ? list.slice(1).map(n => Number(n.replace(',', '.'))) : chain ? [...chain[0].matchAll(new RegExp(number, 'gu'))].map((m) => Number(m[0].replace(',', '.'))) : containsMeasurement ? numbers : [];
  const clinicalScore = (structure ? S.weights.anatomy : 0) + (clinical ? S.weights.clinical : 0) + (containsMeasurement ? S.weights.numericPattern : 0);
  // Explicit questions/patient answers remain distinct from a clinician's trailing "tá?".
  const addressedSpeech = P.question.test(value) || P.patient.test(value) || P.instruction.test(value);
  const strongEvidence = containsMeasurement && clinicalScore >= S.reportThreshold && !addressedSpeech && (exam !== null || !!associatedTriple);
  const suspiciousValue = (exam === 'tireoide' || (!exam && !!associatedTriple)) && !/\b(cm|mm|centimetros?|milimetros?)\b/u.test(value)
    && values.some((n) => n > S.unitlessThyroidReviewThreshold);
  return { containsMeasurement, structure: exam || associatedTriple ? structure : null, examResolution: exam ? 'resolved' : 'unresolved', measurementType: values.length === 3 ? 'dimensions3d' : values.length === 2 ? 'dimensions2d' : 'linear',
    values, clinicalScore, strongEvidence, suspiciousValue };
}
export function detectMeasurements(text, context = {}) {
  let cursor = 0;
  return splitDictation(text).map((segment) => {
    const start = text.indexOf(segment, cursor); const end = start + segment.length; cursor = end;
    return { start, end, ...detectMeasurementSegment(segment, context) };
  }).filter((hint) => hint.containsMeasurement);
}
