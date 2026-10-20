import test from 'node:test';
import assert from 'node:assert/strict';
import { filterClinicalDictation } from '../src/services/clinicalDictationFilter.js';
import { parseMeasurements } from '../src/services/measurementParser.js';
import { calculateMeasurements } from '../src/services/measurementCalculator.js';
import { prepareClinicalDictation } from '../src/services/clinicalPipeline.js';
const context = { examContext: 'abdome' };
const silent = { info() {}, warn() {} };
for (const [text, expected] of [
  ['Você já fez cirurgia?', false], ['Sim, fiz cirurgia ano passado.', false],
  ['Encha bem o peito de ar e prenda a respiração.', false], ['Ausência da vesícula.', true],
  ['Paciente refere colecistectomia prévia.', true], ['Colédoco medindo 3,3 milímetros.', true],
  ['Pode ir ao banheiro e depois voltar.', false], ['Eu tenho um nódulo.', false],
  ['Você tem nódulo', false], ['Tive, mas a biópsia não deu nada.', false],
  ['Rim direito da senhora também tá legal.', false], ['Pode se vestir.', false],
  ['Bom dia.', false], ['BI-RADS 2.', true], ['Sem vascularização ao Doppler.', true],
]) test(`filtro: ${text}`, () => assert.equal(filterClinicalDictation(text, context).segments[0].includeInReport, expected));
test('mistura preserva original e exclui conversas', () => {
  const original = 'Você já fez cirurgia? Sim, fiz ano passado. Ausência da vesícula. Colédoco medindo 3,3 milímetros.';
  const result = prepareClinicalDictation(original, context, silent);
  assert.equal(result.filteredText, 'Ausência da vesícula. Colédoco medindo 3,3 milímetros.');
  assert.equal(result.filterDetails.segments.map(s => s.text).join(' '), original);
  assert.equal(result.filterDetails.ignoredSegments, 2);
});
const measure = (text, examContext = 'abdome') => calculateMeasurements(parseMeasurements(text, { examContext }), examContext);
test('colédoco linear sem volume', () => {
  const [m] = measure('Colédoco mede 3,3 milímetros');
  assert.equal(m.value, 3.3); assert.equal(m.unit, 'mm'); assert.equal(m.volume, undefined);
});
test('rim direito com eixos e unidade padrão explícita', () => {
  const [m] = measure('Rim direito 11 longitudinal, 4,3 AP, 4,8 transversal');
  assert.deepEqual(m.values, [11, 4.3, 4.8]); assert.equal(m.volume, 118.7);
  assert.deepEqual(m.axes, { longitudinal: 11, anteroposterior: 4.3, transverse: 4.8 });
});
test('rim esquerdo depois das medidas', () => {
  const [m] = measure('11,4 longitudinal, 4,7 anteroposterior, 4,9 transversal, rim esquerdo');
  assert.equal(m.structure, 'rim_esquerdo'); assert.equal(m.volume, 137.3);
});
test('números por extenso', () => {
  const [m] = measure('medindo dois vírgula três por um vírgula sete por zero vírgula oito centímetros');
  assert.deepEqual(m.values, [2.3, 1.7, 0.8]); assert.equal(m.volume, undefined);
});
for (const text of ['Rim direito 2 x 3 cm', '2 x 3 x 4 cm', 'distando 3 cm do mamilo', 'Rim direito 2 longitudinal, 3 AP, 4 AP', 'Rim direito 2 x 3 x 4 x 5 cm', 'Rim direito 0 x 3 x 4 cm', 'Rim direito 2 cm longitudinal, 3 mm AP, 4 cm transversal', 'Rim direito e rim esquerdo 2 x 3 x 4 cm']) {
  test(`sem volume inseguro: ${text}`, () => assert.ok(measure(text).every(m => m.volume === undefined)));
}
test('exame incorreto e desconhecido não autorizam volume', () => {
  for (const exam of ['mama', null]) assert.equal(measure('Rim direito 2 x 3 x 4 cm', exam)[0].volume, undefined);
});
test('mm convertido para cm³', () => assert.equal(measure('Rim direito 110 x 43 x 48 mm')[0].volume, 118.7));
test('exemplo real misto: ambos os rins', () => {
  const r = prepareClinicalDictation('Rim direito da senhora também tá legal. 11,0 longitudinal, 4,3 ântero-posterior, 4,8 transversal, normal o volume do rim direito. 11,4 longitudinal, 4,7 anteroposterior, 4,9 transversal, rim esquerdo.', context, silent);
  assert.equal(r.measurements.length, 2); assert.deepEqual(r.measurements.map(m => m.volume), [118.7, 137.3]);
  assert.ok(r.text.includes('118,7 cm³')); assert.ok(!r.text.includes('senhora'));
});
test('normaliza separadores e números por extenso na saída', () => {
  const result = prepareClinicalDictation('Medindo dois vírgula três por um vírgula sete por zero vírgula oito centímetros.', context, silent);
  assert.ok(result.text.includes('2,3 x 1,7 x 0,8'));
});
test('janela anterior de estrutura sem transferir contexto entre órgãos', () => {
  assert.equal(measure('Rim direito. 11 longitudinal, 4,3 AP, 4,8 transversal.')[0].volume, 118.7);
  assert.equal(measure('Rim direito. Cisto. 2 x 3 x 4 cm.')[0].volume, undefined);
});

test('lesão renal e dimensão negativa não geram volume do rim', () => {
  for (const text of ['Rim direito com cisto 2 x 3 x 4 cm', 'Rim direito -2 x 3 x 4 cm']) assert.equal(measure(text)[0].volume, undefined);
});
