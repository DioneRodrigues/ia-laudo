import { classifierError, classifierDiagnostics, classifierProviderUrl } from './clinicalClassifierDiagnostics.js';
import { prepareClinicalDictation } from './clinicalPipeline.js';
import { segmentTranscription, validateClassification } from './clinicalSegmenter.js';
import { detectMedicalCommands } from './medicalCommandDetector.js';
import { resolveExamContext } from '../config/examCatalog.js';
import { CLINICAL_FILTER_CONFIG } from '../config/clinicalFilter.js';
export async function prepareClinicalDictationWithAI(originalText, context, logger, { classifier, config = CLINICAL_FILTER_CONFIG, signal } = {}) {
  const exam = resolveExamContext(context.examName);
  const commands = detectMedicalCommands(originalText, context).commands;
  const segments = segmentTranscription(originalText).map(s => ({ ...s, protectedCommands: commands.filter(c => c.start >= s.start && c.end <= s.end) }));
  logger.info({ examName: context.examName || '', examContextId: exam.id }, '[Eden Voice] Clinical filter context');
  let classification;
  let aiStatus = { state: 'not_called', called: false, code: 'AI_CLASSIFIER_NOT_CALLED', status: null, reason: 'empty_segments', providerUrl: classifierProviderUrl() };
  let blocked = false;
  if (!config.ENABLE_AI_FILTER) aiStatus = { ...aiStatus, state: 'disabled', code: 'AI_CLASSIFIER_DISABLED', reason: 'disabled_by_config' };
  if (config.ENABLE_AI_FILTER && segments.length) {
    const controller = new AbortController();
    let timer, abort;
    try {
      if (typeof classifier !== 'function') throw classifierError('AI_CLASSIFIER_NOT_CALLED', 'classifier_not_configured');
      aiStatus.called = true;
      logger.info('[Eden Voice] Clinical classifier iniciado');
      const deadline = new Promise((_, reject) => {
        abort = () => { controller.abort(); reject(classifierError('AI_CLASSIFIER_TIMEOUT', 'request_aborted')); };
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => { controller.abort(); reject(classifierError('AI_CLASSIFIER_TIMEOUT', 'deadline_exceeded')); }, config.TIMEOUT_MS);
        if (signal?.aborted) abort();
      });
      classification = await Promise.race([deadline, Promise.resolve().then(() => classifier({
        segments, examContext: { name: exam.label || '', id: exam.id }, protectedCommands: commands,
        signal: controller.signal, timeoutMs: config.TIMEOUT_MS,
      }))]);
      validateClassification(segments, classification);
      aiStatus = { ...aiStatus, state: 'completed', code: null, status: 200, reason: null };
      logger.info(`[Eden Voice] Clinical classifier concluído segments=${segments.length} included=${classification.segments.filter(s => s.include).length}`);
    } catch (error) {
      aiStatus = { ...aiStatus, state: 'failed', ...classifierDiagnostics(error) };
      if (aiStatus.code === 'AI_CLASSIFIER_NOT_CALLED') { aiStatus.called = false; aiStatus.state = 'not_called'; }
      logger.warn(`[Eden Voice] Clinical classifier falhou code=${aiStatus.code} status=${aiStatus.status ?? 'none'} reason=${aiStatus.reason}`);
      classification = undefined;
      if (!config.USE_DETERMINISTIC_FALLBACK) {
        blocked = true;
      }
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  const result = prepareClinicalDictation(originalText, context, logger, { classification, mode: classification ? 'ai' : 'deterministic_fallback' });
  if (blocked) result.filterDetails.failed = true;
  Object.assign(result.clinicalFilter, { fallbackReason: classification ? null : aiStatus.code, aiStatus,
    examContext: { examName: context.examName || '', examContextId: exam.id, examResolution: exam.id ? 'resolved' : 'unresolved' } });
  return result;
}
