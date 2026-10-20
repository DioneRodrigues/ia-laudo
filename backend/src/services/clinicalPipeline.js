import { segmentTranscription, buildFilteredText } from './clinicalSegmenter.js';
import { detectMeasurements } from './measurementDetector.js';
import { detectMedicalCommands } from './medicalCommandDetector.js';
import { filterClinicalDictation } from './clinicalDictationFilter.js';
import { parseMeasurements, renderMeasurements } from './measurementParser.js';
import { calculateMeasurements } from './measurementCalculator.js';
import { resolveExamContext } from '../config/examCatalog.js';
export function prepareClinicalDictation(originalText, context = {}, logger = console, options = {}) {
  const examContext = context.examContext || resolveExamContext(context.examName).id;
  const filterDetails = {};
  let filteredText = originalText;
  try {
    logger.info('[Eden Voice] Filtrando fala clínica');
    const detection = detectMedicalCommands(originalText, { ...context, examContext });
    filterDetails.commandCandidates = detection.commands;
    if (options.classification) {
      const originalSegments = segmentTranscription(originalText);
      // Validate before applying deterministic protection; ignore all model text by construction.
      buildFilteredText(originalSegments, options.classification);
      filterDetails.segments = originalSegments.map(segment => {
        const decision = options.classification.segments.find(s => s.id === segment.id);
        const commandCandidates = detection.commands.filter(c => c.start >= segment.start && c.end <= segment.end)
          .map(c => ({ ...c, execute: !c.negated }));
        const protectedCommands = commandCandidates.filter(c => !c.negated).map(c => c.id);
        const includeInReport = protectedCommands.length > 0 || decision.include;
        const reason = protectedCommands.length ? 'medical_command' : decision.reason;
        return { ...segment, role: 'unknown', intent: includeInReport ? 'report' : decision.reason,
          reason, includeInReport, commandCandidates, protectedCommands };
      });
      filteredText = buildFilteredText(originalSegments, { segments: filterDetails.segments.map(s => ({ id: s.id, include: s.includeInReport, reason: s.reason })) });
      filterDetails.filteredText = filteredText;
      filterDetails.includedSegments = filterDetails.segments.filter(s => s.includeInReport).length;
      filterDetails.ignoredSegments = filterDetails.segments.length - filterDetails.includedSegments;
    } else {
      const measurementHints = detectMeasurements(originalText, { ...context, examContext });
      filterDetails.measurementHints = measurementHints;
      ({ filteredText } = filterClinicalDictation(originalText, { ...context, examContext, protectedCommands: detection.commands, measurementHints }, filterDetails));
    }
    logger.info(`[Eden Voice] Segmentos incluídos: ${filterDetails.includedSegments}`);
    logger.info(`[Eden Voice] Segmentos ignorados: ${filterDetails.ignoredSegments}`);
  } catch {
    // Preserve requested fallback for review, but never auto-insert an unfiltered transcript.
    filterDetails.failed = true;
    logger.warn('[Eden Voice] Falha no filtro; transcrição original preservada para revisão');
  }
  let text = filteredText, measurements = [];
  try {
    measurements = calculateMeasurements(parseMeasurements(filteredText, { examContext }), examContext);
    text = renderMeasurements(filteredText, measurements);
    for (const m of measurements) {
      logger.info(`[Eden Voice] Medida detectada: ${m.structure || 'unknown'}`);
      if (m.values) logger.info(`[Eden Voice] Dimensões: ${m.values.join(' x ')} ${m.unit || 'unidade desconhecida'}`);
      if (m.volume !== undefined) logger.info(`[Eden Voice] Volume calculado: ${m.volume} cm³`);
    }
  } catch { logger.warn('[Eden Voice] Falha nas medidas; texto clínico preservado'); }
  const mode = options.classification ? (options.mode || 'ai') : 'deterministic_fallback';
  const clinicalFilter = { mode, fallbackReason: options.classification ? null : 'AI_CLASSIFIER_NOT_CALLED', aiStatus: { state: options.classification ? 'completed' : 'not_called', called: false, code: options.classification ? null : 'AI_CLASSIFIER_NOT_CALLED', status: null, reason: options.classification ? null : 'local_deterministic_recovery' }, segments: (filterDetails.segments || []).map((s, id) => ({ id, include: s.includeInReport, reason: s.reason || s.intent })) };
  filterDetails.mode = mode;
  logger.info(`[Eden Voice] Clinical filter: ${mode === 'ai' ? 'AI' : mode}`);
  logger.info(`[Eden Voice] Segments: ${clinicalFilter.segments.length}`);
  logger.info(`[Eden Voice] Included: ${filterDetails.includedSegments || 0}`);
  logger.info(`[Eden Voice] Excluded: ${filterDetails.ignoredSegments || 0}`);
  logger.info(`[Eden Voice] Protected medical commands: ${(filterDetails.commandCandidates || []).filter(c => !c.negated).length}`);
  return { text, measurementText: text, filteredText, filterDetails, clinicalFilter, measurements, pipelineVersion: 5 };
}
