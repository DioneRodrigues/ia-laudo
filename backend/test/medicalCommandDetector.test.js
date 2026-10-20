import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMedicalCommands } from '../src/services/medicalCommandDetector.js';
import { filterClinicalDictation } from '../src/services/clinicalDictationFilter.js';
import { prepareClinicalDictation } from '../src/services/clinicalPipeline.js';
import { processMedicalCommands, MEDICAL_COMMANDS } from '../src/services/commandProcessor.js';
const mama = { examName: 'Mama' };
const silent = { info() {}, warn() {} };
function run(text, context = mama) {
  const prepared = prepareClinicalDictation(text, context, silent);
  const details = {};
  const output = processMedicalCommands(prepared.text, details, silent, context);
  return { ...prepared, output, details };
}
for (const [text, id] of [
  ['Siliconoma, ok.', 'mama-siliconoma'], ['Siliconeoma, ok.', 'mama-siliconoma'],
  ['Cisto simples, ok.', 'mama-cisto-simples'], ['Diagnóstico BI-RADS 1.', 'mama-birads-1'],
]) test(`protege ${text}`, () => {
  const result = run(text);
  assert.equal(result.filteredText, text);
  assert.equal(result.filterDetails.segments[0].reason, 'medical_command');
  assert.deepEqual(result.details.commands.map(c => c.id), [id]);
});
for (const prefix of ['Não tem', 'nao apresenta', 'Não há', 'Ausência de', 'Sem', 'Não, não tem']) {
  test(`negação: ${prefix}`, () => {
    const text = `${prefix} nódulo sólido.`;
    const result = run(text);
    assert.equal(detectMedicalCommands(text, mama).commands[0].negated, true);
    assert.equal(result.filteredText, '');
    assert.equal(result.filterDetails.segments[0].reason, 'negated_medical_command');
    const details = {};
    assert.equal(processMedicalCommands(text, details, silent, mama), text);
    assert.equal(details.count, 0);
  });
}
test('alias negativo autorizado; negação externa ainda bloqueia', () => {
  const context = { examName: 'Tireoide' };
  assert.equal(MEDICAL_COMMANDS.find(c => c.id === 'chammas-1').allowNegatedContext, true);
  assert.equal(run('Sem vascularização.', context).details.count, 1);
  assert.equal(run('Não está sem vascularização.', context).details.count, 0);
});
test('conversa sem comando', () => {
  const segment = filterClinicalDictation('Tony, você é muito lindo.', mama).segments[0];
  assert.equal(segment.intent, 'conversation'); assert.equal(segment.includeInReport, false);
});
test('múltiplos comandos em conversa com spans originais e sem substituição', () => {
  const text = 'E, siliconeoma, cisto simples.';
  const detected = detectMedicalCommands(text, mama);
  assert.equal(detected.count, 2);
  for (const c of detected.commands) {
    assert.equal(text.slice(c.start, c.end), c.detectedText);
    assert.equal(c.negated, false); assert.equal(c.replacement, undefined);
  }
  assert.equal(run(text).details.count, 2);
});
test('contexto restringe proteção; nome de exame prevalece sobre ID divergente', () => {
  assert.equal(detectMedicalCommands('Esteatose leve.', mama).count, 0);
  assert.equal(detectMedicalCommands('Siliconoma.', {}).count, 0);
  assert.equal(detectMedicalCommands('Siliconoma.', { examContext: 'mama' }).count, 1);
  assert.equal(detectMedicalCommands('Siliconoma.', { examName: 'Abdome', examContext: 'mama' }).count, 0);
});
test('unicode decomposto, repetições, alias mais longo e limites de palavra', () => {
  const text = 'Nódulo sólido-cístico. Nódulo sólido. Siliconomas.'.normalize('NFD');
  const candidates = detectMedicalCommands(text, mama).commands;
  assert.deepEqual(candidates.map(c => c.id), ['mama-nodulo-solido-cistico', 'mama-nodulo-solido']);
  for (const c of candidates) assert.equal(c.detectedText, text.slice(c.start, c.end));
  assert.equal(detectMedicalCommands('Siliconoma. Siliconoma.', mama).count, 2);
});
test('negação distante ou em outra frase não bloqueia', () => {
  for (const text of ['Sem dor. Cisto simples.', 'Não apresenta dor mas cisto simples.', 'Não há qualquer alteração na região previamente examinada e documentada pela equipe médica. Cisto simples.']) {
    assert.equal(detectMedicalCommands(text, mama).commands[0].negated, false);
  }
});
test('frase mista nunca expande candidato negado', () => {
  const result = run('Cisto simples, mas não tem nódulo sólido.');
  assert.deepEqual(result.details.commands.map(c => c.id), ['mama-cisto-simples']);
  assert.ok(result.output.includes('não tem nódulo sólido'));
});
test('exemplo completo: conversa excluída e três comandos preservados', () => {
  const result = run('Cara, eu tô aqui vendo a gravação da última... Pô, Lula... E, siliconeoma, cisto simples, mama esquerda sem alterações, mama direita também. Diagnóstico BI-RADS 1.');
  assert.equal(result.details.count, 3);
  assert.ok(!result.filteredText.includes('Cara')); assert.ok(!result.filteredText.includes('Lula'));
  assert.ok(result.filteredText.includes('mama direita também'));
});
test('exemplo com correção negativa não executa nódulo', () => {
  const result = run('Tá, nódulo hipoecoico. Não, não tem nódulo hipoecoico. Cisto simples, ok. Siliconoma, ok. Birads 1, ok. Tony, você vem aqui, bebezinho de pai...');
  assert.deepEqual(result.details.commands.map(c => c.id), ['mama-cisto-simples', 'mama-siliconoma', 'mama-birads-1']);
});
