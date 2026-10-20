export function classifierError(code, reason, status = null) {
  return Object.assign(new Error(code), { classifierCode: code, classifierReason: reason, status });
}
const codes = new Set(['AI_CLASSIFIER_DISABLED', 'AI_CLASSIFIER_NOT_CALLED', 'AI_CLASSIFIER_TIMEOUT',
  'AI_CLASSIFIER_NETWORK_ERROR', 'AI_CLASSIFIER_HTTP_ERROR', 'AI_CLASSIFIER_INVALID_JSON',
  'AI_CLASSIFIER_SCHEMA_ERROR', 'AI_CLASSIFIER_EMPTY_RESPONSE', 'AI_CLASSIFIER_UNKNOWN_ERROR']);
export function classifierDiagnostics(error) {
  const status = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? error.status : null;
  let code = 'AI_CLASSIFIER_UNKNOWN_ERROR', reason = 'unexpected_error';
  if (codes.has(error?.classifierCode)) { code = error.classifierCode; reason = error.classifierReason; }
  else if (status) { code = 'AI_CLASSIFIER_HTTP_ERROR'; reason = `http_${status}`; }
  else if (['APIConnectionTimeoutError', 'AbortError'].includes(error?.name) || /Timeout/.test(error?.constructor?.name || '')) { code = 'AI_CLASSIFIER_TIMEOUT'; reason = 'deadline_exceeded'; }
  else if (error?.name === 'APIConnectionError' || error?.constructor?.name === 'APIConnectionError'
    || ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH'].includes(error?.cause?.code || error?.code)) { code = 'AI_CLASSIFIER_NETWORK_ERROR'; reason = 'connection_failed'; }
  else if (error?.message === 'INVALID_CLASSIFICATION') { code = 'AI_CLASSIFIER_SCHEMA_ERROR'; reason = 'invalid_segment_decisions'; }
  return { code, status, reason: typeof reason === 'string' && /^[a-z0-9_]{1,80}$/u.test(reason) ? reason : 'unexpected_error' };
}
export function classifierProviderUrl(env = process.env) {
  const url = new URL(`${(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/u, '')}/responses`);
  return `${url.origin}${url.pathname}`;
}
