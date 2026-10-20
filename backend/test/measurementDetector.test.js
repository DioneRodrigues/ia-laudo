import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMeasurements } from '../src/services/measurementDetector.js';
import { filterClinicalDictation, stripTrailingFillers } from '../src/services/clinicalDictationFilter.js';
import { prepareClinicalDictation } from '../src/services/clinicalPipeline.js';
const context = { examName: 'Ultrassonografia da tireoide' };
const silent = { info() {}, warn() {} };
for (const [text, structure, values] of [
  ['Dimensões do lobo direito, 5,2 por 4,2 por 5,4, tá?', 'lobo_direito_tireoide', [5.2, 4.2, 5.4]],
  ['Dimensão do lobo esquerdo, 2,5, ântero-posterior 4,4, transverso 2,1, tá?', 'lobo_esquerdo_tireoide', [2.5, 4.4, 2.1]],
  ['Dimensão do lobo esquerdo, onde eu estou de 2,5, ântero-posterior 4,4, transverso 2,1, tá?', 'lobo_esquerdo_tireoide', [2.5, 4.4, 2.1]],
  ['Istmo, 2,4 por 0,5 por 3,4.', 'istmo_tireoide', [2.4, 0.5, 3.4]],
  ['Lobo direito, 4,5 por 4,2 por 2,0.', 'lobo_direito_tireoide', [4.5, 4.2, 2]],
  ['Lobo esquerdo, 1,5 por 4,2 por 3,2.', 'lobo_esquerdo_tireoide', [1.5, 4.2, 3.2]],
  ['Istmo, 1,5 por 2,0 por 5,3.', 'istmo_tireoide', [1.5, 2, 5.3]],
]) test(`medida clínica: ${text}`, () => {
  const hints = detectMeasurements(text, context);
  assert.equal(hints.length, 1);
  assert.equal(hints[0].structure, structure); assert.deepEqual(hints[0].values, values);
  assert.equal(hints[0].measurementType, 'dimensions3d'); assert.equal(hints[0].volume, undefined);
  const result = filterClinicalDictation(text, { ...context, measurementHints: hints });
  assert.equal(result.filteredText, text);
  assert.equal(result.segments[0].intent, 'report'); assert.equal(result.segments[0].reason, 'clinical_measurement');
  assert.ok(result.segments[0].clinicalScore >= 5);
  const prepared = prepareClinicalDictation(text, context, silent);
  assert.deepEqual(prepared.measurements[0].values, values); assert.equal(prepared.measurements[0].structure, structure);
  assert.equal(prepared.measurements[0].volume, undefined); assert.equal(prepared.measurements[0].unit, null);
});
for (const text of ['Olá, tá?', 'Vamos lá, tá?', 'Olá, né?', 'Tudo bem, ok?', 'Você já fez cirurgia?', 'Você tem istmo medindo 2 por 3?', 'Eu tenho lobo direito 2 por 3.', '2 por 3 por 4?', 'Lobo direito, tá?']) {
  test(`não protege conversa/pergunta: ${text}`, () => assert.equal(filterClinicalDictation(text, context).segments[0].includeInReport, false));
}
for (const separator of ['por', 'x', 'vezes']) {
  for (const values of [[2.5, 4.4], [2.5, 4.4, 2.1]]) {
    test(`sequência ${values.length} dimensões com ${separator}`, () => {
      const text = `Lobo direito, ${values.join(` ${separator} `)}?`;
      const [hint] = detectMeasurements(text, context);
      assert.deepEqual(hint.values, values);
      assert.equal(filterClinicalDictation(text, context).segments[0].intent, 'report');
    });
  }
}
for (const filler of ['tá', 'né', 'ok', 'certo']) test(`filler ${filler} só altera análise`, () => {
  const text = `Istmo, 2 x 3 x 4, ${filler}?`;
  assert.equal(stripTrailingFillers(text), 'Istmo, 2 x 3 x 4');
  assert.equal(filterClinicalDictation(text, context).filteredText, text);
  assert.equal(stripTrailingFillers('Ok, istmo 2 x 3.'), 'Ok, istmo 2 x 3.');
});
test('55,2 é preservado e apenas sinalizado para revisão', () => {
  const text = 'Dimensões do lobo direito, 55,2 por 4,2 por 5,4, tá?';
  const result = prepareClinicalDictation(text, context, silent);
  assert.equal(result.filteredText, text); assert.ok(result.text.includes('55,2'));
  assert.equal(result.filterDetails.measurementHints[0].suspiciousValue, true);
  assert.equal(result.measurements[0].values[0], 55.2); assert.equal(result.measurements[0].suspiciousValue, true);
});
test('spans mantêm decimais, repetições e acentos', () => {
  const text = 'Olá, tá? Lobo direito, 4.5 x 4.2 x 2.0. Istmo, 1,5 por 2,0 por 5,3.';
  const hints = detectMeasurements(text, context);
  assert.equal(hints.length, 2);
  assert.ok(text.slice(hints[0].start, hints[0].end).startsWith('Lobo direito'));
  assert.equal(filterClinicalDictation(text, context).segments.filter(s => s.includeInReport).length, 2);
});
test('estrutura de tireoide não é inferida em exame mama ou desconhecido', () => {
  for (const exam of [{ examName: 'Mama' }, {}, { examName: 'Mama', examContext: 'tireoide' }]) {
    assert.equal(filterClinicalDictation('Lobo direito, 2 por 3.', exam).segments[0].includeInReport, false);
  }
});
test('evidência clínica explícita supera somente pontuação', () => {
  assert.equal(filterClinicalDictation('Endométrio regular?', { examName: 'Transvaginal' }).segments[0].intent, 'report');
  assert.equal(filterClinicalDictation('Dimensões 2 por 3, certo?', context).segments[0].reason, 'clinical_measurement');
});
test('negação de comando continua prevalecendo sobre medidas', () => {
  const result = prepareClinicalDictation('Não tem nódulo sólido, medindo 2 por 3.', { examName: 'Mama' }, silent);
  assert.equal(result.filteredText, ''); assert.equal(result.filterDetails.segments[0].reason, 'negated_medical_command');
});
