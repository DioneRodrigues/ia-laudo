import { detectMedicalCommands } from './medicalCommandDetector.js';
import { DICTATION_PATTERNS as P, EXAM_REPORT_TERMS, normalizeClinical } from '../config/clinicalDictation.js';
import { resolveExamContext } from '../config/examCatalog.js';

import { splitDictation, stripTrailingFillers } from './clinicalText.js';
import { detectMeasurements } from './measurementDetector.js';
export { splitDictation, stripTrailingFillers } from './clinicalText.js';
export function filterClinicalDictation(text, context = {}, details = {}) {
  const exam = context.examContext || resolveExamContext(context.examName).id;
  const protectedCommands = context.protectedCommands ?? detectMedicalCommands(text, context).commands;
  const measurementHints = context.measurementHints ?? detectMeasurements(text, context);
  let cursor = 0;
  const original = text;
  const segments = splitDictation(text).map((text) => {
    const start = original.indexOf(text, cursor);
    const end = start + text.length; cursor = end;
    const commandCandidates = protectedCommands.filter((c) => c.start >= start && c.end <= end);
    const confirmed = commandCandidates.filter((c) => !c.negated);
    const measurementHint = measurementHints.find((h) => h.start === start && h.end === end);
    const value = normalizeClinical(stripTrailingFillers(text));
    let intent = 'unknown';
    if (P.question.test(value)) intent = 'question';
    else if (P.instruction.test(value)) intent = 'instruction';
    else if (P.patient.test(value)) intent = 'patient_answer';
    else if (P.conversation.test(value)) intent = 'conversation';
    else if (P.report.test(value) || EXAM_REPORT_TERMS[exam]?.test(value)
      || (/^\d/.test(value) && P.axes.test(value))) intent = 'report';
    let reason = intent;
    if (measurementHint?.strongEvidence) { intent = 'report'; reason = measurementHint.examResolution === 'unresolved' ? 'strong_clinical_measurement' : 'clinical_measurement'; }
    if (confirmed.length) { intent = 'report'; reason = 'medical_command'; }
    else if (commandCandidates.length) { intent = 'unknown'; reason = 'negated_medical_command'; }
    return { text, ...(measurementHint ? { measurementHint, clinicalScore: measurementHint.clinicalScore, reason } : {}), ...(commandCandidates.length ? { reason, commandCandidates, protectedCommands: confirmed.map((c) => c.id), negated: !confirmed.length } : {}), role: 'unknown', intent, includeInReport: intent === 'report', confidence: intent === 'unknown' ? 0 : 0.95 };
  });
  // Roles describe no biometric identity; future diarization can enrich them.
  const result = { filteredText: segments.filter((s) => s.includeInReport).map((s) => s.text).join(' '), segments };
  Object.assign(details, result, { includedSegments: segments.filter((s) => s.includeInReport).length, ignoredSegments: segments.filter((s) => !s.includeInReport).length });
  return result;
}
