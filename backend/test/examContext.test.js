import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAM_CATALOG, resolveExamContext } from '../src/config/examCatalog.js';
import { MEDICAL_COMMANDS, processMedicalCommands, createMedicalCommandProcessor } from '../src/services/commandProcessor.js';
const silent = { info() {}, warn() {} };
for (const [examName, text, expected] of [
  ['Ultrassonografia das Mamas', 'Cisto simples', ['mama-cisto-simples']],
  ['Mamaria', 'Cisto simples', ['mama-cisto-simples']],
  ['  MAMÁRIA  ', 'Cisto simples', ['mama-cisto-simples']],
  ['Mamaria', 'Hemangioma. Chammas 3.', []],
  ['Ultrassonografia Transvaginal', 'Cisto simples', []],
  ['Abdome Total', 'Hemangioma', ['abdome-hemangioma']],
  ['Ultrassonografia das Mamas', 'Hemangioma', []],
  ['Ultrassonografia da Tireoide com Doppler', 'Chammas 3', ['chammas-3']],
  ['US XYZ 123', 'Cisto simples', []],
  [undefined, 'Cisto simples', []],
  ['Mama e Tireoide', 'Cisto simples', []],
  ['Mama', 'Nódulo sólido. Siliconoma.', ['mama-nodulo-solido', 'mama-siliconoma']],
]) test(`isolamento: ${examName} / ${text}`, () => {
  const details = {};
  const result = processMedicalCommands(text, details, silent, { examName });
  assert.deepEqual(details.commands.map(({ id }) => id), expected);
  assert.equal(details.count, expected.length);
  assert.equal(details.examResolution.source, 'automatic');
  if (!expected.length) assert.equal(result, text);
  else for (const id of expected) assert.ok(result.includes(MEDICAL_COMMANDS.find((c) => c.id === id).replacement));
});

test('resolução normaliza acentos, caixa e espaços, mas exige limites de palavras', () => {
  for (const exam of EXAM_CATALOG) for (const alias of exam.aliases) assert.equal(resolveExamContext(alias).id, exam.id);
  assert.equal(resolveExamContext('Mamaria').id, 'mama');
  assert.equal(resolveExamContext('Mamária').id, 'mama');
  assert.equal(resolveExamContext('  ULTRASSONOGRAFIA  da\nTireóide ').id, 'tireoide');
  for (const name of ['paratireoide', 'mamadeira', 'US ABD SUP X', '', null, {}, 123]) assert.equal(resolveExamContext(name).id, null);
  assert.deepEqual(resolveExamContext('Ultrassonografia de Abdome Total'), {
    id: 'abdome', label: 'Abdome', matchedAlias: 'ultrassonografia de abdome total', originalName: 'Ultrassonografia de Abdome Total',
  });
});

test('catálogo inteiro tem exams explícitos válidos', () => {
  const ids = new Set(EXAM_CATALOG.map(({ id }) => id).concat('global'));
  assert.equal(new Set(MEDICAL_COMMANDS.map(({ id }) => id)).size, MEDICAL_COMMANDS.length);
  for (const command of MEDICAL_COMMANDS) assert.ok(command.exams.length && command.exams.every((id) => ids.has(id)));
});

const rule = (id, exams, aliases = ['cisto simples']) => ({ id, label: id, exams, aliases, replacement: `${id}.` });
for (const [exams, conflict] of [[['transvaginal'], false], [['mama'], true], [['global'], true], [['tireoide', 'mama'], true]]) {
  test(`colisão contextual: mama / ${exams}`, () => {
    const warnings = [];
    const process = createMedicalCommandProcessor([rule('primeiro', ['mama']), rule('segundo', exams)]);
    const details = {};
    assert.equal(process('Cisto simples', details, { info() {}, warn: (m) => warnings.push(m) }, { examName: 'Mama' }), 'primeiro.');
    assert.equal(warnings.some((m) => m.includes('Alias duplicado')), conflict);
  });
}

test('exame desconhecido libera apenas global, sem escopo implícito para regras antigas', () => {
  const process = createMedicalCommandProcessor([rule('local', ['mama']), rule('global', ['global'], ['comando geral']), rule('sem-escopo', undefined, ['legado'])]);
  const warnings = [];
  assert.equal(process('Cisto simples. Comando geral. Legado.', {}, { info() {}, warn: (m) => warnings.push(m) }), 'Cisto simples. global. Legado.');
  assert.ok(warnings.some((m) => m.includes('Exame não reconhecido')));
  assert.ok(warnings.some((m) => m.includes('desabilitados por segurança')));
});

test('comando com vários exams só participa dos contextos declarados', () => {
  const process = createMedicalCommandProcessor([rule('compartilhado', ['mama', 'tireoide'])]);
  for (const examName of ['Mama', 'Tireoide']) assert.equal(process('Cisto simples', {}, silent, { examName }), 'compartilhado.');
  assert.equal(process('Cisto simples', {}, silent, { examName: 'Abdome' }), 'Cisto simples');
});

test('múltiplos comandos incluindo BI-RADS em catálogo de teste, sem cascata', () => {
  // Fixture do motor: texto BI-RADS de produção aguarda material original.
  const process = createMedicalCommandProcessor([rule('nodulo', ['mama'], ['nódulo sólido']), rule('birads', ['mama'], ['BI-RADS 2'])]);
  const details = {};
  assert.equal(process('Nódulo sólido. BI-RADS 2.', details, silent, { examName: 'Mama' }), 'nodulo. birads.');
  assert.equal(details.count, 2);
});
