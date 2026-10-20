export const CLINICAL_FILTER_CONFIG = Object.freeze({
  ENABLE_AI_FILTER: true,
  USE_DETERMINISTIC_FALLBACK: true,
  TIMEOUT_MS: 8000,
});
export function clinicalFilterConfig(env = process.env) {
  const flag = (key, fallback) => {
    if (env[key] === undefined) return fallback;
    if (!['true', 'false'].includes(env[key])) throw new Error(`Invalid ${key}`);
    return env[key] === 'true';
  };
  const timeout = Number(env.CLINICAL_FILTER_TIMEOUT_MS ?? CLINICAL_FILTER_CONFIG.TIMEOUT_MS);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 10000) throw new Error('Invalid CLINICAL_FILTER_TIMEOUT_MS');
  return { ENABLE_AI_FILTER: flag('ENABLE_AI_FILTER', true), USE_DETERMINISTIC_FALLBACK: flag('USE_DETERMINISTIC_FALLBACK', true), TIMEOUT_MS: timeout };
}
