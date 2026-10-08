import test from 'node:test';
import assert from 'node:assert/strict';
import { processMedicalCommands, normalizeForMatch, aliasToFlexibleRegex, createMedicalCommandProcessor } from '../src/services/commandProcessor.js';

const load = () => {
  const logs = [];
  const logger = { info: (message) => logs.push(message), warn: (message) => logs.push(message) };
  return { process: (text, details) => processMedicalCommands(text, details, logger, { examName: 'Tireoide' }), logs, logger };
};
const phrases = [
  ', avascularizada ao efeito Doppler (Tipo I de Chammas).',
  ', ao efeito Doppler observa-se vascularização periférica (tipo II de Chammas)',
  ', ao efeito Doppler observa-se predomínio da vascularização periférica sobre a central (Tipo III de Chammas).',
  ', ao efeito Doppler observa-se predomínio da vascularização central sobre a periférica (Tipo IV de Chammas).',
  'nódulo apenas com vascularização central (Chammas V).',
];
for (const [input, expected] of [
  ['Chammas 1', phrases[0]],
  ['chamas 3', phrases[2]],
  ['Chammas três', phrases[2]],
  ['Nódulo A Chammas 2. Nódulo B Chammas 4.', `Nódulo A ${phrases[1]}. Nódulo B ${phrases[3]}`],
  ['Fígado normal.', 'Fígado normal.'],
  ['CHAMMAS 5', phrases[4]],
  ['Nódulo sólido. Chammas 3.', `Nódulo sólido. ${phrases[2]}`],
  ['Nódulo no lobo direito medindo 1,2 centímetros, Chammas 3.', `Nódulo no lobo direito medindo 1,2 centímetros, ${phrases[2]}`],
  ['Chammas 1 Chammas 1', `${phrases[0]} ${phrases[0]}`],
  ['préChammas 3 Chammas 30 Chammas iiia Chammas 3é _Chammas 2 Chammas 2_', 'préChammas 3 Chammas 30 Chammas iiia Chammas 3é _Chammas 2 Chammas 2_'],
  ['  Fígado: dimensões normais.\n', '  Fígado: dimensões normais.\n'],
  ['', ''],
]) {
  test(`processa ${JSON.stringify(input)}`, () => assert.equal(load().process(input), expected));
}

test('todos os aliases, incluindo romanos sem matches parciais', () => {
  const words = [['um'], ['dois'], ['três', 'tres'], ['quatro'], ['cinco']];
  const romans = ['i', 'ii', 'iii', 'iv', 'v'];
  const { process } = load();
  for (let i = 0; i < phrases.length; i++) {
    for (const spelling of ['chammas', 'chamas']) {
      for (const number of [String(i + 1), ...words[i]]) {
        assert.equal(process(`${spelling} ${number}`), phrases[i]);
      }
    }
    assert.equal(process(`CHAMMAS ${romans[i].toUpperCase()}`), phrases[i]);
  }
});

test('contagem por ocorrência e logs sem contexto clínico', () => {
  const { process, logs } = load();
  const details = {};
  process('Contexto clínico privado. Chammas 3. Chammas 3.', details);
  assert.equal(details.count, 2);
  assert.ok(logs.includes('[Eden Voice] Comandos aplicados: 2'));
  assert.ok(logs.includes('[Eden Voice] Alias correspondente: "chammas 3"'));
  assert.ok(logs.every((line) => line.startsWith('[Eden Voice]') && !line.includes('Contexto clínico privado')));
  process('Fígado normal.', details);
  assert.equal(details.count, 0);
  assert.equal(logs.at(-1), '[Eden Voice] Nenhum comando médico detectado');
});

const thyroid = 'Observa-se no @, uma imagem nodular sólida hipoecogênica, textura heterogênea, contendo fino halo anecóico periférico, contornos regulares, limites bem definidos, discreto reforço acústico posterior,';
for (const input of [
  'Nódulo sólido tireoide',
  'Nódulo sólido da tireoide.',
  'Nódulo sólido de tireoide.',
  'Nódulo sólido da tireóide.',
  'NODULO SOLIDO DA TIREOIDE',
  'Nódulo sólido, tireoide.',
  'Nódulo sólido. Tireóide',
  'Nódulo sólido - tireoide',
  'Nódulo\t sólido  da\n tireóide.',
  'Nódulo sólido da tireóide.',
]) {
  test(`tireoide: ${JSON.stringify(input)}`, () => {
    const details = {};
    assert.equal(load().process(input, details), thyroid + (input.endsWith('.') ? '.' : ''));
    assert.equal(details.count, 1);
    assert.equal(details.commands[0].id, 'tireoide-nodulo-padrao');
    assert.equal(details.commands[0].alias, 'nódulo sólido tireoide');
    assert.equal(details.commands[0].detectedText, input.replace(/\.$/u, ''));
    assert.equal(details.commands[0].replacement, thyroid);
  });
}

