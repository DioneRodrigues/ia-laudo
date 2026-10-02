import test from 'node:test';
import assert from 'node:assert/strict';
import { processMedicalCommands } from '../src/services/commandProcessor.js';

const load = () => {
  const logs = [];
  return { process: (text, details) => processMedicalCommands(text, details, { info: (message) => logs.push(message) }), logs };
};
const phrases = [
  'sem vascularização (Chammas I).',
  'nódulo apenas com vascularização periférica (Chammas II).',
  'nódulo com vascularização periférica e central. Periférica maior ou igual a central (Chammas III).',
  'nódulo com vascularização central e periférica. Predomínio da central (Chammas IV).',
  'nódulo apenas com vascularização central (Chammas V).',
];
for (const [input, expected] of [
  ['Chammas 1', phrases[0]],
  ['chamas 3', phrases[2]],
  ['Chammas três', phrases[2]],
  ['Nódulo A Chammas 2. Nódulo B Chammas 4.', `Nódulo A ${phrases[1]} Nódulo B ${phrases[3]}`],
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
  assert.ok(logs.includes('[Eden Voice] Alias detectado: "Chammas 3"'));
  assert.ok(logs.every((line) => line.startsWith('[Eden Voice]') && !line.includes('Contexto clínico privado')));
  process('Fígado normal.', details);
  assert.equal(details.count, 0);
  assert.equal(logs.at(-1), '[Eden Voice] Nenhum comando médico detectado');
});
