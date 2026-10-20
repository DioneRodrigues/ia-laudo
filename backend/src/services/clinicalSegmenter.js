import { splitDictation } from './clinicalText.js';
export function segmentTranscription(text) {
  let cursor = 0;
  return splitDictation(text).map((segment, id) => {
    const start = text.indexOf(segment, cursor); const end = start + segment.length; cursor = end;
    return { id, text: text.slice(start, end), start, end };
  });
}
export const CLASSIFICATION_REASONS = ['report', 'question', 'patient_answer', 'instruction', 'conversation', 'unknown'];
export function validateClassification(originalSegments, classification, allowedReasons = CLASSIFICATION_REASONS) {
  if (!classification || Object.keys(classification).length !== 1 || !Array.isArray(classification.segments)
    || classification.segments.length !== originalSegments.length) throw new Error('INVALID_CLASSIFICATION');
  const ids = new Set(originalSegments.map(s => s.id)); const seen = new Set();
  for (const item of classification.segments) {
    if (!item || Object.keys(item).sort().join(',') !== 'id,include,reason' || !Number.isInteger(item.id)
      || !ids.has(item.id) || seen.has(item.id) || typeof item.include !== 'boolean' || !allowedReasons.includes(item.reason)) throw new Error('INVALID_CLASSIFICATION');
    if (allowedReasons === CLASSIFICATION_REASONS && item.include !== (item.reason === 'report')) throw new Error('INVALID_CLASSIFICATION');
    seen.add(item.id);
  }
  return classification;
}
export function buildFilteredText(originalSegments, classification) {
  validateClassification(originalSegments, classification, [...CLASSIFICATION_REASONS, 'medical_command', 'clinical_measurement', 'strong_clinical_measurement', 'negated_medical_command']);
  const included = new Set(classification.segments.filter(s => s.include).map(s => s.id));
  // Never use output text or ordering supplied by the model.
  return originalSegments.filter(s => included.has(s.id)).map(s => s.text).join(' ');
}