test('dois comandos sem reprocessar replacement e sem alterar espaços do restante', () => {
  const details = {};
  assert.equal(load().process('Nódulo sólido da tireoide. Chammas três.', details), `${thyroid}. ${phrases[2]}`);
  assert.deepEqual(details.commands.map(({ id }) => id), ['tireoide-nodulo-padrao', 'chammas-3']);
  assert.equal(details.count, 2);
});

test('três regras na mesma transcrição, em ordem diferente do catálogo', () => {
  const details = {};
  const flow = 'Doppler de tireóide evidência aumento do fluxo em parênquima com IR dentro do limites da normalidade';
  const result = load().process('Nódulo sólido da tireoide. Chammas três. Fluxo aumentado.', details);
  assert.equal(result, `${thyroid}. ${phrases[2]} ${flow}.`);
  assert.equal(details.count, 3);
  assert.deepEqual(details.commands.map(({ id, detectedText }) => ({ id, detectedText })), [
    { id: 'tireoide-nodulo-padrao', detectedText: 'Nódulo sólido da tireoide' },
    { id: 'chammas-3', detectedText: 'Chammas três' },
    { id: 'tireoide-doppler-fluxo-aumentado', detectedText: 'Fluxo aumentado' },
  ]);
});

test('mesmo comando repetido produz duas substituições e duas entradas completas', () => {
  const details = {};
  const result = load().process('Chammas 3 no nódulo direito e Chammas 3 no nódulo esquerdo.', details);
  assert.equal(result, `${phrases[2]} no nódulo direito e ${phrases[2]} no nódulo esquerdo.`);
  assert.equal(details.count, 2);
  assert.deepEqual(details.commands, Array.from({ length: 2 }, () => ({
    id: 'chammas-3', label: 'Tireoide - Chammas III', alias: 'chammas 3',
    detectedText: 'Chammas 3', replacement: phrases[2],
  })));
});

test('aliases diferentes da mesma regra também são contados por ocorrência', () => {
  const details = {};
  const result = load().process('Chammas três. chamas 3. CHAMMAS III.', details);
  assert.equal(result, `${phrases[2]} ${phrases[2]} ${phrases[2]}`);
  assert.equal(details.count, 3);
  assert.equal(details.commands.length, 3);
  assert.ok(details.commands.every(({ id }) => id === 'chammas-3'));
  assert.deepEqual(details.commands.map(({ detectedText }) => detectedText), ['Chammas três', 'chamas 3', 'CHAMMAS III']);
  assert.deepEqual(details.commands.map(({ alias }) => alias), ['chammas três', 'chamas 3', 'chammas iii']);
});

test('normaliza somente a comparação', () => {
  for (const input of ['Nódulo sólido tireoide', 'Nódulo sólido da tireóide.', 'NÓDULO SÓLIDO, TIREOIDE']) {
    assert.equal(normalizeForMatch(input), 'nodulo solido tireoide');
  }
  assert.equal(normalizeForMatch('PÓLIPO'), 'polipo');
  assert.equal(normalizeForMatch(), '');
  const { process } = load();
  for (const text of ['Fígado com dimensões normais.', '  Fígado de dimensões normais.\nAcentuação: áéíóú ç. 🩺', 'Fígado normal.']) {
    const details = {};
    assert.equal(process(text, details), text);
    assert.equal(details.count, 0);
    assert.deepEqual(details.commands, []);
    assert.equal(details.exam.contextId, 'tireoide');
  }
});

test('offsets preservam original com emoji, acento decomposto e pontuação ao redor', () => {
  const input = '🩺 Fígado normal! [Nódulo sólido da tireóide.]  É isso.\n';
  assert.equal(load().process(input), `🩺 Fígado normal! [${thyroid}.]  É isso.\n`);
});

test('não aceita termos adicionais, erros de grafia, números maiores ou palavras parciais', () => {
  for (const input of [
    'Nódulo não sólido da tireoide.', 'Nódulo sólido suspeito da tireoide.',
    'Nódulo sólido de da tireoide.', 'Nódulo solidoz tireoide.',
    'Nódulos sólidos da tireoide.', 'Nódulo sólido da paratireoide.',
    'Nódulo sólido/tireoide.', 'Nódulo sólido + tireoide.',
    'prémioma miomatoso miomaé _mioma mioma_ 2mioma',
    'cistocele microcisto cistoscopia', 'Chammas 3.5 Chammas 3,5 Chammas 30 Chammas iiia',
  ]) assert.equal(load().process(input), input);
});

