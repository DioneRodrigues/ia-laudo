import { MEASUREMENT_RULES } from '../config/clinicalDictation.js';
export function calculateMeasurements(measurements, examContext) {
  return measurements.map((measurement) => {
    const rule = MEASUREMENT_RULES[measurement.structure?.replace(/_(direito|esquerdo)$/, '')];
    const values = measurement.values;
    if (!rule?.calculateVolume || !rule.exams.includes(examContext) || rule.formula !== 'ellipsoid'
      || measurement.type !== 'dimensions3d' || values?.length !== 3 || !values.every((n) => Number.isFinite(n) && n > 0)
      || !['cm', 'mm'].includes(measurement.unit) || measurement.ambiguous) return measurement;
    const cm = values.map((n) => measurement.unit === 'mm' ? n / 10 : n);
    const volume = Number((cm.reduce((a, b) => a * b, rule.factor)).toFixed(rule.outputDecimals));
    return { ...measurement, volume, volumeUnit: 'cm³' };
  });
}