test('regex flexível é por alias, escapa metacaracteres e rejeita alias vazio', () => {
  assert.ok(aliasToFlexibleRegex('nódulo sólido tireoide').test('nodulo solido da tireoide'));
  assert.equal(aliasToFlexibleRegex(' da . de '), null);
  assert.ok(aliasToFlexibleRegex('termo a+b').test('termo a+b'));
  assert.equal(aliasToFlexibleRegex('termo a+b').test('termo aaab'), false);
});

test('ligações permitidas, pontuação e aliases explícitos em motor genérico', () => {
  const { logger } = load();
  const process = createMedicalCommandProcessor([{ id: 'custom', exams: ['global'], aliases: ['pólipo endometrial', 'imagem padrão'], replacement: 'Frase íntegra.' }]);
  for (const link of ['', 'da ', 'de ', 'do ', 'das ', 'dos ']) {
    assert.equal(process(`PÓLIPO ${link}endometrial`, {}, logger), 'Frase íntegra.');
  }
  for (const punctuation of [',', '.', ';', ':', '!', '?', '-', '–', '—', '(', ')', '[', ']', '{', '}', '“', '”']) {
    assert.equal(process(`pólipo ${punctuation} endometrial`, {}, logger), 'Frase íntegra.');
  }
  assert.equal(process('Imagem padrão', {}, logger), 'Frase íntegra.');
  assert.equal(process('pólipo para endometrial', {}, logger), 'pólipo para endometrial');
});

test('duplicados entre regras avisam e a primeira vence, inclusive após normalização', () => {
  const { logger, logs } = load();
  const process = createMedicalCommandProcessor([
    { id: 'command-a', exams: ['global'], aliases: ['pólipo endometrial', 'polipo endometrial'], replacement: 'Primeira.' },
    { id: 'command-b', exams: ['global'], aliases: ['pólipo endometrial', 'pólipo do endometrial', 'outro alias'], replacement: 'Segunda.' },
  ]);
  const details = {};
  assert.equal(process('Pólipo do endometrial. Outro alias.', details, logger), 'Primeira. Segunda.');
  assert.deepEqual(details.commands.map(({ id }) => id), ['command-a', 'command-b']);
  assert.ok(logs.includes('[Eden Voice] WARN: Alias duplicado "pólipo endometrial" entre command-a e command-b'));
  assert.ok(logs.includes('[Eden Voice] WARN: Alias duplicado "pólipo do endometrial" entre command-a e command-b'));
  assert.equal(logs.filter((line) => line.includes('Alias duplicado')).length, 2);
});

test('maior alias no mesmo ponto vence antes de alias genérico de outra regra', () => {
  const { logger } = load();
  const process = createMedicalCommandProcessor([
    { id: 'short', exams: ['global'], aliases: ['pólipo'], replacement: 'Curta.' },
    { id: 'long', exams: ['global'], aliases: ['pólipo na vesícula'], replacement: 'Longa.' },
  ]);
  const details = {};
  assert.equal(process('Pólipo na vesícula. Pólipo.', details, logger), 'Longa. Curta.');
  assert.deepEqual(details.commands.map(({ id }) => id), ['long', 'short']);
});

test('frase inserida que contém outro alias permanece literal, sem cascata', () => {
  const { logger } = load();
  const process = createMedicalCommandProcessor([
    { id: 'first', exams: ['global'], aliases: ['comando inicial'], replacement: 'Comando seguinte.' },
    { id: 'second', exams: ['global'], aliases: ['comando seguinte'], replacement: 'Não reexpandir.' },
  ]);
  const details = {};
  assert.equal(process('Comando inicial. Comando seguinte.', details, logger), 'Comando seguinte. Não reexpandir.');
  assert.equal(details.count, 2);
});

test('aliases prefixados do catálogo não deixam restos e rótulos são preservados', () => {
  const details = {};
  load().process('Cisto coloide da tireoide. Pólipo na vesícula.', details);
  assert.deepEqual(details.commands.map(({ id }) => id), ['tireoide-cisto']);
  assert.equal(details.commands[0].detectedText, 'Cisto coloide da tireoide');
  assert.equal(details.commands[0].label, 'Tireoide - Cisto');
});
